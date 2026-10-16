"""The Keeper (the player) -> public/assets/models/keeper.glb (see docs/ART-CONTRACT.md).

A chibi child about 1.12 m tall: big head with a brown fringe and cowlick, big glossy eyes, pink cheeks,
teal coat with gold buttons, orange scarf, a satchel, brown boots, and Nana's bell mallet in the right hand.

    blender -b --factory-startup --python art/blender/kit/build_keeper.py -- [--render]

Root `keeper` with body, head, arm_l, arm_r, leg_l, leg_r (pivots at hips, neck, shoulders, hips) and
`mallet` (pivot at the grip in the right hand) as a child of arm_r.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_chibi as K  # noqa: E402
from kit_cast import (FWD, Cast, Geo, Matrix, Vector, args, ellipsoid, frame, lathe, pal, sheet, style,  # noqa: E402
                      torus, tube)

FILE = 'keeper'
BUDGET = 3000


def satchel(ch):
    pts = []
    for i in range(6):
        t = i / 5
        x, y = 0.115 + (-0.17 - 0.115) * t, 0.585 + (0.31 - 0.585) * t
        p = K.front_point(K.COAT, y, x, 0.84, ch.wide)
        pts.append(p + Vector((0, 0, 0.012)))
    ch.add('body', tube(pts, 0.024, 6, pal('wood_dark', 0.5), flatten=0.3, up=(0, 0, 1)))
    bag_c = Vector((-0.185, 0.29, 0.07))
    ch.add('body', K.superellipsoid(bag_c, (0.072, 0.066, 0.05), 3.0, 10, 5,
                                    Matrix.Rotation(0.35, 3, 'Y'), pal('wood', 0.5)))
    ch.add('body', K.superellipsoid(bag_c + Vector((-0.012, 0.03, 0.03)), (0.07, 0.035, 0.03), 3.0, 6, 4,
                                    Matrix.Rotation(0.35, 3, 'Y'), pal('wood_dark', 0.5)))
    ch.add('body', ellipsoid(bag_c + Vector((-0.02, 0.012, 0.064)), (0.014, 0.014, 0.008), 6, 3, None, pal('gold', 0.35)))


def mallet(ch):
    """Nana's bell mallet: a wooden handle with a golden bell head and a red ribbon. Pivot at the grip."""
    grip = ch.hand(-1) + Vector((0, 0.0, 0.01))
    d = Vector((-0.1, 0.62, 0.78)).normalized()
    a = d.cross(Vector((1, 0, 0))).normalized()          # bell axis, in the swing plane
    g = Geo()
    wood, gold, red = pal('wood', 0.5), pal('gold', 0.3, 0.3), pal('red', 0.5)
    g.add(tube([grip - d * 0.1, grip + d * 0.42], [0.02, 0.018], 6, wood, round_caps=0.5))
    hc = grip + d * 0.45
    R = frame(a) @ Matrix.Rotation(math.pi / 2, 3, 'X')   # local Y -> bell axis (mouth at -a)
    bell = [(0.0, 0.022), (0.06, 0.016), (0.086, 0.0), (0.084, 0.022), (0.066, 0.06), (0.058, 0.1), (0.05, 0.13),
            (0.034, 0.152), (0.0, 0.158)]
    g.add(lathe(bell, 10, (0, 0, 0), 1.0, 1.0, R, gold).move(hc - a * 0.08))
    g.add(ellipsoid(hc - a * 0.075, 0.03, 6, 4, None, pal('wood_dark', 0.4)))      # clapper peeking out
    g.add(torus(hc + a * 0.082, 0.016, 0.009, 8, 4, R, gold))                       # crown loop
    # ribbon tied under the head
    rc = grip + d * 0.35
    g.add(torus(rc, 0.023, 0.008, 8, 4, frame(d) @ Matrix.Rotation(math.pi / 2, 3, 'X'), red))
    side = Vector((1, 0, 0))
    for s in (1, -1):
        g.add(ellipsoid(rc + side * s * 0.03 + FWD * 0.01, (0.028, 0.016, 0.01), 6, 3,
                        Matrix.Rotation(s * 0.5, 3, 'Z'), red))
    ch.extra['mallet'] = ('arm_r', g, grip)


def keeper():
    ch = K.Chibi('keeper', 1.12)
    K.head(ch, 'skin')
    K.eyes(ch)
    K.cheeks(ch)
    K.mouth(ch, 'smile')
    K.hair_cap(ch, 'hair', front=0.42, side=-0.12, back=-0.72, fringe=0.14, locks=4, lumps=0.45, sideburn=0.22)
    for az, el, ln, cu in ((-0.32, 0.95, 0.62, -0.32), (0.05, 1.0, 0.66, 0.28), (0.42, 0.92, 0.58, 0.3)):
        K.lock(ch, 'hair', az, el, ln, 0.036, cu)
    K.tuft(ch, 'hair')
    K.torso(ch, K.COAT, 'coat')
    K.band(ch, K.COAT, 0.214, 'scarf', h=0.026)
    K.buttons(ch, K.COAT, (0.5, 0.42, 0.34))
    K.scarf(ch, 'scarf')
    satchel(ch)
    K.arms(ch, 'coat', 'skin', cuff='scarf')
    K.legs(ch, 'navy', 'boot', cuff='boot')
    mallet(ch)
    return ch


def emit(cast, ch):
    root = cast.root(ch.name)
    parts, piv, extra = ch.finish()
    objs = {}
    for p in K.PARTS:
        objs[p] = cast.part(root, p, parts[p], piv[p])
    for n, (parent, g, pv) in extra.items():
        objs[n] = cast.part(objs[parent], n, g, pv)
    return root


def build():
    style.reset_scene()
    cast = Cast(FILE)
    emit(cast, keeper())
    return cast


def main():
    cast = build()
    cast.export({'keeper': BUDGET})
    if '--render' in args():
        sheet(cast, 'keeper.png', size=(900, 900), elev=45, yaw=28, ortho=1.9)
        sheet(cast, 'keeper-front.png', size=(900, 900), elev=10, yaw=20, ortho=1.6)


if __name__ == '__main__':
    main()
