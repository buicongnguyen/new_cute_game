"""The crew and isle folk -> public/assets/models/crew.glb (see docs/ART-CONTRACT.md and docs/STORY.md).

Eight chibi people built on the Keeper's body plan (kit_chibi.py), each with its own silhouette:
    nana  shawl, white bun, cane, happy closed eyes         pip   straw hat, green overalls, freckles
    olla  mayor sash and medal, round glasses, white bob    kai   yellow sou'wester, white beard, striped sweater
    mina  tall chef hat, apron, wooden spoon                coal  wild white hair, soot apron, grumpy brows
    tam   leather apron, goggles, big gloves                ria   red bandana, ponytail, spyglass

    blender -b --factory-startup --python art/blender/kit/build_crew.py -- [--render]

Each root has children body, head, arm_l, arm_r, leg_l, leg_r (pivots at hips, neck, shoulders, hips).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_chibi as K  # noqa: E402
from kit_cast import (FWD, UP, Cast, Geo, Matrix, Vector, args, decal, ell_dir, ellipsoid, frame, lathe, loft, pal,  # noqa: E402
                      sheet, style, torus, tube)
from build_keeper import emit  # noqa: E402

FILE = 'crew'
BUDGET = 2500
ORDER = ['nana', 'pip', 'olla', 'kai', 'mina', 'coal', 'tam', 'ria']


# ------------------------------------------------------------------ shared dress-up helpers
def prof_r(profile, y, wide):
    """Torso radius at y, clamped to the profile's ends (for aprons that hang past the hem)."""
    ys = [p[1] for p in profile if p[0] > 0]
    y = max(min(ys), min(max(ys), y))
    return K.torso_radius(profile, y, wide)


def front_shell(ch, profile, color, y0, y1, half=1.15, out=0.012, thick=0.012, cols=7, rows=4, flare=0.0, sz=0.84,
                part='body'):
    """A thin curved panel on the front of the torso (aprons): a closed slab, so it shades cleanly."""
    rings = []
    for i in range(rows + 1):
        y = y1 + (y0 - y1) * i / rows
        extra = flare * (i / rows) ** 2
        ring = []
        for sgn, dr in ((1, out + thick + extra), (-1, out + extra)):
            for j in range(cols + 1):
                jj = j if sgn > 0 else cols - j
                a = -half + 2 * half * jj / cols
                r = prof_r(profile, y, ch.wide) + dr
                ring.append(Vector((r * math.sin(a), y, sz * r * math.cos(a))))
        rings.append(ring)
    ch.add(part, loft(rings, pal(color, 0.6)))


def strap(ch, profile, a, b, color, r=0.024, n=6, out=0.012, flat=0.3):
    """A strap across the chest from (x, y) a to b, lying on the torso's front."""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        x, y = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        pts.append(K.front_point(profile, y, x, 0.84, ch.wide) + Vector((0, 0, out)))
    ch.add('body', tube(pts, r, 6, pal(color, 0.5), flatten=flat, up=(0, 0, 1)))
    return pts


def eye_point(side, lift=0.0):
    p, n = ell_dir(K.HEAD_C, K.HEAD_R, K.hdir(side * K.EYE_AZ, K.EYE_EL))
    return p + n * lift, n


