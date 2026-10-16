"""Chibi people for keeper.glb and crew.glb: one shared body plan, dressed per character.

glTF space (Y up, faces +Z), built at the Keeper's size (about 1.12 m) and scaled per character.
Parts and pivots (before scaling):
    body   pivot at the hips' centre (0, 0.30, 0)     torso, clothes, scarf, shawl
    head   pivot at the neck (0, 0.63, 0)             head, face, hair, hats
    arm_l  pivot at the left shoulder (+X)            sleeve and hand (props held in the hand join the arm)
    arm_r  pivot at the right shoulder (-X)
    leg_l  pivot at the left hip (+X)                 trouser leg and boot
    leg_r  pivot at the right hip (-X)
`_l` is the character's own left, which is +X because it faces +Z.
"""
import math

from kit_cast import (FWD, UP, Geo, Matrix, Vector, decal, ell_dir, ell_project, ellipsoid, fan, frame, grid_faces,
                      lathe, pal, smoothstep, superellipsoid, surface_curve, torus, tube)

PARTS = ('body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r')
BASE_H = 1.12
HEAD_C = Vector((0.0, 0.85, 0.0))
HEAD_R = (0.245, 0.226, 0.23)
NECK = Vector((0.0, 0.63, 0.0))
HIPS = Vector((0.0, 0.30, 0.0))
SHOULDER = Vector((0.165, 0.565, 0.0))
WRIST = Vector((0.215, 0.375, 0.02))
HAND = Vector((0.222, 0.338, 0.026))
HIP = Vector((0.085, 0.30, 0.0))


def sx(v, side):
    return Vector((v.x * side, v.y, v.z))


def orient_ref(g, fi, d):
    """For an open, consistently wound piece: flip everything if face fi does not face d."""
    if g.normal(g.f[fi]).dot(Vector(d)) < 0:
        g.flip()
    return g


def hdir(az, el):
    """Direction from the head centre: az from the front (+Z) toward +X, el up from the horizontal (radians)."""
    return Vector((math.cos(el) * math.sin(az), math.sin(el), math.cos(el) * math.cos(az)))


class Chibi:
    def __init__(self, name, height=BASE_H, wide=1.0):
        self.name = name
        self.k = height / BASE_H
        self.wide = wide
        self.g = {p: Geo() for p in PARTS}
        self.extra = {}            # extra nodes: name -> (parent part, geo, pivot)
        self.pivots = {
            'body': HIPS.copy(), 'head': NECK.copy(),
            'arm_l': sx(SHOULDER, 1) * 1, 'arm_r': sx(SHOULDER, -1),
            'leg_l': sx(HIP, 1), 'leg_r': sx(HIP, -1),
        }
        self.pivots['arm_l'].x *= wide
        self.pivots['arm_r'].x *= wide

    def add(self, part, *geos):
        for geo in geos:
            self.g[part].add(geo)
        return self

    def hand(self, side):
        h = sx(HAND, side)
        h.x += side * SHOULDER.x * (self.wide - 1)
        return h

    def wrist(self, side):
        w = sx(WRIST, side)
        w.x += side * SHOULDER.x * (self.wide - 1)
        return w

    def finish(self):
        """Scale everything by the character's height. Returns parts, pivots and extra nodes."""
        k = self.k
        S = Matrix.Diagonal((k, k, k, 1.0))
        for g in self.g.values():
            g.xf(S)
        piv = {p: v * k for p, v in self.pivots.items()}
        extra = {}
        for n, (parent, g, pv) in self.extra.items():
            extra[n] = (parent, g.xf(S), Vector(pv) * k)
        return self.g, piv, extra


# ------------------------------------------------------------------ head and face
def head(ch, skin, ears=True, segs=14, rings=10):
    ch.add('head', ellipsoid(HEAD_C, HEAD_R, segs, rings, None, pal(skin, 0.5)))
    if ears:
        for side in (1, -1):
            ch.add('head', ellipsoid(HEAD_C + Vector((side * 0.236, -0.02, -0.01)), (0.034, 0.048, 0.04), 6, 4, None,
                                     pal(skin, 0.5)))


