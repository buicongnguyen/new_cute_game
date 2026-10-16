"""Cloudback garden trees: eight species in three stages, plus the moss plot.

Roots (see docs/ART-CONTRACT.md): <id>_sprout (0.4 m), <id>_young (~1 m), <id>_grown (1.6-3 m) for
puffberry, ropevine, cloudpear, chimewood, honeybun, glowplum, starfig, golden; and `plot`.
Every <id>_grown has a child mesh `fruits` holding all ripe fruit (golden: an empty `fruits` node).
The fruits child sits at the root origin with no transform, so its vertices are in tree space.

Run from the repository root:
    blender -b --factory-startup --python art/blender/kit/build_trees.py -- [--render]
"""
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_world as K  # noqa: E402
from kit_world import (LATS5, LATS6, LATS_MIN, RAD, TAU, Piece, Vector, attach, bez, blob, canopy, disc,  # noqa: E402
                       facing, ico0, lathe, leaf, leaf_frame, lobed, slab, star_outline, surface_point, tube, xf)
import style  # noqa: E402

FILE = 'trees.glb'
IDS = ['puffberry', 'ropevine', 'cloudpear', 'chimewood', 'honeybun', 'glowplum', 'starfig', 'golden']
STAGE_BUDGET = 1500


# ================================================================ helpers
def trunk(p, m, h, r0, r1, segs=7, lean=(0.0, 0.0), flare=1.45, phase=0.0):
    prof = [(r0 * flare, 0.0), (r0 * 1.04, min(0.14, h * 0.2)), (r0 * 0.95, 0.5 * h), (r1, h)]
    g = lathe(prof, segs, phase=phase)
    for v in g.verts:
        k = (v.z / h) ** 2
        v.x += lean[0] * k
        v.y += lean[1] * k
    p.add(g, m)


def branch(p, m, pts, radii, sides=5, n=None):
    path = bez(pts, n or max(3, len(pts)))
    rr = [radii[0] + (radii[-1] - radii[0]) * i / (len(path) - 1) for i in range(len(path))]
    p.add(tube(path, rr, sides=sides), m)


def spiral(c, r, z0, z1, turns, n, phase=0.0):
    return [(c[0] + r * math.cos(phase + TAU * turns * i / (n - 1)), c[1] + r * math.sin(phase + TAU * turns * i / (n - 1)),
             z0 + (z1 - z0) * i / (n - 1)) for i in range(n)]


def curl(start, direction, size, turns=1.25, n=8, up=0.0):
    """A flat curly tendril starting at `start`, heading along `direction` (xy), curling inward."""
    d = Vector(direction).normalized()
    side = Vector((-d.y, d.x, 0)).normalized() if abs(d.z) < 0.99 else Vector((1, 0, 0))
    pts = []
    for i in range(n):
        t = i / (n - 1)
        a = TAU * turns * t
        r = size * (1 - 0.75 * t)
        pts.append(Vector(start) + d * (math.sin(a) * r) + side * ((1 - math.cos(a)) * r) + Vector((0, 0, up * t)))
    return pts


def blossom(p, m, pos, nrm, r=0.06, spin=0.0):
    p.add(disc(lobed(5, 2, r * 0.55, r, 0.6), dome=r * 0.25), m, facing(pos, nrm, spin=spin))


def sprout(name, stem_m, leaf_m, leaves, height=0.4, bud=None, bend=(0.03, -0.02), shape='round', nub_m=None):
    """leaves: [(yaw_deg, pitch_deg, length, width, z_frac)]; bud: (material, radius) on the tip."""
    p = Piece(name)
    top = Vector((bend[0], bend[1], height * 0.72))
    path = bez([(0, 0, 0), (0, 0, height * 0.4), top], 4)
    p.add(tube(path, [0.028, 0.024, 0.02, 0.016], sides=5), stem_m)
    for yaw, pitch, ln, wd, zf in leaves:
        base = Vector(path[min(3, int(zf * 3 + 0.5))]) if zf < 1 else top
        p.add(leaf(ln, wd, 3, shape, fold=0.25, bend=-0.15), leaf_m, leaf_frame(base, RAD(yaw), RAD(pitch)))
    if bud:
        bm, br = bud
        p.add(ico0(br, top + Vector((0, 0, br * 0.7)), 1.1), bm)
    for yaw in (30, 210):
        p.add(leaf(0.1, 0.08, 2, 'round', fold=0.2, bend=-0.2), nub_m or leaf_m, leaf_frame((0, 0, 0.02), RAD(yaw), RAD(25)))
    return p


def hang(fp, stem_m, anchor, drop, fruit, fruit_m, extra=(), spin=0.0):
    """A short stem from `anchor` down to a fruit whose geometry has its top at the origin."""
    a = Vector(anchor)
    top = a - Vector((0, 0, drop))
    fp.add(tube([a + Vector((0, 0, 0.04)), top + Vector((0, 0, 0.01))], [0.016, 0.013], sides=4), stem_m)
    fp.add(fruit, fruit_m, xf(top, (0, 0, spin)))
    for g, m in extra:
        fp.add(g, m, xf(top, (0, 0, spin)))
    return top


def lobes(n, dist, z, rr, m, phase=0.0, segs=12, squash=0.88, jitter=0.0, seed=1, lats=LATS5):
    rng = random.Random(seed)
    out = []
    for k in range(n):
        a = phase + TAU * k / n
        d = dist * (1 + rng.uniform(-jitter, jitter))
        rz = rr * squash * (1 + rng.uniform(-jitter, jitter))
        out.append(dict(c=(d * math.cos(a), d * math.sin(a), z + rng.uniform(-jitter, jitter) * rr),
                        r=(rr, rr * 0.97, rz), segs=segs, m=m, phase=k * 0.37, lats=lats))
    return out