# ------------------------------------------------------------------ the crew
def nana():
    ch = K.Chibi('nana', 0.98)
    K.head(ch, 'skin', ears=False)
    K.eyes(ch, 'happy')
    K.brows(ch, 'hair_white', inner=(0.03, 0.075), outer=(0.05, 0.07), thick=0.009, arch=0.012)
    K.cheeks(ch)
    K.mouth(ch, 'smile', w=0.036)
    K.nose(ch, 'skin', 0.022)
    K.hair_cap(ch, 'hair_white', front=0.62, side=-0.2, back=-0.62, fringe=0.0, lumps=0.4)
    for az in (-0.42, 0.0, 0.42):   # combed-back waves
        K.lock(ch, 'hair_white', az, 1.18, 0.42, 0.03, 0.0, puff=0.026)
    bun_c = K.HEAD_C + Vector((0, 0.235, -0.09))
    ch.add('head', ellipsoid(bun_c, (0.105, 0.09, 0.1), 9, 6, None, pal('hair_white', 0.45)))
    ch.add('head', tube([bun_c + Vector((-0.14, 0.03, 0.0)), bun_c + Vector((0.14, -0.01, 0.02))], 0.011, 5,
                        pal('red', 0.5), round_caps=1.0))
    K.torso(ch, K.DRESS, 'navy')
    # shawl: a capelet over the shoulders, dipping to a point at the front, with a sunny trim
    prof = [(0.0, 0.672), (0.112, 0.668), (0.19, 0.615), (0.232, 0.53), (0.242, 0.478), (0.246, 0.462),
            (0.236, 0.452), (0.212, 0.46), (0.2, 0.53), (0.165, 0.6), (0.09, 0.645), (0.0, 0.65)]
    shawl = lathe(prof, 16, (0, 0, 0), 1.0, 0.86, None, None,
                  [pal('berry', 0.6)] * 4 + [pal('sun', 0.5)] * 3 + [pal('berry', 0.6)] * 4)
    for i, v in enumerate(shawl.v):
        if v.y < 0.6:
            dip = 0.12 * max(0.0, v.z / 0.2) ** 2 * (0.6 - v.y) / 0.15
            shawl.v[i] = Vector((v.x, v.y - dip, v.z))
    ch.add('body', shawl)
    ch.add('body', ellipsoid(Vector((0, 0.6, 0.165)), (0.03, 0.03, 0.014), 8, 4, None, pal('gold', 0.3)))
    K.arms(ch, 'navy', 'skin', cuff='berry')
    K.legs(ch, 'navy', 'wood_dark')
    # cane in the right hand
    h = ch.hand(-1)
    wd = pal('wood_dark', 0.5)
    ch.add('arm_r', tube([Vector((h.x, 0.41, h.z + 0.03)), Vector((h.x, 0.0, h.z + 0.08))], 0.017, 6, wd, round_caps=0.6))
    ch.add('arm_r', tube([Vector((h.x, 0.40, h.z + 0.03)), Vector((h.x, 0.455, h.z + 0.05)), Vector((h.x, 0.46, h.z + 0.11)),
                          Vector((h.x, 0.415, h.z + 0.135))], 0.017, 6, wd, round_caps=0.6))
    return ch


def pip():
    ch = K.Chibi('pip', 1.0)
    K.head(ch, 'skin')
    K.eyes(ch)
    K.cheeks(ch)
    K.freckles(ch, 'wood')
    K.mouth(ch, 'open')
    K.hair_cap(ch, 'pumpkin', front=0.3, side=-0.15, back=-0.7, fringe=0.12, locks=5, lumps=0.6, sideburn=0.2)
    for az, el, ln, cu in ((-1.05, 0.25, 0.45, -0.25), (1.05, 0.25, 0.45, 0.25)):
        K.lock(ch, 'pumpkin', az, el, ln, 0.034, cu, out=0.02)
    K.brim_hat(ch, 'straw', 'straw_light', 'red', brim=0.37, crown_r=0.19, crown_h=0.13, y=1.03, tilt=-0.2, segs=16)
    # yellow shirt with green overalls
    mats = ['leaf_dark'] * 3 + ['sun'] * 5
    K.torso(ch, K.SHIRT, None, mats=mats)
    bib_c = K.front_point(K.SHIRT, 0.47, 0.0, 0.84, ch.wide) + Vector((0, 0, -0.012))
    ch.add('body', K.superellipsoid(bib_c, (0.085, 0.07, 0.03), 4.0, 10, 5, None, pal('leaf_dark', 0.55)))
    for sd in (1, -1):
        strap(ch, K.SHIRT, (sd * 0.07, 0.52), (sd * 0.1, 0.61), 'leaf_dark', r=0.02, n=4)
        ch.add('body', ellipsoid(bib_c + Vector((sd * 0.058, 0.04, 0.03)), (0.014, 0.014, 0.008), 6, 3, None,
                                 pal('gold', 0.3)))
    ch.add('body', K.superellipsoid(bib_c + Vector((0, -0.005, 0.028)), (0.035, 0.028, 0.008), 4.0, 8, 4, None,
                                    pal('leaf', 0.55)))   # pocket
    K.arms(ch, 'sun', 'skin', cuff='leaf_dark')
    K.legs(ch, 'leaf_dark', 'boot', cuff='leaf_dark')
    return ch