EYE_AZ, EYE_EL = 0.36, -0.06


def eyes(ch, kind='round', w=0.048, h=0.068, az=EYE_AZ, el=EYE_EL, color='night'):
    dark, white = pal(color, 0.2), pal('white', 0.25)
    for side in (1, -1):
        d = hdir(side * az, el)
        if kind == 'happy':   # closed, smiling arcs
            pts = surface_curve(HEAD_C, HEAD_R, d, [(u * w, h * 0.42 * (1 - u * u) - h * 0.12) for u in
                                                  (-1, -0.66, -0.33, 0, 0.33, 0.66, 1)], 0.004)
            ch.add('head', tube(pts, [0.006, 0.009, 0.011, 0.011, 0.011, 0.009, 0.006], 5, dark))
            continue
        hh = h * (0.62 if kind == 'sleepy' else 1.0)
        ch.add('head', decal(HEAD_C, HEAD_R, d, w, hh, dark, segs=12, rows=2, lift=0.004, dome=0.007))
        ch.add('head', decal(HEAD_C, HEAD_R, d, w * 0.34, w * 0.34, white, segs=8, rows=1, lift=0.014, dome=0.002,
                             offset=(side * -0.0 + 0.012, hh * 0.38)))
        ch.add('head', decal(HEAD_C, HEAD_R, d, w * 0.17, w * 0.17, white, segs=6, rows=1, lift=0.014, dome=0.0,
                             offset=(-0.012, -hh * 0.42)))
        if kind == 'sleepy':  # a heavy lid line over a half-open eye
            pts = surface_curve(HEAD_C, HEAD_R, d, [(u * w * 1.15, hh * 0.95) for u in (-1, -0.5, 0, 0.5, 1)], 0.008)
            ch.add('head', tube(pts, 0.009, 5, dark))


def brows(ch, color, inner=(0.03, 0.088), outer=(0.05, 0.1), thick=0.011, az=EYE_AZ, el=EYE_EL, arch=0.008):
    """Brow bars above the eyes; inner/outer: (sideways from the eye centre toward the nose / away from it, up
    from the eye centre). An inner end lower than the outer end looks grumpy, higher looks worried."""
    m = pal(color, 0.5)
    for side in (1, -1):
        d = hdir(side * az, el)
        a = (-side * inner[0], inner[1])
        b = (side * outer[0], outer[1])
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + arch)
        pts = surface_curve(HEAD_C, HEAD_R, d, [a, mid, b], 0.01)
        ch.add('head', tube(pts, [thick * 0.7, thick, thick * 0.7], 5, m))


def cheeks(ch, color='cheek', w=0.044, h=0.027):
    for side in (1, -1):
        ch.add('head', decal(HEAD_C, HEAD_R, hdir(side * 0.64, -0.33), w, h, pal(color, 0.6), segs=10, rows=1,
                             lift=0.003, dome=0.003))


def mouth(ch, kind='smile', w=0.042, el=-0.43, color='night'):
    d = hdir(0, el)
    dark = pal(color, 0.3)
    if kind in ('smile', 'small'):
        ww = w * (0.7 if kind == 'small' else 1.0)
        pts = surface_curve(HEAD_C, HEAD_R, d, [(u * ww, -0.016 * (1 - u * u) * (ww / w)) for u in
                                                (-1, -0.66, -0.33, 0, 0.33, 0.66, 1)], 0.004)
        ch.add('head', tube(pts, [0.005, 0.0075, 0.0085, 0.009, 0.0085, 0.0075, 0.005], 5, dark))
    elif kind == 'flat':
        pts = surface_curve(HEAD_C, HEAD_R, d, [(u * w * 0.6, 0.0) for u in (-1, 0, 1)], 0.004)
        ch.add('head', tube(pts, 0.007, 5, dark))
    elif kind == 'open':   # an open, happy "D" mouth with a tongue
        ch.add('head', decal(HEAD_C, HEAD_R, hdir(0, el - 0.03), w * 0.8, w * 0.55, dark, segs=12, rows=1, lift=0.003,
                             dome=0.002))
        ch.add('head', decal(HEAD_C, HEAD_R, hdir(0, el - 0.07), w * 0.42, w * 0.22, pal('rose', 0.5), segs=8, rows=1,
                             lift=0.006, dome=0.0))