# ============================================================ fruit shapes
def berry_cluster(fp, m, pos, nrm, r=0.09, spin=0.0):
    f = facing(pos, nrm, spin=spin)
    for lx, ly in ((-0.85, -0.5), (0.85, -0.5), (0.0, 0.95)):
        fp.add(ico0(r, f @ Vector((lx * r, ly * r, r * 0.5))), m)


def pear_geo(h=0.32, r=0.13, segs=8):
    prof = [(0.0, -h), (r * 0.62, -h * 0.97), (r, -h * 0.8), (r * 0.98, -h * 0.58), (r * 0.62, -h * 0.32),
            (r * 0.46, -h * 0.14), (0.0, 0.0)]
    return lathe(prof, segs)


def bell_geo(h=0.24, r=0.14, segs=8):
    """A bell hanging from the origin: round crown, waisted body, wide flared lip, open-looking mouth."""
    prof = [(r * 0.8, -h * 0.97), (r * 1.04, -h), (r * 0.96, -h * 0.9), (r * 0.66, -h * 0.66),
            (r * 0.6, -h * 0.36), (r * 0.5, -h * 0.13), (r * 0.26, -h * 0.02), (0.0, 0.0)]
    inner = lathe([(0.0, -h * 0.5), (r * 0.8, -h * 0.97)], segs)
    return K.merge(lathe(prof, segs), inner.flipped())


def bun_geo(r=0.17, h=0.19, segs=9):
    prof = [(0.0, -h), (r * 0.8, -h * 0.98), (r, -h * 0.78), (r * 0.97, -h * 0.45), (r * 0.76, -h * 0.13),
            (r * 0.38, 0.0), (0.0, 0.012)]
    return lathe(prof, segs)


def plum_geo(h=0.26, r=0.115, segs=8):
    prof = [(0.0, -h), (r * 0.62, -h * 0.94), (r, -h * 0.62), (r * 0.98, -h * 0.34), (r * 0.66, -h * 0.07),
            (0.0, 0.0)]
    return lathe(prof, segs)


def star_geo(r_out=0.2, r_in=0.095, thick=0.12):
    out = star_outline(5, r_out, r_in)
    return slab(out, [(0.6, -thick * 0.5), (1.0, -thick * 0.2), (1.0, thick * 0.2), (0.6, thick * 0.5)],
                -thick * 0.62, thick * 0.62)


def pod_geo(h=0.4, r=0.1, segs=6):
    prof = [(0.0, -h), (r * 0.45, -h * 0.9), (r * 0.92, -h * 0.66), (r, -h * 0.44), (r * 0.7, -h * 0.17),
            (r * 0.28, -h * 0.03), (0.0, 0.0)]
    return lathe(prof, segs, phase=0.3)


def sparkle(p, m, pos, nrm, r=0.1, spin=0.0):
    p.add(disc(star_outline(4, r, r * 0.3), dome=r * 0.25, back=r * 0.25), m, facing(pos, nrm, spin=spin))


# ================================================================ species
def mats():
    return dict(
        bark=K.M('bark', 0.7), wood=K.M('wood', 0.6), wood_light=K.M('wood_light', 0.6), wood_dark=K.M('wood_dark', 0.65),
        leaf=K.M('leaf'), leaf_light=K.M('leaf_light'), leaf_dark=K.M('leaf_dark'), mint=K.M('mint'),
        teal=K.M('teal'), moss=K.M('moss'), moss_light=K.M('moss_light'), moss_dark=K.M('moss_dark'),
        sage=K.M('sage'), navy=K.M('navy'), berry=K.M('berry', 0.35), blossom=K.M('blossom', 0.5),
        rose=K.M('rose', 0.5), pear=K.M('pear', 0.4), gold=K.M('gold', 0.3), sun=K.M('sun', 0.45),
        bun=K.M('bun', 0.6), honey=K.M('honey', 0.25), fig=K.M('fig', 0.4), straw_light=K.M('straw_light', 0.7),
        soil=K.M('soil', 0.9),
        # Glowing violet-blue plums: a deeper base under the plum-coloured glow keeps them saturated.
        plum=K.mat('glow_plum', '#5A55F0', 0.35, emit=PLUM_GLOW, emit_strength=1.1),
        glow_gold=K.G('gold', 'gold', 2.0), glow_moss=K.G('moss', 'moss_light', 1.2),
    )


PLUM_GLOW = '#6E7BFF'