def olla():
    ch = K.Chibi('olla', 1.05, wide=1.16)
    K.head(ch, 'skin', ears=False)
    K.eyes(ch, w=0.04, h=0.056)
    K.brows(ch, 'hair_white', inner=(0.03, 0.1), outer=(0.05, 0.11), thick=0.009, arch=0.01)
    K.cheeks(ch)
    K.mouth(ch, 'smile', w=0.034)
    K.nose(ch, 'skin', 0.024)
    K.hair_cap(ch, 'hair_white', front=0.5, side=-0.48, back=-0.62, fringe=0.07, locks=6, lumps=0.7,
               extra_puff=lambda a, t: 0.035 * t ** 3 * (1 - 0.6 * math.cos(a) ** 8))
    for k in range(6):   # neat curls along the hem of the bob
        az = math.radians(75 + 210 * k / 5)
        d = K.hdir(az, -0.42 if abs(math.cos(az)) < 0.8 else -0.5)
        c = K.HEAD_C + Vector((d.x * 0.275, d.y * 0.25, d.z * 0.265))
        ch.add('head', ellipsoid(c, (0.058, 0.047, 0.058), 6, 4, None, pal('hair_white', 0.45)))
    # a rose pinned in the hair
    fp, fn = ell_dir(K.HEAD_C, K.HEAD_R, K.hdir(1.15, 0.45))
    for k in range(5):
        a = k * math.tau / 5
        off = Vector((math.cos(a) * 0.028, math.sin(a) * 0.028, 0.0))
        ch.add('head', ellipsoid(fp + fn * 0.045 + frame(fn) @ off, 0.022, 5, 3, None, pal('rose', 0.5)))
    ch.add('head', ellipsoid(fp + fn * 0.055, 0.016, 5, 3, None, pal('sun', 0.5)))
    # round glasses
    gold = pal('gold', 0.3)
    inner_pts = []
    for side in (1, -1):
        p, n = eye_point(side, 0.024)
        ch.add('head', torus(p, 0.058, 0.0075, 12, 4, frame(n, UP) @ Matrix.Rotation(math.pi / 2, 3, 'X'), gold))
        inner_pts.append(p + Vector((-side * 0.058, 0.004, 0.0)))
    ch.add('head', tube([inner_pts[0], (inner_pts[0] + inner_pts[1]) / 2 + Vector((0, 0.012, 0.014)), inner_pts[1]],
                        0.0065, 4, gold))
    K.torso(ch, K.DRESS, 'cherry')
    K.band(ch, K.DRESS, 0.11, 'sun', h=0.024)
    pts = strap(ch, K.DRESS, (-0.13, 0.6), (0.17, 0.27), 'sun', r=0.042, n=6, flat=0.25)
    medal = pts[2] + Vector((0, 0, 0.012))
    ch.add('body', lathe([(0.0, -0.008), (0.04, -0.008), (0.044, 0.0), (0.04, 0.008), (0.0, 0.01)], 12, (0, 0, 0), 1.0,
                         1.0, Matrix.Rotation(math.pi / 2, 3, 'X'), gold).move(medal))
    ch.add('body', ellipsoid(medal + Vector((0, 0, 0.012)), (0.018, 0.018, 0.006), 6, 3, None, pal('red', 0.5)))
    K.arms(ch, 'cherry', 'skin', cuff='sun')
    K.legs(ch, 'charcoal', 'wood_dark')
    return ch