def nose(ch, skin, r=0.026):
    p, n = ell_dir(HEAD_C, HEAD_R, hdir(0, -0.25))
    ch.add('head', ellipsoid(p + n * 0.004, (r * 1.1, r * 0.85, r * 0.8), 8, 5, None, pal(skin, 0.5)))


def freckles(ch, color='wood'):
    for side in (1, -1):
        for du, dv in ((-0.012, 0.012), (0.012, 0.0), (-0.006, -0.014), (0.022, 0.016)):
            ch.add('head', decal(HEAD_C, HEAD_R, hdir(side * 0.6, -0.25), 0.0065, 0.0065, pal(color, 0.6), segs=5, rows=1,
                                 lift=0.004, dome=0.0, offset=(du, dv)))


# ------------------------------------------------------------------ hair
def hair_cap(ch, color, front=0.36, side=-0.22, back=-0.78, fringe=0.15, locks=4, puff=0.028, lumps=0.0,
             segs=18, rows=5, part='head', front_width=1.1, extra_puff=None, sideburn=0.0):
    """A hair cap from the crown down to a hairline that dips into locks over the forehead. The edge is tucked
    back into the head, so it reads as a thick rim. extra_puff(az, t) adds volume (bobs, puffs)."""
    m = pal(color, 0.45)
    R = HEAD_R

    def emin(a):
        ca = math.cos(a)
        base = side + (front - side) * ca if ca >= 0 else side + (back - side) * (-ca) ** 0.8
        w = smoothstep(front_width, 0.2, abs(a))
        base -= fringe * w * abs(math.sin(locks * a * 0.5 * math.pi / front_width)) ** 0.7
        if sideburn:   # locks in front of the ears
            base -= sideburn * math.exp(-((abs(a) - 1.25) / 0.16) ** 2)
        return base

    g = Geo()
    pole = g.vert(HEAD_C + Vector((0, R[1] + puff, 0)))
    grid = []
    for i in range(1, rows + 1):
        t = i / rows
        row = []
        for j in range(segs):
            a = -math.pi + math.tau * j / segs
            e = math.pi / 2 - t * (math.pi / 2 - emin(a))
            d = hdir(a, e)
            wave = math.sin(7 * a + 1.0) * 0.6 + math.sin(4 * a - 0.5) * 0.4
            pf = puff * (1 + lumps * wave * t) + (extra_puff(a, t) if extra_puff else 0.0)
            row.append(g.vert(HEAD_C + Vector((d.x * (R[0] + pf), d.y * (R[1] + pf), d.z * (R[2] + pf)))))
        grid.append(row)
    lip = []
    for j in range(segs):
        a = -math.pi + math.tau * j / segs
        d = hdir(a, emin(a) + 0.05)
        lip.append(g.vert(HEAD_C + Vector((d.x * (R[0] - 0.015), d.y * (R[1] - 0.015), d.z * (R[2] - 0.015)))))
    fan(g, pole, grid[0], m)
    grid_faces(g, grid + [lip], m)
    orient_ref(g, 0, UP)
    ch.add(part, g)
    return g


def lock(ch, color, az, el, length=0.5, r=0.034, curl=0.25, out=0.0, puff=0.028, part='head', sides=6):
    """A chunky lock of hair lying on the hair cap: it starts at (az, el) and runs down the head, tapering and
    curling sideways at the tip (fringe locks, side locks, nape flicks)."""
    pts, radii = [], []
    for i in range(5):
        t = i / 4
        d = hdir(az + curl * t * t, el - length * t)
        rr = puff + 0.006 + out * t * t
        pts.append(HEAD_C + Vector((d.x * (HEAD_R[0] + rr), d.y * (HEAD_R[1] + rr), d.z * (HEAD_R[2] + rr))))
        radii.append(r * (1 - 0.75 * t))
    ch.add(part, tube(pts, radii, sides, pal(color, 0.45), flatten=0.6))


