"""Bao, the sky-whale calf -> public/assets/models/whale.glb (see docs/ART-CONTRACT.md).

One smooth lofted body (a superellipse cross-section swept along the length, its top pressed into a
gently domed deck with a smooth minimum), a moss mat with a scalloped rolled rim and tiny flowers, big
glossy eyes, pink cheeks, a smile, spots, fins and a fluke. glTF space: head toward +Z, deck at y = 0.

    blender -b --factory-startup --python art/blender/kit/build_whale.py -- [--render]

Nodes under the root `whale`: body, tail (pivot at the tail root, child marker tailtip), fin_l, fin_r
(pivots at the fin roots), eye_l, eye_r (centred on each eye), markers mouth and blowhole.
The moss and the face decals are ray-cast onto the real body mesh, so nothing sinks into it.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Matrix  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from kit_cast import (FWD, UP, Cast, Geo, Pchip, Vector, args, ellipsoid, fan, frame, grid_faces, iso_split, pal,  # noqa: E402
                      sheet, smin, smoothstep, sp, style, tube, wing)

FILE = 'whale'
BUDGET = 14000
N_ANG = 52                  # segments around the body
ZT = -9.5                   # tail pivot plane (the tail root)
ZC, ZN = 6.4, 10.7          # the round head cap starts at ZC and closes at the nose tip ZN
CAP_P = 2.9
E = 2 / 2.5                 # superellipse exponent of the cross-section (2/n)
DECK_A, DECK_B = 4.4, 8.0   # walkable ellipse half-axes (x, z)
MOSS_T = 0.09               # moss thickness over the body
K_TOP = 1.0                 # smooth-min width where the flank meets the deck

# Cross-section controls along the length: z, half-width A, waist height Yw, top and bottom half-heights.
BODY = Pchip([
    (-11.2, 0.62, -1.20, 0.52, 0.55),
    (-10.6, 0.80, -1.25, 0.70, 0.74),
    (-9.5, 1.30, -1.38, 1.10, 1.16),
    (-8.5, 2.05, -1.58, 1.85, 1.85),
    (-7.4, 2.85, -1.80, 2.75, 2.35),
    (-6.0, 3.75, -1.98, 3.65, 2.85),
    (-3.5, 4.48, -2.10, 4.65, 3.55),
    (-0.5, 4.80, -2.18, 5.05, 4.05),
    (2.5, 4.90, -2.25, 5.15, 4.28),
    (5.0, 4.85, -2.30, 5.15, 4.30),
    (7.0, 4.65, -2.28, 5.10, 4.22),
    (11.0, 4.45, -2.20, 4.90, 4.05),
])


def section(z):
    A, Yw, Ht, Hb = BODY(z)
    if z > ZC:
        u = min(1.0, (z - ZC) / (ZN - ZC))
        f = max(0.0, 1 - u ** CAP_P) ** (1 / CAP_P)
        A, Ht, Hb = A * f, Ht * f, Hb * f
    return A, Yw, Ht, Hb


def deck_q(x, z):
    return (x / DECK_A) ** 2 + (z / DECK_B) ** 2


def dome(x, z):
    """The ideal moss-top height: gently domed inside the walk ellipse, rolling off faster outside it
    (more gently over the forehead, so the head stays round)."""
    q = deck_q(x, z)
    y = 0.08 - 0.12 * q
    if q > 1:
        y -= (1.9 - 0.75 * smoothstep(6.0, 9.0, z)) * (q - 1) ** 1.5
    return y


def clamp_top(x, z):
    """Upper limit of the body (under the moss). It lets go behind the deck so the tail stock stays round."""
    return dome(x, z) - MOSS_T + 6.0 * smoothstep(-8.3, -9.6, z)


def P(z, th):
    A, Yw, Ht, Hb = section(z)
    s, c = math.sin(th), math.cos(th)
    x = A * sp(s, E)
    y = Yw + (Ht if c > 0 else Hb) * sp(c, E)
    return Vector((x, smin(y, clamp_top(x, z), K_TOP + 1.3 * smoothstep(8.4, 10.6, z)), z))


def axis_y(z):
    return section(z)[1]


def N(z, th, eps=1e-3):
    a = P(z, th + eps) - P(z, th - eps)
    b = P(z + eps, th) - P(z - eps, th)
    n = a.cross(b)
    if n.length < 1e-9:
        return Vector((0, 0, 1))
    n.normalize()
    if n.dot(P(z, th) - Vector((0, axis_y(z), z))) < 0:
        n = -n
    return n


# ------------------------------------------------------------------ materials
M = {}


def materials():
    M.update(
        whale=pal('whale', 0.45), dark=pal('whale_dark', 0.45), spot=pal('whale_spot', 0.45),
        belly=pal('whale_belly', 0.5), cheek=pal('cheek', 0.6), teal=pal('teal', 0.45),
        moss=pal('moss', 0.85), moss_dark=pal('moss_dark', 0.85), moss_light=pal('moss_light', 0.85),
        white=pal('white', 0.25), night=pal('night', 0.2), sun=pal('sun', 0.5), rose=pal('rose', 0.5),
        blossom=pal('blossom', 0.5), tangerine=pal('tangerine', 0.5), berry=pal('berry', 0.5),
    )


# ------------------------------------------------------------------ body
def z_stations(z0, z1, step):
    n = max(2, int(round(abs(z1 - z0) / step)))
    return [z0 + (z1 - z0) * i / n for i in range(n + 1)]


def ring(z):
    return [P(z, math.tau * j / N_ANG) for j in range(N_ANG)]


def ball_rings(z, direction, depth, count):
    """Rings that close the section at z into a dome toward `direction` (+1 forward, -1 back)."""
    base = ring(z)
    cy = sum(p.y for p in base) / len(base)
    cen = Vector((0, cy, z))
    out = []
    for k in range(1, count + 1):
        a = (math.pi / 2) * k / (count + 1)
        out.append([cen + (p - cen) * math.cos(a) + Vector((0, 0, direction * depth * math.sin(a))) for p in base])
    return out, cen + Vector((0, 0, direction * depth)), cen


def tube_mesh(rows, start_pole, end_pole, m):
    g = Geo()
    idx = [[g.vert(p) for p in r] for r in rows]
    grid_faces(g, idx, m)
    fan(g, g.vert(start_pole), idx[0], m)
    fan(g, g.vert(end_pole), idx[-1], m, reverse=True)
    return g.outward()


def body_geo():
    zs = z_stations(ZT, ZC, 0.56)
    zs += [ZC + (ZN - ZC) * math.sin((math.pi / 2) * k / 12) for k in range(1, 12)]
    back, back_pole, _ = ball_rings(ZT, -1, 1.15, 3)
    rows = list(reversed(back)) + [ring(z) for z in zs]
    return tube_mesh(rows, back_pole, Vector((0, axis_y(ZN), ZN)), M['whale'])


def patch(zc, thc, rz, rth, m, segs=12, lift=0.035, dome_h=0.03, rows=2):
    """A domed patch laid on the body in (z, angle) space (the spots)."""
    g = Geo()
    c = g.vert(P(zc, thc) + N(zc, thc) * (lift + dome_h))
    rings = []
    for r in range(1, rows + 1):
        t = r / rows
        row = []
        for j in range(segs):
            a = math.tau * j / segs
            z, th = zc + rz * t * math.cos(a), thc + rth * t * math.sin(a)
            h = lift + dome_h * (1 - t * t) if r < rows else -0.02
            row.append(g.vert(P(z, th) + N(z, th) * h))
        rings.append(row)
    fan(g, c, rings[0], m)
    grid_faces(g, rings, m)
    return g.toward(lambda p: p - Vector((0, axis_y(p.z), p.z)))


SPOTS = [  # (z, angle deg, radius m) on each side (mirrored), upper flanks and head
    (-6.4, 80, 0.5), (-4.8, 88, 0.7), (-3.0, 81, 0.46), (-2.2, 94, 0.4), (-0.6, 85, 0.62), (1.0, 91, 0.46),
    (4.4, 85, 0.52), (-7.6, 94, 0.4), (-5.6, 99, 0.34), (5.9, 93, 0.32),
    (9.35, 36, 0.3), (9.85, 50, 0.22), (8.95, 50, 0.2),     # freckles on the forehead
]


def spots_geo():
    g = Geo()
    for side in (1, -1):
        for z, deg, r in SPOTS:
            A = section(z)[0]
            g.add(patch(z, side * math.radians(deg), r, r / max(A, 1.0) * 1.05, M['spot'], segs=12))
    return g


# ------------------------------------------------------------------ surface queries
class Surf:
    """Ray queries against the real (faceted) body mesh, so the moss and decals never sink into it."""

    def __init__(self, g):
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in g.v], [list(f) for f in g.f])

    def cast(self, origin, d):
        d = Vector(d).normalized()
        loc, n, _, _ = self.bvh.ray_cast(Vector(origin), d, 200.0)
        if loc is None:
            return None, None
        if n.dot(d) > 0:
            n = -n
        return loc, n

    def down(self, x, z):
        return self.cast((x, 30.0, z), (0, -1, 0))

    def front(self, x, y):
        return self.cast((x, y, 40.0), (0, 0, -1))


def proj_patch(surf, origin, du, dv, d, rx, ry, m, segs=14, rows=2, lift=0.03, dome_h=0.03):
    """A domed patch: an ellipse in a plane (centre origin, axes du/dv) projected along d onto the body."""
    o, du, dv, d = Vector(origin), Vector(du), Vector(dv), Vector(d).normalized()
    g = Geo()
    loc, n = surf.cast(o, d)
    c = g.vert(loc + n * (lift + dome_h))
    rings = []
    for r in range(1, rows + 1):
        t = r / rows
        row = []
        for j in range(segs):
            a = math.tau * j / segs
            q, qn = surf.cast(o + du * (math.cos(a) * rx * t) + dv * (math.sin(a) * ry * t), d)
            h = lift + dome_h * (1 - t * t) if r < rows else -0.03
            row.append(g.vert(q + qn * h))
        rings.append(row)
    fan(g, c, rings[0], m)
    grid_faces(g, rings, m)
    return g.toward(lambda p: -d)


# ------------------------------------------------------------------ moss deck
RIM_X, RIM_Z = 1.04, 1.08


def rim(phi):
    return 1.0 + 0.018 * math.sin(9 * phi) + 0.009 * math.sin(5 * phi + 1.3) + 0.007 * math.sin(14 * phi + 0.4)


def moss_xz(fr, phi):
    r = fr * rim(phi)
    return r * RIM_X * DECK_A * math.cos(phi), r * RIM_Z * DECK_B * math.sin(phi)


def moss_geo(surf):
    NA = 72
    g = Geo()

    def top(x, z):
        loc, _ = surf.down(x, z)
        return (loc.y if loc is not None else dome(x, z) - MOSS_T - 0.4) + MOSS_T

    rows = []
    for fr in (0.18, 0.38, 0.56, 0.71, 0.83, 0.92, 0.975, 1.0):
        row = []
        for j in range(NA):
            x, z = moss_xz(fr, math.tau * j / NA)
            wob = 0.012 * math.sin(3.1 * x + 1.7 * z) * (1 - fr)
            row.append(g.vert((x, top(x, z) + wob, z)))
        rows.append(row)
    roll = []
    for out_fr, drop in ((1.012, 0.06), (1.017, 0.16)):
        row = []
        for j in range(NA):
            x, z = moss_xz(out_fr, math.tau * j / NA)
            row.append(g.vert((x, top(x, z) - drop, z)))
        roll.append(row)
    under = []
    for j in range(NA):
        x, z = moss_xz(0.985, math.tau * j / NA)
        under.append(g.vert((x, top(x, z) - MOSS_T - 0.3, z)))
    centre = g.vert((0, top(0, 0), 0))
    centre_under = g.vert((0, top(0, 0) - MOSS_T - 0.3, 0))
    fan(g, centre, rows[0], M['moss'])
    grid_faces(g, rows, M['moss'])
    grid_faces(g, [rows[-1]] + roll, M['moss_dark'])
    grid_faces(g, [roll[-1], under], M['moss_dark'])
    fan(g, centre_under, under, M['moss_dark'], reverse=True)
    return g.outward(), top


def flower(c, n, r, petal, centre_m, seed):
    rng = random.Random(seed)
    R = frame(n, FWD)          # local z = surface normal
    g = Geo()
    a0 = rng.uniform(0, math.tau)

    def at(x, y, h):
        return c + R @ Vector((x, y, h))
    ci = g.vert(at(0, 0, 0.035))
    ring_ = []
    for j in range(10):
        a = a0 + math.tau * j / 10
        rr = r if j % 2 == 0 else r * 0.45
        ring_.append(g.vert(at(math.cos(a) * rr, math.sin(a) * rr, 0.012 if j % 2 == 0 else 0.022)))
    fan(g, ci, ring_, petal)
    hub = [g.vert(at(math.cos(a0 + math.tau * j / 5 + 0.3) * r * 0.32, math.sin(a0 + math.tau * j / 5 + 0.3) * r * 0.32,
                     0.045)) for j in range(5)]
    fan(g, g.vert(at(0, 0, 0.065)), hub, centre_m)
    nn = Vector(n)
    return g.toward(lambda p: nn)


def flowers_geo(top):
    rng = random.Random(21)
    g = Geo()
    petals = [M['rose'], M['white'], M['sun'], M['blossom'], M['tangerine'], M['white'], M['rose'], M['berry']]
    n = 64
    for i in range(n):
        phi = math.tau * (i + rng.uniform(-0.3, 0.3)) / n
        fr = rng.uniform(0.85, 0.965)
        for k, (dfr, dphi, size) in enumerate(((0, 0, rng.uniform(0.13, 0.18)), (-0.035, 0.025, 0.11))):
            if k == 1 and rng.random() > 0.4:
                continue
            x, z = moss_xz(fr + dfr, phi + dphi)
            if z > 7.8 and abs(x) < 1.3:   # keep the blowhole lip clear
                continue
            nrm = Vector((top(x - 0.05, z) - top(x + 0.05, z), 0.1, top(x, z - 0.05) - top(x, z + 0.05))).normalized()
            petal = petals[(i + 3 * k) % len(petals)]
            centre_m = M['sun'] if petal is not M['sun'] else M['white']
            g.add(flower(Vector((x, top(x, z), z)), nrm, size, petal, centre_m, i * 7 + k))
    return g


def tufts_geo(top):
    """A few low, lighter moss cushions across the deck (flat enough to walk over)."""
    rng = random.Random(5)
    g = Geo()
    for i in range(14):
        phi = rng.uniform(0, math.tau)
        fr = math.sqrt(rng.uniform(0.04, 0.8))
        x, z = moss_xz(fr, phi)
        for k in range(2):
            rr = rng.uniform(0.3, 0.55) * (1 - 0.35 * k)
            ox, oz = (rng.uniform(-0.45, 0.45), rng.uniform(-0.45, 0.45)) if k else (0, 0)
            g.add(ellipsoid((x + ox, top(x + ox, z + oz) - 0.03, z + oz), (rr, 0.07, rr * rng.uniform(0.8, 1.2)), 11, 3,
                            Matrix.Rotation(rng.uniform(0, 3), 3, 'Y'), M['moss_light']))
    return g


# ------------------------------------------------------------------ face
EYE_Z, EYE_TH = 8.7, math.radians(66)
EYE_R = (0.8, 0.95, 0.52)       # white: right, up, depth
EYE_SINK = 0.33


def eye_dir(side):
    n = N(EYE_Z, side * EYE_TH)
    return (n * 0.65 + FWD * 0.7 + UP * 0.02).normalized()


def eye_centre(side):
    return P(EYE_Z, side * EYE_TH) - eye_dir(side) * EYE_SINK


def eye_geo(side):
    d = eye_dir(side)
    c = eye_centre(side)
    R = frame(d, UP)
    g = Geo()
    g.add(ellipsoid(c, EYE_R, 16, 10, R, M['white']))
    fwd_local = R.transposed() @ FWD
    sx = 0.1 * (1 if fwd_local.x > 0 else -1)
    pc = c + R @ Vector((sx, -0.07, EYE_R[2] * 0.6))
    g.add(ellipsoid(pc, (0.5, 0.62, 0.24), 14, 8, R, M['night']))
    for (u, v, rr, sg) in ((0.19, 0.25, 0.17, 10), (-0.16, -0.2, 0.085, 8)):
        hc = pc + R @ Vector((u + sx * 0.4, v, 0.2))
        g.add(ellipsoid(hc, (rr, rr, rr * 0.5), sg, 5, R, M['white']))
    return g, c


def brow_geo(side):
    d = eye_dir(side)
    c = eye_centre(side)
    R = frame(d, UP)
    pts = []
    for k in range(7):
        a = math.radians(38 + 104 * k / 6)
        pts.append(c + R @ Vector((math.cos(a) * EYE_R[0] * 1.1, math.sin(a) * EYE_R[1] * 1.08 + 0.05, 0.12)))
    return tube(pts, [0.035, 0.06, 0.075, 0.08, 0.075, 0.06, 0.035], 6, M['dark'])


SMILE_W, SMILE_Y = 1.25, -3.55


def smile_y(x):
    u = min(1.0, abs(x) / SMILE_W)
    return SMILE_Y + 0.42 * u ** 2


def mouth_geo(surf):
    pts = []
    for k in range(15):
        x = SMILE_W * ((k / 14) * 2 - 1)
        loc, n = surf.front(x, smile_y(x))
        pts.append(loc + n * 0.03)
    radii = [0.045 + 0.06 * math.sin(math.pi * k / 14) ** 0.6 for k in range(15)]
    return tube(pts, radii, 6, M['night'])


def cheeks_geo(surf):
    g = Geo()
    for side in (1, -1):
        g.add(proj_patch(surf, (side * 2.55, -2.95, 40.0), (1, 0, 0), (0, 1, 0), (0, 0, -1), 0.62, 0.38, M['cheek'],
                         dome_h=0.04))
    return g


BLOW_Z = 8.95


def blowhole_geo(surf):
    g = Geo()
    g.add(proj_patch(surf, (0, 30, BLOW_Z), (1, 0, 0), (0, 0, 1), (0, -1, 0), 0.62, 0.42, M['spot'], lift=0.05,
                     dome_h=0.12))
    g.add(proj_patch(surf, (0, 30, BLOW_Z + 0.02), (1, 0, 0), (0, 0, 1), (0, -1, 0), 0.36, 0.16, M['night'], rows=1,
                     lift=0.18, dome_h=0.0))
    return g


def belly_line(c):
    """Cream below this height: a band along the bottom, rising to a cream chin under the smile at the front."""
    Yw, Hb = BODY(c.z)[1], BODY(c.z)[3]
    side_line = Yw - 0.62 * Hb
    w = smoothstep(7.4, 9.9, c.z)
    ax = abs(c.x)
    front_line = smile_y(c.x) - 0.02 if ax < SMILE_W else smile_y(SMILE_W) - 0.25 * (ax - SMILE_W)
    return side_line * (1 - w) + front_line * w


def belly_paint(g):
    iso_split(g, lambda p: p.y - belly_line(p), M['belly'], M['whale'])


# ------------------------------------------------------------------ fins and tail
FIN_Z, FIN_TH = 2.6, math.radians(103)


def fin_geo(side):
    root = P(FIN_Z, side * FIN_TH)
    n = N(FIN_Z, side * FIN_TH)
    out = Vector((side * 1.0, -0.55, -0.32)).normalized()
    chord = (FWD - out * FWD.dot(out)).normalized()
    thick = out.cross(chord)
    if thick.y < 0:
        thick = -thick
    span = Pchip([(-0.12, 2.0, 0.85, 0.0), (0.0, 2.2, 0.8, 0.0), (0.3, 2.75, 0.62, 0.3), (0.6, 2.55, 0.48, 0.7),
                  (0.82, 1.9, 0.36, 1.0), (0.94, 1.1, 0.26, 1.15), (1.0, 0.3, 0.12, 1.2)])
    L = 4.3
    st = []
    for s_ in (-0.12, 0.0, 0.12, 0.25, 0.4, 0.55, 0.7, 0.82, 0.9, 0.96, 1.0):
        c_, t_, sw = span(s_)
        centre = root - n * 0.3 + out * (s_ * L) - chord * sw - thick * (0.3 * s_ * s_)
        st.append((centre, chord, thick, c_, t_))
    g = wing(st, 14, M['teal'])
    for i, f in enumerate(g.f):
        if g.normal(f).dot(thick) < -0.3:
            g.m[i] = M['belly']
    return g, root - n * 0.1


def tail_geo():
    zs = z_stations(ZT, -10.95, 0.35)
    front, front_pole, cen = ball_rings(ZT, +1, 1.0, 3)
    back, back_pole, _ = ball_rings(zs[-1], -1, 0.5, 2)
    g = tube_mesh(list(reversed(front)) + [ring(z) for z in zs] + back, front_pole, back_pole, M['whale'])
    belly_paint(g)
    # fluke: a lofted lens across X, tips curling up a little
    yf = axis_y(-10.9) + 0.05
    lead = Pchip([(0.0, -10.25), (0.25, -10.5), (0.5, -10.9), (0.75, -11.45), (0.9, -11.85), (1.0, -12.15)])
    trail = Pchip([(0.0, -11.45), (0.12, -11.72), (0.3, -12.05), (0.55, -12.28), (0.8, -12.32), (0.93, -12.25),
                   (1.0, -12.15)])
    us = [1.0, 0.97, 0.9, 0.8, 0.68, 0.55, 0.42, 0.3, 0.19, 0.09, 0.0]
    xs = [-u for u in us] + [u for u in reversed(us[:-1])]
    st = []
    W = 3.75
    for xu in xs:
        u = abs(xu)
        zf, zb = lead(u)[0], trail(u)[0]
        if u >= 0.999:
            zf = zb = -12.18
        chord = max(0.12, zf - zb)
        th = 0.46 * (1 - u) + 0.14 * u
        st.append((Vector((xu * W, yf + 0.42 * u ** 2.2, (zf + zb) / 2)), FWD, UP, chord, th))
    fl = wing(st, 14, M['teal'])
    for i, f in enumerate(fl.f):
        if fl.normal(f).dot(UP) < -0.25:
            fl.m[i] = M['belly']
    g.add(fl)
    return g, cen


# ------------------------------------------------------------------ assemble
def build():
    style.reset_scene()
    materials()
    cast = Cast(FILE)
    root = cast.root('whale')
    shell = body_geo()
    belly_paint(shell)
    surf = Surf(shell)
    moss, top = moss_geo(surf)
    body = Geo().add(shell, moss, flowers_geo(top), tufts_geo(top), spots_geo(), mouth_geo(surf), cheeks_geo(surf),
                     blowhole_geo(surf))
    for side in (1, -1):
        body.add(brow_geo(side))
    cast.part(root, 'body', body, (0, 0, 0))
    cast.deck = Surf(body)
    tail, pivot = tail_geo()
    t = cast.part(root, 'tail', tail, pivot)
    cast.marker(t, 'tailtip', (0, axis_y(-10.9) + 0.05, -12.3))
    for side, name in ((1, 'fin_l'), (-1, 'fin_r')):
        fg, fp = fin_geo(side)
        cast.part(root, name, fg, fp)
    for side, name in ((1, 'eye_l'), (-1, 'eye_r')):
        eg, ec = eye_geo(side)
        cast.part(root, name, eg, ec)
    loc, n = surf.front(0, SMILE_Y + 0.25)
    cast.marker(root, 'mouth', loc + n * 0.3)
    loc, n = surf.down(0, BLOW_Z)
    cast.marker(root, 'blowhole', loc + Vector((0, 0.2, 0)))
    return cast


def deck_report(cast):
    """Ray-cast the finished body from above inside the walk ellipse (the contract: y = 0 +- 0.15)."""
    lo, hi, n = 1e9, -1e9, 0
    for i in range(-22, 23):
        for j in range(-40, 41):
            x, z = DECK_A * i / 22, DECK_B * j / 40
            if deck_q(x, z) <= 1.0:
                loc, _ = cast.deck.down(x, z)
                lo, hi, n = min(lo, loc.y), max(hi, loc.y), n + 1
    print(f'   deck: walk-ellipse top surface over {n} samples: min {lo:.3f}  max {hi:.3f}')
    return lo, hi


def render_previews(cast):
    sheet(cast, 'whale.png', size=(1600, 1000), elev=45, yaw=35, ground=None, ortho=30)
    sheet(cast, 'whale-front.png', size=(1200, 900), elev=12, yaw=8, ground=None, ortho=17)
    sheet(cast, 'whale-side.png', size=(1600, 800), elev=5, yaw=90, ground=None, ortho=27)


def main():
    cast = build()
    deck_report(cast)
    cast.export({'whale': BUDGET})
    if '--render' in args():
        render_previews(cast)


if __name__ == '__main__':
    main()