# --------------------------------------------------------------- puffberry
def puffberry(m):
    out = {}
    out['sprout'] = (sprout('puffberry_sprout', m['leaf_dark'], m['leaf'],
                            [(20, 40, 0.2, 0.17, 1), (150, 35, 0.19, 0.16, 1), (265, 45, 0.17, 0.15, 1)],
                            bud=(m['berry'], 0.05)), None)

    y = Piece('puffberry_young')
    trunk(y, m['bark'], 0.3, 0.07, 0.05, segs=6)
    blobs = [dict(c=(0, 0, 0.55), r=(0.44, 0.43, 0.38), segs=14, m=m['leaf'], lats=LATS5)]
    blobs += lobes(3, 0.33, 0.38, 0.27, m['leaf'], phase=RAD(-90), seed=3, segs=10)
    blobs.append(dict(c=(0.02, 0.0, 0.84), r=(0.26, 0.26, 0.2), segs=12, m=m['leaf_light'], lats=LATS5))
    canopy(y, blobs, 0.04, seed=11)
    for bi, d, sp in ((0, (0.2, -0.8, 0.5), 0.3), (1, (0.1, -0.6, 0.6), 1.0), (2, (0.6, 0.2, 0.5), 2.0),
                      (3, (-0.6, -0.1, 0.6), 0.5), (4, (0.3, -0.4, 0.8), 1.4), (0, (-0.6, -0.5, 0.4), 2.2)):
        pos, nrm = surface_point(blobs[bi], d, 0.01)
        blossom(y, m['rose'], pos, nrm, 0.07, sp)
    out['young'] = (y, None)

    g = Piece('puffberry_grown')
    trunk(g, m['bark'], 0.5, 0.12, 0.09, segs=7)
    blobs = [dict(c=(0, 0, 0.88), r=(0.8, 0.78, 0.66), segs=18, m=m['leaf'], lats=LATS6)]
    blobs += lobes(5, 0.64, 0.58, 0.44, m['leaf'], phase=RAD(-90 + 36), seed=5, jitter=0.06, segs=12)
    blobs.append(dict(c=(0.04, 0.02, 1.36), r=(0.46, 0.45, 0.36), segs=14, m=m['leaf_light'], lats=LATS5))
    canopy(g, blobs, 0.04, seed=21)
    f = Piece('puffberry_grown_fruits')
    spots = [(0, (0.15, -0.9, 0.35)), (0, (-0.75, -0.55, 0.3)), (0, (0.8, -0.35, 0.4)), (6, (-0.2, -0.7, 0.7)),
             (6, (0.5, 0.3, 0.8)), (1, (0.0, -1.0, 0.1)), (2, (0.9, -0.2, 0.0)), (3, (0.4, 0.9, 0.2)),
             (4, (-0.6, 0.6, 0.2)), (5, (-0.9, -0.3, 0.1))]
    for i, (bi, d) in enumerate(spots):
        pos, nrm = surface_point(blobs[bi], d, 0.0)
        berry_cluster(f, m['berry'], pos, nrm, 0.095, spin=i * 1.3)
    out['grown'] = (g, f)
    return out