def tuft(ch, color, base=(0.0, 1.075, -0.02), tip=(0.035, 1.16, -0.07), r=0.03):
    b, t = Vector(base), Vector(tip)
    mid = (b + t) / 2 + Vector((-0.02, 0.02, 0.03))
    ch.add('head', tube([b, mid, t], [r, r * 0.6, r * 0.2], 6, pal(color, 0.45)))


# ------------------------------------------------------------------ body
COAT = [(0.0, 0.2), (0.15, 0.204), (0.196, 0.222), (0.193, 0.27), (0.176, 0.36), (0.16, 0.45), (0.148, 0.53),
        (0.126, 0.6), (0.07, 0.642), (0.0, 0.652)]
DRESS = [(0.0, 0.1), (0.17, 0.103), (0.218, 0.125), (0.212, 0.18), (0.19, 0.29), (0.168, 0.4), (0.152, 0.5),
         (0.13, 0.59), (0.075, 0.638), (0.0, 0.65)]
SHIRT = [(0.0, 0.24), (0.15, 0.244), (0.17, 0.27), (0.168, 0.34), (0.158, 0.43), (0.148, 0.52), (0.128, 0.6),
         (0.072, 0.64), (0.0, 0.65)]


def torso(ch, profile, color, segs=14, mats=None, sz=0.84, wide=None):
    w = ch.wide if wide is None else wide
    prof = [(r * w, y) for r, y in profile]
    ch.add('body', lathe(prof, segs, (0, 0, 0), 1.0, sz, None, pal(color, 0.55) if color else None,
                         [pal(m, 0.55) for m in mats] if mats else None))


def torso_radius(profile, y, wide=1.0):
    for (r0, y0), (r1, y1) in zip(profile, profile[1:]):
        if y0 <= y <= y1:
            return (r0 + (r1 - r0) * (y - y0) / (y1 - y0)) * wide
    return 0.0


def band(ch, profile, y, color, h=0.03, out=0.008, segs=14, sz=0.84):
    """A ring of trim around the torso at height y (belts, hems, stripes)."""
    r = torso_radius(profile, y, ch.wide) + out
    ch.add('body', lathe([(0.0, y - h / 2), (r * 0.97, y - h / 2), (r, y), (r * 0.97, y + h / 2), (0.0, y + h / 2)],
                         segs, (0, 0, 0), 1.0, sz, None, pal(color, 0.5)))


def front_point(profile, y, x=0.0, sz=0.84, wide=1.0):
    r = torso_radius(profile, y, wide)
    z = sz * math.sqrt(max(r * r - x * x, 0.0))
    return Vector((x, y, z))


def buttons(ch, profile, ys, color='gold', r=0.016, x=0.0, sz=0.84):
    for y in ys:
        p = front_point(profile, y, x, sz, ch.wide)
        ch.add('body', ellipsoid(p + Vector((0, 0, 0.004)), (r, r, r * 0.6), 6, 3, None, pal(color, 0.35)))


def arms(ch, sleeve, hand='skin', cuff=None, r0=0.058, r1=0.05, segs=7, hand_scale=1.0):
    for side, part in ((1, 'arm_l'), (-1, 'arm_r')):
        sh = ch.pivots[part]
        w, h = ch.wrist(side), ch.hand(side)
        mid = (sh + w) / 2 + Vector((side * 0.008, 0, 0.005))
        top = sh + Vector((-side * 0.04, -0.012, 0.0))   # starts inside the torso: a soft, sloped shoulder
        ch.add(part, tube([top, mid, w], [r0, (r0 + r1) / 2 + 0.003, r1], segs, pal(sleeve, 0.55), round_caps=0.7))
        if cuff:
            d = (w - sh).normalized()
            ch.add(part, torus(w - d * 0.012, r1 * 0.92, 0.016, 10, 4, frame(d, FWD) @ Matrix.Rotation(math.pi / 2, 3, 'X'),
                               pal(cuff, 0.5)))
        hs = hand_scale
        ch.add(part, ellipsoid(h, (0.05 * hs, 0.054 * hs, 0.05 * hs), 9, 6, None, pal(hand, 0.5)))