def kai():
    ch = K.Chibi('kai', 1.1)
    K.head(ch, 'skin', ears=False)
    K.eyes(ch, w=0.04, h=0.054)
    K.brows(ch, 'hair_white', inner=(0.035, 0.085), outer=(0.06, 0.075), thick=0.017, arch=0.014)
    K.cheeks(ch)
    K.nose(ch, 'skin', 0.03)
    K.hair_cap(ch, 'hair_white', front=0.7, side=-0.3, back=-0.72, fringe=0.0, lumps=0.5)
    white = pal('hair_white', 0.5)
    # a big soft beard and a moustache
    ch.add('head', ellipsoid(K.HEAD_C + Vector((0, -0.17, 0.115)), (0.19, 0.15, 0.14), 12, 7, None, white))
    for side in (1, -1):
        p, n = ell_dir(K.HEAD_C, K.HEAD_R, K.hdir(side * 0.17, -0.4))
        ch.add('head', ellipsoid(p + n * 0.03, (0.06, 0.028, 0.035), 8, 4, Matrix.Rotation(-side * 0.35, 3, 'Z'), white))
    K.brim_hat(ch, 'sun', 'sun', None, brim=0.31, crown_r=0.215, crown_h=0.14, y=0.99, tilt=-0.06, back_brim=1.45,
               segs=16)
    K.torso(ch, K.COAT, None, mats=['navy', 'navy', 'navy', 'white', 'navy', 'white', 'navy', 'navy', 'navy'])
    ch.add('body', torus(Vector((0, 0.625, 0)), 0.1, 0.038, 12, 5, None, pal('navy', 0.6), sy=0.8))
    K.arms(ch, 'navy', 'skin', cuff='white')
    K.legs(ch, 'charcoal', 'sun', tall=0.07)
    return ch


def mina():
    ch = K.Chibi('mina', 0.97)
    K.head(ch, 'skin', ears=False)
    K.eyes(ch)
    K.brows(ch, 'hair', inner=(0.03, 0.095), outer=(0.05, 0.105), thick=0.008, arch=0.01)
    K.cheeks(ch)
    K.mouth(ch, 'smile')
    K.hair_cap(ch, 'hair', front=0.42, side=-0.42, back=-0.6, fringe=0.13, locks=5, lumps=0.3,
               extra_puff=lambda a, t: 0.025 * t ** 3)
    # tall pleated chef hat
    prof = [(0.0, 0.975), (0.2, 0.975), (0.206, 1.04), (0.2, 1.065), (0.235, 1.12), (0.255, 1.2), (0.235, 1.27),
            (0.15, 1.315), (0.0, 1.325)]
    hat = lathe(prof, 18, (0, 0, 0), 1.0, 1.0, None, pal('white', 0.6))
    for i, v in enumerate(hat.v):
        if v.y > 1.07:
            a = math.atan2(v.x, v.z)
            k = 1 + 0.07 * math.sin(9 * a) * min(1.0, (v.y - 1.07) / 0.08)
            hat.v[i] = Vector((v.x * k, v.y, v.z * k))
    ch.add('head', hat.xf(Matrix.Rotation(-0.08, 3, 'X')))
    K.torso(ch, K.DRESS, 'rose')
    front_shell(ch, K.DRESS, 'white', 0.14, 0.53, half=1.0, flare=0.01)
    K.band(ch, K.DRESS, 0.43, 'white', h=0.03)
    K.arms(ch, 'rose', 'skin', cuff='white')
    K.legs(ch, 'navy', 'wood_dark')
    h = ch.hand(-1)
    wood = pal('wood_light', 0.5)
    ch.add('arm_r', tube([h + Vector((0, -0.05, 0.02)), h + Vector((0, 0.2, 0.09))], 0.012, 5, wood, round_caps=0.6))
    ch.add('arm_r', ellipsoid(h + Vector((0, 0.24, 0.105)), (0.035, 0.05, 0.016), 8, 5, Matrix.Rotation(-0.35, 3, 'X'),
                              wood))
    return ch