# ---------------------------------------------------------------- ropevine
def vine_leaves(p, path, every, size, seed, mat, start=1):
    rng = random.Random(seed)
    for i in range(start, len(path) - 1, every):
        a, b = Vector(path[i]), Vector(path[i + 1])
        d = b - a
        yaw = math.atan2(d.y, d.x) + (RAD(90) if (i // every) % 2 else RAD(-90)) + rng.uniform(-0.4, 0.4)
        p.add(leaf(size, size * 0.9, 3, 'heart', fold=0.2, bend=-0.25), mat, leaf_frame(a, yaw, RAD(rng.uniform(10, 40))))


def ropevine(m):
    out = {}
    s = Piece('ropevine_sprout')
    stem = bez([(0, 0, 0), (0.0, 0.0, 0.18), (0.06, -0.02, 0.3)], 4)
    s.add(tube(stem, [0.024, 0.021, 0.018, 0.016], sides=5), m['leaf_dark'])
    tip = Vector(stem[-1])
    coil = [tip + Vector((0.075 * math.sin(a), 0.0, 0.075 * (1 - math.cos(a)))) * (1 - 0.55 * a / (TAU * 1.1))
            for a in (TAU * 1.1 * i / 8 for i in range(9))]
    s.add(tube(coil, [0.016 - 0.008 * i / 8 for i in range(9)], sides=4), m['leaf_dark'])
    for yaw, pitch, ln, wd, z in ((200, 35, 0.19, 0.17, 0.12), (20, 40, 0.18, 0.16, 0.2), (300, 50, 0.14, 0.12, 0.27)):
        s.add(leaf(ln, wd, 3, 'heart', fold=0.25, bend=-0.15), m['leaf'], leaf_frame((0.0, 0.0, z), RAD(yaw), RAD(pitch)))
    out['sprout'] = (s, None)

    y = Piece('ropevine_young')
    y.add(K.rcyl(0.04, 1.02, 0.015, 6, arc=1), m['wood'])
    vp = spiral((0, 0), 0.075, 0.0, 0.92, 2.0, 16, phase=RAD(-90))
    y.add(tube(vp, 0.024, sides=4), m['leaf_dark'])
    vine_leaves(y, vp, 2, 0.22, 4, m['leaf'])
    y.add(tube(curl(vp[-1], (1, -0.4, 0), 0.12, 1.4, 7, 0.12), [0.02 - 0.012 * i / 6 for i in range(7)], sides=4),
          m['leaf_dark'])
    out['young'] = (y, None)

    g = Piece('ropevine_grown')
    wood, wl = m['wood'], m['wood_light']
    hx, h = 0.62, 1.9
    for x in (-hx, hx):
        g.add(K.rcyl(0.07, h, 0.025, 6, arc=1, r_top=0.06), wood, xf((x, 0, 0), (0, 0, RAD(30))))
    arc = [(hx * math.cos(a) * 1.04, 0.0, h - 0.08 + 0.34 * math.sin(a)) for a in (math.pi * i / 9 for i in range(10))]
    g.add(tube(arc, 0.055, sides=6, flatten=0.8), wl)
    for z in (0.62, 1.26):
        g.add(tube([(-hx - 0.1, 0, z), (hx + 0.1, 0, z)], 0.035, sides=6, cap_start=True, cap_end=True), wl)
    left = spiral((-hx, 0), 0.1, 0.0, h - 0.05, 2.4, 16, phase=RAD(-60))
    right = spiral((hx, 0), 0.1, 0.0, h - 0.1, 2.1, 15, phase=RAD(200))
    over = [(hx * math.cos(a) * 1.04 + 0.05 * math.sin(7 * a), -0.07 * math.cos(7 * a),
             h + 0.34 * math.sin(a) - 0.04 + 0.06 * math.cos(7 * a)) for a in (math.pi * (0.06 + 0.88 * i / 12) for i in range(13))]
    for path in (left, right, over):
        g.add(tube(path, 0.032, sides=4), m['leaf_dark'])
    vine_leaves(g, left, 3, 0.27, 7, m['leaf'])
    vine_leaves(g, right, 3, 0.27, 8, m['leaf'], start=2)
    vine_leaves(g, over, 2, 0.27, 9, m['leaf'])
    for start, d, sz in (((-0.3, -0.05, h + 0.3), (-0.4, -1, 0.0), 0.15), ((0.32, -0.04, h + 0.28), (0.5, -1, 0.0), 0.14),
                         ((0.02, -0.04, h + 0.3), (0.2, -1.0, 0.0), 0.12)):
        g.add(tube(curl(start, d, sz, 1.3, 7, 0.1), [0.022 - 0.013 * i / 6 for i in range(7)], sides=4), m['leaf_dark'])
    f = Piece('ropevine_grown_fruits')
    pod = pod_geo(0.4, 0.1)
    tuft = blob((0, 0, -0.42), (0.065, 0.065, 0.06), 6, LATS_MIN)
    for x, yv, z, drop in ((-0.36, -0.08, h + 0.12, 0.03), (0.3, -0.09, h + 0.16, 0.04), (-0.66, -0.13, 1.2, 0.02),
                           (0.66, -0.13, 0.97, 0.02), (0.0, -0.08, 1.22, 0.04)):
        hang(f, m['leaf_dark'], (x, yv, z), drop, pod, m['leaf_light'], extra=[(tuft, m['straw_light'])])
    out['grown'] = (g, f)
    return out


# --------------------------------------------------------------- cloudpear
CLOUD = dict(main='moss_light', side='leaf_light', top='moss_light')


def cloud_crown(p, m, cz, k, seed, lats_main=LATS6, segs=(16, 12)):
    blobs = [dict(c=(0.0, 0.0, cz), r=(0.6 * k, 0.56 * k, 0.48 * k), segs=segs[0], m=m[CLOUD['main']], lats=lats_main)]
    for (x, y, z, r) in ((-0.64, 0.05, -0.12, 0.43), (0.66, -0.02, -0.1, 0.44), (0.1, -0.44, -0.16, 0.42),
                         (-0.12, 0.46, -0.08, 0.42)):
        blobs.append(dict(c=(x * k, y * k, cz + z * k), r=(r * k, r * k * 0.92, r * k * 0.84), segs=segs[1],
                          m=m[CLOUD['side']], lats=LATS5))
    blobs.append(dict(c=(0.26 * k, 0.1 * k, cz + 0.36 * k), r=(0.36 * k, 0.34 * k, 0.28 * k), segs=segs[1],
                      m=m[CLOUD['top']], lats=LATS5))
    canopy(p, blobs, 0.03, floor=cz - 0.32 * k, seed=seed)
    return blobs


def cloudpear(m):
    out = {}
    s = sprout('cloudpear_sprout', m['bark'], m['leaf'],
               [(10, 45, 0.19, 0.12, 1), (190, 40, 0.19, 0.12, 1), (100, 60, 0.15, 0.1, 0.5)], shape='leaf')
    s.add(blob((0.03, -0.02, 0.34), (0.08, 0.075, 0.055), 8, LATS_MIN), m['moss_light'])
    out['sprout'] = (s, None)

    y = Piece('cloudpear_young')
    trunk(y, m['bark'], 0.62, 0.06, 0.045, segs=6, lean=(0.02, 0))
    cloud_crown(y, m, 0.78, 0.44, 31, LATS5, (12, 10))
    out['young'] = (y, None)

    g = Piece('cloudpear_grown')
    trunk(g, m['bark'], 1.55, 0.15, 0.1, segs=8, lean=(-0.05, 0.02))
    for side in (-1, 1):
        branch(g, m['bark'], [(0, 0, 1.1), (side * 0.28, -0.05, 1.42), (side * 0.55, -0.02, 1.72)], [0.09, 0.06])
    cloud_crown(g, m, 2.0, 1.0, 41)
    f = Piece('cloudpear_grown_fruits')
    pear = pear_geo()
    leafy = leaf(0.12, 0.08, 2, 'leaf', 0.2, 0.1)
    floor = 2.0 - 0.32
    for i, (x, yv, drop) in enumerate(((-0.6, -0.42, 0.05), (0.45, -0.52, 0.07), (0.95, 0.02, 0.03), (-1.0, 0.08, 0.04),
                                       (-0.05, -0.62, 0.02), (-0.3, 0.55, 0.05), (0.55, 0.45, 0.04))):
        top = hang(f, m['bark'], (x, yv, floor + 0.04), drop, pear, m['pear'])
        if i % 2 == 0:
            f.add(leafy, m['leaf'], leaf_frame(top + Vector((0, 0, 0.015)), RAD(30 + 70 * i), RAD(20)))
    out['grown'] = (g, f)
    return out


# --------------------------------------------------------------- chimewood
def chime_column(p, m, levels, seed, x=0.0):
    blobs = []
    for k, (z, r, rz, dx, col) in enumerate(levels):
        blobs.append(dict(c=(x + dx, 0.0, z), r=(r, r * 0.95, rz), segs=14 if r > 0.3 else 10, m=m[col], phase=k * 0.5,
                          lats=LATS5))
    canopy(p, blobs, 0.03, seed=seed)
    return blobs


def chimewood(m):
    out = {}
    out['sprout'] = (sprout('chimewood_sprout', m['wood'], m['mint'],
                            [(30, 55, 0.21, 0.1, 1), (210, 55, 0.21, 0.1, 1), (120, 70, 0.16, 0.09, 0.6)], height=0.42,
                            shape='leaf', bud=(m['gold'], 0.045)), None)

    y = Piece('chimewood_young')
    trunk(y, m['wood'], 0.7, 0.05, 0.035, segs=6)
    chime_column(y, m, ((0.55, 0.25, 0.2, 0.0, 'teal'), (0.8, 0.2, 0.18, 0.02, 'mint'), (1.0, 0.12, 0.1, 0.0, 'mint')), 51)
    out['young'] = (y, None)

    g = Piece('chimewood_grown')
    trunk(g, m['wood'], 2.3, 0.1, 0.06, segs=7, lean=(0.03, 0.0))
    chime_column(g, m, ((1.3, 0.5, 0.42, 0.0, 'teal'), (1.82, 0.45, 0.38, 0.04, 'teal'), (2.28, 0.37, 0.33, -0.02, 'mint'),
                        (2.64, 0.26, 0.24, 0.02, 'mint'), (2.86, 0.12, 0.12, 0.02, 'mint')), 61)
    # Little hook arms stick out of the column; the bells hang from their tips.
    hooks = []
    for z, angs, ln in ((1.12, (-150, -30, 90), 0.72), (1.66, (-90, 30, 150), 0.66)):
        for a in angs:
            d = Vector((math.cos(RAD(a)), math.sin(RAD(a)), 0))
            tip = d * ln + Vector((0, 0, z + 0.1))
            branch(g, m['wood'], [Vector((0, 0, z - 0.1)), d * ln * 0.55 + Vector((0, 0, z)), tip], [0.042, 0.028], sides=4)
            hooks.append(tip)
    f = Piece('chimewood_grown_fruits')
    bell = bell_geo()
    clap = ico0(0.042, (0, 0, -0.245))
    for i, tip in enumerate(hooks):
        hang(f, m['wood_dark'], tip - Vector((0, 0, 0.02)), 0.07, bell, m['gold'], extra=[(clap, m['gold'])], spin=i * 0.4)
    out['grown'] = (g, f)
    return out


# ---------------------------------------------------------------- honeybun
def honey_cap(p, m, z, w, h, n, seed, segs=(16, 11)):
    blobs = [dict(c=(0, 0, z), r=(w, w * 0.96, h), segs=segs[0], m=m['leaf'], lats=LATS6)]
    blobs += lobes(n, w * 0.8, z - h * 0.3, w * 0.4, m['leaf_dark'], phase=RAD(-90 + 180 / n), squash=0.85, seed=seed,
                   segs=segs[1])
    canopy(p, blobs, 0.035, seed=seed)
    return blobs


def honeybun(m):
    out = {}
    s = sprout('honeybun_sprout', m['bark'], m['leaf'],
               [(0, 25, 0.21, 0.18, 1), (180, 25, 0.21, 0.18, 1)], height=0.34, shape='round', bend=(0.0, 0.0))
    s.add(bun_geo(0.06, 0.065, 8), m['bun'], xf((0, 0, 0.31)))
    out['sprout'] = (s, None)

    y = Piece('honeybun_young')
    trunk(y, m['bark'], 0.5, 0.1, 0.075, segs=7, flare=1.6)
    honey_cap(y, m, 0.7, 0.5, 0.26, 4, 71, (14, 10))
    out['young'] = (y, None)

    g = Piece('honeybun_grown')
    prof = [(0.36, 0.0), (0.26, 0.12), (0.27, 0.45), (0.22, 0.85), (0.17, 1.12)]
    g.add(lathe(prof, 9, mod=lambda th, i: 1 + 0.06 * math.cos(3 * th)), m['bark'])
    for ang in (200, -20, 95):
        a = RAD(ang)
        branch(g, m['bark'], [(0, 0, 0.82), (math.cos(a) * 0.35, math.sin(a) * 0.35, 1.08),
                              (math.cos(a) * 0.62, math.sin(a) * 0.62, 1.2)], [0.1, 0.06])
    blobs = honey_cap(g, m, 1.36, 1.0, 0.52, 5, 81)
    f = Piece('honeybun_grown_fruits')
    bun = bun_geo(segs=8)
    drop_top = disc(lobed(3, 2, 0.05, 0.07, 0.8), dome=0.025, back=0.005).transformed(xf((0, 0, 0.004)))
    for i in (0, 1, 3, 4):
        ang = -90 + 36 + 72 * i
        pos, _ = surface_point(blobs[1 + i], (math.cos(RAD(ang)), math.sin(RAD(ang)), -0.55), 0.0)
        hang(f, m['bark'], pos, 0.05, bun, m['bun'], extra=[(drop_top, m['honey'])], spin=i)
    # Three buns resting on the canopy top, where the high camera sees them best.
    for d, sp in (((0.3, -0.55, 0.85), 0.2), ((-0.5, -0.1, 0.8), 1.1), ((0.25, 0.45, 0.9), 2.0)):
        pos, nrm = surface_point(blobs[0], d, 0.0)
        top = pos + Vector((0, 0, 0.16))
        f.add(bun, m['bun'], xf(top, (0, 0, sp)))
        f.add(drop_top, m['honey'], xf(top, (0, 0, sp)))
    out['grown'] = (g, f)
    return out


# ---------------------------------------------------------------- glowplum
PLUM_LEAF = dict(main='leaf_dark', lobe='moss_dark')


def weeping(p, m, z, w, n, seed, segs=(16, 12)):
    blobs = [dict(c=(0, 0, z), r=(w, w * 0.97, w * 0.7), segs=segs[0], m=m[PLUM_LEAF['main']], lats=LATS6)]
    for i in range(n):
        a = RAD(-90 + 360 / n * (i + 0.5))
        blobs.append(dict(c=(math.cos(a) * w * 0.82, math.sin(a) * w * 0.82, z - w * 0.38),
                          r=(w * 0.4, w * 0.4, w * 0.56), segs=segs[1], m=m[PLUM_LEAF['lobe']], phase=i * 0.4, lats=LATS5))
    canopy(p, blobs, 0.04, seed=seed)
    return blobs


def glowplum(m):
    out = {}
    out['sprout'] = (sprout('glowplum_sprout', m['bark'], m['leaf_dark'],
                            [(40, 45, 0.2, 0.13, 1), (220, 45, 0.2, 0.13, 1), (130, 60, 0.16, 0.11, 0.6)], shape='leaf',
                            bud=(m['plum'], 0.05)), None)

    y = Piece('glowplum_young')
    trunk(y, m['bark'], 0.55, 0.065, 0.05, segs=6, lean=(0.03, 0))
    weeping(y, m, 0.72, 0.36, 4, 91, (14, 10))
    out['young'] = (y, None)

    g = Piece('glowplum_grown')
    trunk(g, m['bark'], 1.45, 0.15, 0.1, segs=8, lean=(0.08, -0.03))
    for ang in (-150, -30, 90):
        a = RAD(ang)
        branch(g, m['bark'], [(0.05, 0, 1.15), (math.cos(a) * 0.32, math.sin(a) * 0.32, 1.5),
                              (math.cos(a) * 0.55, math.sin(a) * 0.55, 1.72)], [0.08, 0.05])
    blobs = weeping(g, m, 1.86, 0.86, 6, 101)
    f = Piece('glowplum_grown_fruits')
    plum = plum_geo()
    for i in range(6):
        ang = -90 + 60 * (i + 0.5)
        pos, _ = surface_point(blobs[1 + i], (math.cos(RAD(ang)) * 0.6, math.sin(RAD(ang)) * 0.6, -0.8), 0.0)
        hang(f, m['leaf_dark'], pos, 0.05, plum, m['plum'])
    for d in ((0.15, -0.7, 0.55), (-0.5, -0.45, 0.5), (0.45, 0.2, 0.75)):
        pos, nrm = surface_point(blobs[0], d, 0.0)
        f.add(plum, m['plum'], xf(pos + nrm * 0.03 + Vector((0, 0, 0.2)), (0.25, 0.2, 0)))
    out['grown'] = (g, f)
    return out


# ----------------------------------------------------------------- starfig
def twist(p, m, k, seed, clumps):
    path = bez([(0, 0, 0), (0.32 * k, 0.05 * k, 0.55 * k), (-0.38 * k, -0.05 * k, 0.95 * k), (0.05 * k, 0, 1.45 * k)], 9)
    g = tube(path, [0.17 * k * (1 - 0.45 * i / 8) * (1.3 if i == 0 else 1) for i in range(9)], sides=8)
    for v in g.verts:
        v.z = max(0.0, v.z)
    p.add(g, m['bark'])
    top = Vector(path[-1])
    blobs = []
    for (bx, by, bz, br), (cx, cy, cz) in clumps:
        c = Vector((bx * k, by * k, bz * k))
        branch(p, m['bark'], [top - Vector((0, 0, 0.2 * k)), (top + c) / 2 + Vector((cx * k, cy * k, cz * k)), c],
               [0.085 * k, 0.05 * k])
        blobs.append(dict(c=tuple(c), r=(br * k, br * k * 0.95, br * k * 0.82), segs=14, m=m['leaf'], lats=LATS5))
    blobs[-1]['m'] = m['leaf_light']
    canopy(p, blobs, 0.05, seed=seed)
    return blobs


def starfig(m):
    out = {}
    s = Piece('starfig_sprout')
    stem = bez([(0, 0, 0), (0.08, 0.0, 0.12), (-0.06, -0.02, 0.22), (0.03, -0.02, 0.32)], 6)
    s.add(tube(stem, [0.028, 0.025, 0.022, 0.019, 0.016, 0.014], sides=5), m['bark'])
    for yaw, pitch, z in ((10, 40, 3), (170, 45, 5), (280, 55, 5)):
        s.add(leaf(0.18, 0.13, 3, 'leaf', 0.25, -0.15), m['leaf'], leaf_frame(stem[z], RAD(yaw), RAD(pitch)))
    s.add(star_geo(0.07, 0.034, 0.045), m['fig'], xf(Vector(stem[-1]) + Vector((0, 0, 0.05)), (RAD(70), 0, 0)))
    for yaw in (60, 240):
        s.add(leaf(0.1, 0.08, 2, 'round', 0.2, -0.2), m['leaf'], leaf_frame((0, 0, 0.02), RAD(yaw), RAD(25)))
    out['sprout'] = (s, None)

    y = Piece('starfig_young')
    twist(y, m, 0.5, 111, [((-0.6, 0.0, 1.72, 0.46), (0.1, 0, 0.2)), ((0.62, 0.05, 1.95, 0.44), (-0.1, 0, 0.2))])
    out['young'] = (y, None)

    g = Piece('starfig_grown')
    clumps = [((-0.66, 0.05, 1.92, 0.55), (0.05, 0, 0.25)), ((0.66, 0.12, 2.1, 0.53), (-0.1, 0, 0.3)),
              ((0.0, -0.15, 2.4, 0.45), (0.2, 0, 0.2))]
    blobs = twist(g, m, 1.0, 121, clumps)
    for start, d, sz in (((-1.15, 0.0, 2.05), (-1, -0.2, 0.3), 0.15), ((1.12, 0.12, 2.25), (1, -0.3, 0.3), 0.14)):
        g.add(tube(curl(start, d, sz, 1.3, 7, 0.1), [0.035 - 0.022 * i / 6 for i in range(7)], sides=4), m['bark'])
    f = Piece('starfig_grown_fruits')
    star = star_geo()
    spots = [(0, -100, -0.35, 0.05), (0, 170, -0.4, 0.05), (1, -70, -0.4, 0.05), (1, 10, -0.5, 0.05),
             (2, -90, -0.1, 0.03), (0, 50, -0.5, 0.05), (1, 120, -0.5, 0.05)]
    for i, (bi, ang, dz, drop) in enumerate(spots):
        pos, _ = surface_point(blobs[bi], (math.cos(RAD(ang)), math.sin(RAD(ang)), dz), 0.0)
        topf = pos - Vector((0, 0, drop))
        f.add(tube([pos + Vector((0, 0, 0.04)), topf], [0.016, 0.013], sides=4), m['bark'])
        # Stars hang upright; each turns a little so they catch the light differently.
        f.add(star, m['fig'], xf(topf - Vector((0, 0, 0.18)), (RAD(80), 0, RAD(-12 + 9 * i))))
    out['grown'] = (g, f)
    return out


# ------------------------------------------------------------------ golden
def golden_crown(p, m, z, w, n, seed, sparkles, segs=(18, 12)):
    blobs = [dict(c=(0, 0, z), r=(w, w * 0.96, w * 0.8), segs=segs[0], m=m['gold'], lats=LATS6)]
    blobs += lobes(n, w * 0.8, z - w * 0.36, w * 0.54, m['gold'], phase=RAD(-90 + 180 / n), seed=seed, jitter=0.05,
                   segs=segs[1])
    blobs.append(dict(c=(0.05 * w, 0.0, z + w * 0.6), r=(w * 0.5, w * 0.48, w * 0.4), segs=segs[1], m=m['sun'], lats=LATS5))
    canopy(p, blobs, 0.04, seed=seed)
    for i, (bi, d) in enumerate(sparkles):
        pos, nrm = surface_point(blobs[bi], d, 0.02)
        sparkle(p, m['glow_gold'], pos, nrm, 0.12 * w / 0.9 + 0.02, spin=i * 0.7)
    return blobs


def golden(m):
    out = {}
    out['sprout'] = (sprout('golden_sprout', m['wood_light'], m['gold'],
                            [(20, 40, 0.2, 0.15, 1), (150, 35, 0.19, 0.14, 1), (265, 45, 0.17, 0.13, 1)], shape='round',
                            bud=(m['glow_gold'], 0.045)), None)

    y = Piece('golden_young')
    trunk(y, m['wood_light'], 0.55, 0.07, 0.05, segs=6)
    golden_crown(y, m, 0.66, 0.34, 4, 131, [(0, (0.3, -0.8, 0.5)), (5, (-0.3, -0.5, 0.7))], (14, 10))
    out['young'] = (y, None)

    g = Piece('golden_grown')
    trunk(g, m['wood_light'], 1.65, 0.17, 0.11, segs=8, lean=(0.03, 0.02))
    for ang in (-140, -30, 80):
        a = RAD(ang)
        branch(g, m['wood_light'], [(0, 0, 1.2), (math.cos(a) * 0.35, math.sin(a) * 0.35, 1.58),
                                    (math.cos(a) * 0.6, math.sin(a) * 0.6, 1.85)], [0.09, 0.055])
    golden_crown(g, m, 2.08, 0.89, 6, 141, [(0, (0.2, -0.9, 0.4)), (0, (-0.6, -0.6, 0.5)), (7, (0.4, -0.5, 0.7)),
                                          (1, (0.3, -1, 0.1)), (3, (1, 0.2, 0.2)), (5, (-1, 0, 0.3)), (0, (0.7, 0.4, 0.6))])
    out['grown'] = (g, None)
    return out


# -------------------------------------------------------------------- plot
def build_plot(m):
    p = Piece('plot')
    prof = [(0.0, 0.055), (0.17, 0.058), (0.22, 0.075), (0.5, 0.088), (0.64, 0.082), (0.7, 0.074), (0.76, 0.06),
            (0.8, 0.035), (0.8, 0.0)]
    band_mat = {0: m['soil'], 1: m['moss'], 2: m['moss'], 3: m['moss'], 4: m['glow_moss'], 5: m['glow_moss'],
                6: m['moss_dark'], 7: m['moss_dark']}

    def mod(th, i):
        return 1.0 + (0.025 * math.cos(5 * th + 0.3) if i >= 3 else 0.0)
    p.add(lathe(prof, 24, mod=mod, tag=lambda band, s: band), band_mat)
    for ang in (-70, 40, 160, 250):
        a = RAD(ang)
        p.add(blob((math.cos(a) * 0.45, math.sin(a) * 0.45, 0.085), (0.09, 0.08, 0.04), 8, LATS_MIN), m['moss_light'])
    return p


# =================================================================== main
def build():
    m = mats()
    roots = {}
    for tid in IDS:
        stages = globals()[tid](m)
        for st in ('sprout', 'young', 'grown'):
            body, fruit = stages[st]
            name = f'{tid}_{st}'
            body.deform(lambda v: (v.x, v.y, max(0.0, v.z)))  # nothing pokes below the ground
            obj = body.build(sharp=55, name=name)
            if st == 'grown':
                if fruit is not None:
                    fo = fruit.build(sharp=55, name='fruits')
                    fo.data.name = f'{name}_fruits'
                else:
                    fo = bpy.data.objects.new('fruits', None)
                    bpy.context.scene.collection.objects.link(fo)
                attach(fo, obj)
            roots[name] = obj
    roots['plot'] = build_plot(m).build(sharp=60, name='plot')
    return roots


def check(stats):
    errors = []
    for tid in IDS:
        for st, (lo, hi) in (('sprout', (0.3, 0.5)), ('young', (0.8, 1.25)), ('grown', (1.6, 3.0))):
            s = stats[f'{tid}_{st}']
            if s['tris'] > STAGE_BUDGET:
                errors.append(f'{tid}_{st}: {s["tris"]} tris')
            if not lo <= s['max_y'] <= hi:
                errors.append(f'{tid}_{st}: height {s["max_y"]} not in {lo}..{hi}')
            if abs(s['min_y']) > 0.01:
                errors.append(f'{tid}_{st}: base {s["min_y"]}')
        if 'fruits' not in stats[f'{tid}_grown']['children']:
            errors.append(f'{tid}_grown has no fruits child')
    p = stats['plot']
    if not 1.5 <= p['size'][0] <= 1.7:
        errors.append(f'plot width {p["size"][0]}')
    return errors


def main():
    style.reset_scene()
    roots = build()
    bpy.context.view_layer.update()
    stats = {n: K.root_stats(o) for n, o in roots.items()}
    K.report(stats)
    errors = check(stats)
    path, size = K.export(list(roots.values()), FILE)
    print(f'{FILE}: {size} bytes, {sum(s["tris"] for s in stats.values())} tris')
    K.write_manifest(FILE, size, stats, dict(generator='art/blender/kit/build_trees.py',
                                            notes='fruits child: identity transform, vertices in tree space; '
                                                  'plot: soil centre y 0.055, moss top y 0.088'))
    if '--render' in K.args():
        cells = []
        for st in ('grown', 'young', 'sprout'):
            for tid in IDS:
                n = f'{tid}_{st}'
                cells.append((roots[n], f'{n}  {stats[n]["tris"]}'))
        cells += [None, None, None, (roots['plot'], f'plot  {stats["plot"]["tris"]}')]
        placed = K.contact_sheet(cells, os.path.join(K.PREVIEWS, 'trees.png'), cols=8, pitch=(3.0, 2.9),
                                 width_px=2400, label_size=0.2, label_dy=1.15)
        # Review close-ups: grown row in two halves, then the young and sprout rows.
        grown = [roots[f'{t}_grown'] for t in IDS]
        for tag, objs in (('a', grown[:4]), ('b', grown[4:])):
            K.frame(sum((K.subtree(o) for o in objs), []), 2000, margin=0.2)
            style.render(os.path.join(K.PREVIEWS, f'trees-closeup-{tag}.png'))
        small = [roots[f'{t}_{s}'] for s in ('young', 'sprout') for t in IDS] + [roots['plot']]
        K.frame(small, 2400, margin=0.2)
        style.render(os.path.join(K.PREVIEWS, 'trees-closeup-small.png'))
        # Game-scale check: the garden on Bao's moss at about phone zoom (~45 px per metre).
        for o in placed:
            if o.type == 'FONT':
                o.hide_render = True
        for n, o in roots.items():
            for c in K.subtree(o):
                c.hide_render = True
        garden = []
        for i, tid in enumerate(IDS):
            x, y = (i % 4 - 1.5) * 3.1, (0.6 - i // 4) * 3.3
            garden += K.subtree(K.place_copy(roots['plot'], (x, y, 0)))
            stage = 'grown' if i != 5 else 'young'
            t = K.place_copy(roots[f'{tid}_{stage}'], (x, y, 0.055), rz=RAD(8 * i))
            garden += K.subtree(t)
        for k, (tid, st) in enumerate((('puffberry', 'sprout'), ('chimewood', 'sprout'), ('glowplum', 'grown'))):
            x, y = (k - 1) * 3.1, -4.6
            garden += K.subtree(K.place_copy(roots['plot'], (x, y, 0)))
            garden += K.subtree(K.place_copy(roots[f'{tid}_{st}'], (x, y, 0.055)))
        for o in garden:
            o.hide_render = False
        K.frame(garden, 900, margin=0.5)
        style.render(os.path.join(K.PREVIEWS, 'trees-game.png'))
    if errors:
        raise SystemExit('trees contract failures:\n  ' + '\n  '.join(errors))
    print('trees OK')


main()