def legs(ch, pants, boot='boot', r=0.056, boot_r=(0.072, 0.072, 0.104), top_y=0.31, cuff=None, tall=0.0):
    for side, part in ((1, 'leg_l'), (-1, 'leg_r')):
        hp = ch.pivots[part]
        ch.add(part, tube([hp + Vector((0, 0.01, 0)), Vector((hp.x, 0.13, 0.0))], r, 7, pal(pants, 0.55), round_caps=0.2))
        bc = Vector((hp.x * 1.03, 0.07, 0.024))
        ch.add(part, superellipsoid(bc, boot_r, 2.8, 10, 6, None, pal(boot, 0.45)))
        if tall:
            ch.add(part, tube([Vector((hp.x, 0.06, 0.0)), Vector((hp.x, 0.07 + tall, 0.0))], r * 1.18, 10, pal(boot, 0.45),
                              round_caps=0.3))
        if cuff:
            ch.add(part, torus(Vector((hp.x, 0.125 + tall, 0.005)), r * 1.05, 0.017, 8, 4, None, pal(cuff, 0.45)))


def scarf(ch, color, y=0.625, tail_side=-1):
    m = pal(color, 0.6)
    ch.add('body', torus(Vector((0, y, 0.0)), 0.105, 0.045, 12, 5, None, m, sy=0.85))
    # a knot at the front and a tail hanging over the chest
    ch.add('body', ellipsoid(Vector((tail_side * 0.05, y - 0.01, 0.115)), (0.04, 0.04, 0.03), 6, 4, None, m))
    pts = [Vector((tail_side * 0.06, y - 0.03, 0.125)), Vector((tail_side * 0.085, y - 0.1, 0.15)),
           Vector((tail_side * 0.09, y - 0.18, 0.15))]
    ch.add('body', tube(pts, [0.03, 0.03, 0.026], 6, m, flatten=0.45, up=(1, 0, 0)))


# ------------------------------------------------------------------ hats and props
def brim_hat(ch, crown_color, brim_color=None, band_color=None, brim=0.36, crown_r=0.2, crown_h=0.14, y=1.0,
             tilt=-0.12, back_brim=1.0, segs=22, crown_shape=None):
    """A round hat: a flat brim and a domed crown, tilted back a little."""
    cm = pal(crown_color, 0.6)
    bm_ = pal(brim_color or crown_color, 0.6)
    R = Matrix.Rotation(tilt, 3, 'X')
    c = Vector((0, y, 0.0))
    g = Geo()
    prof = crown_shape or [(0.0, 0.0), (crown_r, 0.0), (crown_r * 1.0, crown_h * 0.5), (crown_r * 0.86, crown_h * 0.9),
                           (crown_r * 0.5, crown_h * 1.04), (0.0, crown_h * 1.08)]
    g.add(lathe(prof, segs, (0, 0, 0), 1.0, 1.0, None, cm))
    brim_g = lathe([(0.0, -0.012), (brim * 0.98, -0.012), (brim, 0.0), (brim * 0.98, 0.012), (0.0, 0.016)], segs,
                   (0, 0, 0), 1.0, 1.0, None, bm_)
    if back_brim != 1.0:   # a longer brim behind (sou'wester)
        for i, v in enumerate(brim_g.v):
            if v.z < 0:
                brim_g.v[i] = Vector((v.x, v.y - 0.25 * (-v.z) * (back_brim - 1), v.z * back_brim))
    g.add(brim_g)
    if band_color:
        g.add(lathe([(0.0, 0.012), (crown_r * 1.035, 0.012), (crown_r * 1.04, 0.035), (crown_r * 1.0, 0.052),
                     (0.0, 0.052)], segs, (0, 0, 0), 1.0, 1.0, None, pal(band_color, 0.5)))
    g.xf(R).move(c)
    ch.add('head', g)
    return g


def stick(a, b, r, m, sides=6):
    return tube([Vector(a), Vector(b)], r, sides, m, round_caps=0.4)