def coal():
    ch = K.Chibi('coal', 0.95, wide=1.12)
    K.head(ch, 'skin', ears=False)
    K.eyes(ch, w=0.04, h=0.052)
    K.brows(ch, 'hair_white', inner=(0.02, 0.065), outer=(0.055, 0.1), thick=0.017, arch=0.0)
    K.cheeks(ch)
    K.mouth(ch, 'flat')
    K.nose(ch, 'skin', 0.026)
    K.hair_cap(ch, 'hair_white', front=0.55, side=-0.35, back=-0.66, fringe=0.05, puff=0.05, lumps=0.8)
    white = pal('hair_white', 0.5)
    for az, el, r in ((0.9, 0.25, 0.088), (-0.9, 0.25, 0.088), (1.65, 0.05, 0.085), (-1.65, 0.05, 0.085),
                      (2.6, 0.2, 0.095), (-2.6, 0.2, 0.095), (0.4, 0.78, 0.085), (-0.4, 0.78, 0.085)):
        d = K.hdir(az, el)
        c = K.HEAD_C + Vector((d.x * 0.26, d.y * 0.25, d.z * 0.25))
        ch.add('head', ellipsoid(c, r, 7, 5, None, white))
    K.torso(ch, K.DRESS, 'red')
    front_shell(ch, K.DRESS, 'charcoal', 0.13, 0.5, half=1.1, flare=0.012)
    ch.add('body', K.superellipsoid(K.front_point(K.DRESS, 0.25, 0.06, 0.84, ch.wide) + Vector((0, 0, 0.028)),
                                    (0.05, 0.04, 0.012), 4.0, 8, 4, None, pal('iron', 0.6)))
    K.band(ch, K.DRESS, 0.46, 'charcoal', h=0.03)
    K.arms(ch, 'red', 'skin', cuff='charcoal')
    K.legs(ch, 'charcoal', 'boot')
    return ch


def tam():
    ch = K.Chibi('tam', 1.12)
    K.head(ch, 'skin')
    K.eyes(ch, w=0.044, h=0.062)
    K.brows(ch, 'soil_dark', inner=(0.03, 0.098), outer=(0.05, 0.088), thick=0.01, arch=0.004)
    K.cheeks(ch, w=0.05, h=0.03)
    K.mouth(ch, 'small')
    K.hair_cap(ch, 'soil_dark', front=0.38, side=-0.14, back=-0.72, fringe=0.15, locks=4, lumps=0.6, sideburn=0.2)
    for az, el, ln, cu in ((0.25, 1.05, 0.5, 0.35), (-0.3, 1.0, 0.5, -0.3)):
        K.lock(ch, 'soil_dark', az, el, ln, 0.034, cu)
    # goggles pushed up on the forehead
    ch.add('head', torus(K.HEAD_C + Vector((0, 0.1, -0.01)), 0.262, 0.016, 16, 4, Matrix.Rotation(-0.42, 3, 'X'),
                         pal('charcoal', 0.6), sy=1.4))
    for side in (1, -1):
        p, n = ell_dir(K.HEAD_C, (K.HEAD_R[0] + 0.03, K.HEAD_R[1] + 0.03, K.HEAD_R[2] + 0.03), K.hdir(side * 0.33, 0.5))
        R = frame(n, UP) @ Matrix.Rotation(math.pi / 2, 3, 'X')
        ch.add('head', lathe([(0.0, -0.012), (0.05, -0.012), (0.056, 0.0), (0.05, 0.022), (0.0, 0.016)], 10, (0, 0, 0),
                             1.0, 1.0, R, pal('iron', 0.4)).move(p))
        ch.add('head', ellipsoid(p + n * 0.017, (0.04, 0.04, 0.012), 8, 4, frame(n, UP), pal('glass', 0.15)))
    K.torso(ch, K.SHIRT, 'tangerine')
    front_shell(ch, K.SHIRT, 'bark', 0.12, 0.6, half=1.0, flare=0.035)
    strap(ch, K.SHIRT, (0.06, 0.59), (0.04, 0.645), 'bark', r=0.016, n=3)
    strap(ch, K.SHIRT, (-0.06, 0.59), (-0.04, 0.645), 'bark', r=0.016, n=3)
    K.arms(ch, 'tangerine', 'wood', cuff='wood', hand_scale=1.25)   # chunky leather gloves
    K.legs(ch, 'charcoal', 'boot', cuff='boot')
    return ch


def ria():
    ch = K.Chibi('ria', 1.05)
    K.head(ch, 'skin')
    K.eyes(ch)
    K.brows(ch, 'hair', inner=(0.03, 0.086), outer=(0.05, 0.106), thick=0.011, arch=0.0)
    K.cheeks(ch)
    K.mouth(ch, 'open', w=0.04)
    K.hair_cap(ch, 'hair', front=0.36, side=-0.15, back=-0.7, fringe=0.14, locks=4, lumps=0.4, sideburn=0.22)
    # bandana over the hair, knotted at the back
    red = pal('red', 0.55)
    K.hair_cap(ch, 'red', front=0.62, side=0.18, back=-0.25, fringe=0.0, puff=0.05, segs=18, rows=4)
    knot = K.HEAD_C + Vector((0, 0.04, -0.27))
    ch.add('head', ellipsoid(knot, (0.04, 0.035, 0.03), 8, 4, None, red))
    for side in (1, -1):
        ch.add('head', tube([knot, knot + Vector((side * 0.05, -0.07, -0.03)), knot + Vector((side * 0.07, -0.13, -0.035))],
                            [0.026, 0.022, 0.012], 5, red, flatten=0.4))
    for az, el in ((0.0, 0.85), (0.6, 0.55), (-0.6, 0.55), (1.3, 0.75), (-1.3, 0.75)):
        ch.add('head', decal(K.HEAD_C, (K.HEAD_R[0] + 0.05, K.HEAD_R[1] + 0.05, K.HEAD_R[2] + 0.05), K.hdir(az, el),
                             0.018, 0.018, pal('white', 0.4), segs=6, rows=1, lift=0.004, dome=0.0))
    # ponytail
    tie = K.HEAD_C + Vector((0, -0.02, -0.25))
    hair = pal('hair', 0.45)
    ch.add('head', ellipsoid(tie, (0.03, 0.03, 0.025), 6, 4, None, pal('sun', 0.5)))
    ch.add('head', tube([tie, tie + Vector((0, -0.04, -0.08)), tie + Vector((0.0, -0.15, -0.11)),
                         tie + Vector((0.02, -0.24, -0.08))], [0.05, 0.055, 0.04, 0.012], 7, hair))
    K.torso(ch, K.SHIRT, 'sky')
    K.band(ch, K.SHIRT, 0.3, 'wood_dark', h=0.035)
    K.buttons(ch, K.SHIRT, (0.3,), 'gold', r=0.022)
    K.buttons(ch, K.SHIRT, (0.42, 0.52), 'white', r=0.013)
    K.arms(ch, 'sky', 'skin', cuff='white')
    K.legs(ch, 'navy', 'boot', cuff='boot')
    # spyglass in the right hand
    h = ch.hand(-1)
    d = Vector((0.0, 0.45, 0.9)).normalized()
    gold, wd = pal('gold', 0.3), pal('wood_dark', 0.5)
    ch.add('arm_r', tube([h - d * 0.06, h + d * 0.08], 0.03, 8, wd, round_caps=0.2))
    ch.add('arm_r', tube([h + d * 0.07, h + d * 0.19], 0.038, 8, gold, round_caps=0.2))
    ch.add('arm_r', tube([h + d * 0.18, h + d * 0.27], 0.046, 8, gold, round_caps=0.1))
    return ch


BUILDERS = dict(nana=nana, pip=pip, olla=olla, kai=kai, mina=mina, coal=coal, tam=tam, ria=ria)


def build():
    style.reset_scene()
    cast = Cast(FILE)
    for n in ORDER:
        emit(cast, BUILDERS[n]())
    return cast


def main():
    cast = build()
    cast.export({n: BUDGET for n in ORDER})
    if '--render' in args():
        sheet(cast, 'crew.png', rows=[ORDER], gap=0.32, size=(2000, 760), elev=45, yaw=0, ortho=7.4)
        sheet(cast, 'crew-front.png', rows=[ORDER], gap=0.32, size=(2000, 640), elev=8, yaw=0, ortho=7.4)


if __name__ == '__main__':
    main()
