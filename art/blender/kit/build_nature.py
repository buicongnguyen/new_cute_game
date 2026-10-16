"""Cloudback isle scenery, drawn instanced: every root is one mesh with one or two materials.

Roots (docs/ART-CONTRACT.md): rock_a/b/c, bush_a/b, flower_a/b/c, grass_tuft, mushroom, tree_round,
tree_pine, palm, coral_a/b, lava_rock_a/b, fence, cloud_puff. Budgets: 400 triangles (trees 700,
cloud_puff 300). Origins are at the ground centre (cloud_puff: the centre of its flat underside).
Bottom faces that sit on the ground are dropped (the camera is always above).

Run from the repository root:
    blender -b --factory-startup --python art/blender/kit/build_nature.py -- [--render]
"""
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_world as K  # noqa: E402
from kit_world import (LATS, LATS5, LATS_LO, LATS_MIN, RAD, TAU, Piece, Vector, bez, blob, canopy, disc,  # noqa: E402
                       facing, ico0, lathe, leaf, leaf_frame, lobed, surface_point, tube, xf)
import style  # noqa: E402

FILE = 'nature.glb'
IDS = ['rock_a', 'rock_b', 'rock_c', 'bush_a', 'bush_b', 'flower_a', 'flower_b', 'flower_c', 'grass_tuft', 'mushroom',
       'tree_round', 'tree_pine', 'palm', 'coral_a', 'coral_b', 'lava_rock_a', 'lava_rock_b', 'fence', 'cloud_puff']
BUDGET = {'tree_round': 700, 'tree_pine': 700, 'palm': 700, 'cloud_puff': 300}


def mats():
    return dict(
        stone=K.M('stone', 0.7), stone_light=K.M('stone_light', 0.7), stone_dark=K.M('stone_dark', 0.75),
        moss=K.M('moss'), leaf=K.M('leaf'), leaf_light=K.M('leaf_light'), leaf_dark=K.M('leaf_dark'),
        grass=K.M('grass'), rose=K.M('rose', 0.5), red=K.M('red', 0.45), sky=K.M('sky', 0.45), sun=K.M('sun', 0.5),
        cream=K.M('cream', 0.6), bark=K.M('bark', 0.7), wood=K.M('wood', 0.6), wood_light=K.M('wood_light', 0.6),
        coral=K.M('coral', 0.5), teal=K.M('teal', 0.5), mint=K.M('mint', 0.5), soil_dark=K.M('soil_dark', 0.8),
        lava=K.G('lava', 'lava', 2.2), cloud=K.M('cloud', 0.9), cloud_shade=K.M('cloud_shade', 0.9),
        snow=K.M('snow', 0.85), sky_light=K.M('sky_light', 0.6), glass=K.M('glass', 0.35),
    )


def no_floor(g, eps=1e-4):
    return g.keep(lambda f, gg: not all(gg.verts[i].z <= eps for i in f))


def faceted(c, r, segs, lats, seed, planes, wobble=0.06, squash_floor=True):
    """A chunky stylised rock: a soft blob flattened by a few planes (big readable facets)."""
    g = blob(c, r, segs, lats, wobble, seed)
    cc = Vector(c)
    for v in g.verts:
        for d, lim in planes:
            d = Vector(d).normalized()
            over = (v - cc).dot(d) - lim
            if over > 0:
                v -= d * over * 0.85
        if squash_floor:
            v.z = max(v.z, 0.0)
    return no_floor(g)


# ===================================================================== rocks
def rock_a(m):
    p = Piece('rock_a')
    planes = [((0.3, -0.6, 0.75), 0.42), ((-0.8, -0.3, 0.5), 0.5), ((0.75, 0.4, 0.5), 0.5), ((0, 0, 1), 0.5),
              ((-0.3, 0.85, 0.45), 0.5), ((0.6, -0.7, 0.1), 0.55)]
    g = faceted((0, 0, 0.3), (0.62, 0.55, 0.55), 11, LATS5, 3, planes)
    # Moss on the sunlit top: faces facing up get pal_moss.
    g.retag(lambda c, n, t: 1 if n.z > 0.72 and c.z > 0.45 else 0)
    p.add(g, {0: m['stone'], 1: m['moss']})
    g2 = faceted((0.55, -0.32, 0.08), (0.28, 0.25, 0.24), 8, LATS_LO, 5, [((0, 0, 1), 0.14), ((0.7, -0.5, 0.4), 0.18)])
    p.add(g2, m['stone'])
    return p


def rock_b(m):
    p = Piece('rock_b')
    for i, (x, y, r, h) in enumerate(((-0.25, 0.05, 0.42, 0.32), (0.32, -0.12, 0.32, 0.24), (0.12, 0.36, 0.24, 0.18))):
        planes = [((0, 0, 1), h * 0.7), ((0.6, -0.6, 0.5), r * 0.75), ((-0.7, 0.2, 0.6), r * 0.8)]
        g = faceted((x, y, h * 0.25), (r, r * 0.88, h), 9, LATS_LO, 11 + i, planes, 0.08)
        g.retag(lambda c, n, t: 1 if n.z > 0.85 else 0)
        p.add(g, {0: m['stone'], 1: m['stone_light']})
    return p


def rock_c(m):
    p = Piece('rock_c')
    planes = [((0.2, -0.9, 0.2), 0.3), ((-0.9, 0.1, 0.2), 0.3), ((0.9, 0.3, 0.1), 0.32), ((-0.2, 0.9, 0.25), 0.3),
              ((0.3, -0.3, 0.9), 0.62), ((-0.5, 0.2, 0.85), 0.66)]
    g = faceted((0, 0, 0.62), (0.4, 0.36, 0.86), 9, (-60, -25, 10, 40, 65), 21, planes, 0.05)
    for v in g.verts:  # a slight lean
        v.x += 0.12 * (v.z / 1.5) ** 2
    g.retag(lambda c, n, t: 1 if c.z < 0.25 else 0)
    p.add(g, {0: m['stone'], 1: m['stone_dark']})
    g2 = faceted((-0.42, -0.25, 0.05), (0.22, 0.2, 0.2), 7, LATS_LO, 23, [((0, 0, 1), 0.12)])
    p.add(g2, m['stone_dark'])
    return p


# =================================================================== bushes
def bush_a(m):
    p = Piece('bush_a')
    blobs = [dict(c=(0.0, 0.05, 0.42), r=(0.5, 0.48, 0.42), segs=12, m=m['leaf_light'], lats=LATS5),
             dict(c=(0.36, -0.16, 0.28), r=(0.33, 0.31, 0.28), segs=10, m=m['leaf'], lats=LATS_LO),
             dict(c=(-0.36, -0.12, 0.27), r=(0.33, 0.31, 0.27), segs=10, m=m['leaf'], lats=LATS_LO, phase=0.3)]
    canopy(p, blobs, 0.05, floor=0.0, seed=3)
    return p


def bush_b(m):
    p = Piece('bush_b')
    blobs = [dict(c=(0.0, 0.0, 0.5), r=(0.42, 0.4, 0.46), segs=12, m=m['leaf_dark'], lats=LATS5),
             dict(c=(0.3, -0.12, 0.3), r=(0.3, 0.28, 0.3), segs=10, m=m['leaf_dark'], lats=LATS_LO),
             dict(c=(-0.28, 0.08, 0.32), r=(0.3, 0.28, 0.3), segs=10, m=m['leaf_dark'], lats=LATS_LO, phase=0.4)]
    canopy(p, blobs, 0.05, floor=0.0, seed=7)
    for i, (bi, d) in enumerate(((0, (0.1, -0.8, 0.6)), (0, (-0.6, -0.4, 0.6)), (0, (0.5, 0.2, 0.85)), (1, (0.6, -0.6, 0.4)),
                                 (2, (-0.6, -0.5, 0.4)), (0, (-0.2, 0.6, 0.75)), (1, (0.7, 0.4, 0.4)), (0, (0.3, -0.3, 0.95)))):
        pos, nrm = surface_point(blobs[bi], d, 0.01)
        p.add(disc(lobed(5, 2, 0.045, 0.085, 0.6), dome=0.03), m['rose'], facing(pos, nrm, spin=i * 0.9))
    return p


# ================================================================== flowers
def stem(p, m, base, top, r=0.016, sides=3):
    mid = (Vector(base) + Vector(top)) / 2 + Vector((0.02, 0.0, 0.0))
    p.add(tube([base, mid, top], [r, r * 0.9, r * 0.8], sides=sides), m)


def ground_leaves(p, m, specs):
    for yaw, pitch, ln, wd in specs:
        p.add(leaf(ln, wd, 3, 'leaf', 0.35, -0.25), m, leaf_frame((0, 0, 0.0), RAD(yaw), RAD(pitch)))


def flower_a(m):
    """Red tulips."""
    p = Piece('flower_a')
    for i, (x, y, h) in enumerate(((0.0, 0.02, 0.38), (-0.14, -0.08, 0.3), (0.13, -0.1, 0.27), (0.06, 0.15, 0.32))):
        top = Vector((x, y, h))
        stem(p, m['leaf'], (x * 0.4, y * 0.4, 0.0), top)

        def mod(th, k):
            return 1.0 + (0.18 * math.cos(3 * th) if k == 3 else 0.0)
        cup = lathe([(0.0, 0.0), (0.05, 0.012), (0.068, 0.05), (0.06, 0.1)], 6, mod=mod, phase=i * 0.5)
        for v in cup.verts:  # petal tips rise between the lobes
            if abs(v.z - 0.1) < 1e-6:
                v.z += 0.025 * max(0.0, math.cos(3 * (math.atan2(v.y, v.x) - i * 0.5)))
        p.add(cup, m['red'], xf(top))
    ground_leaves(p, m['leaf'], ((-60, 40, 0.24, 0.08), (60, 50, 0.22, 0.08), (170, 45, 0.2, 0.07)))
    return p


def flower_b(m):
    """Bluebells: arching stems with hanging blue bells."""
    p = Piece('flower_b')
    bell = lathe([(0.04, -0.06), (0.032, -0.05), (0.03, -0.025), (0.018, -0.004), (0.0, 0.0)], 5)
    for i, (yaw, reach, h) in enumerate(((-100, 0.12, 0.36), (20, 0.13, 0.3), (140, 0.11, 0.33))):
        d = Vector((math.cos(RAD(yaw)), math.sin(RAD(yaw)), 0))
        path = bez([(0, 0, 0), d * 0.02 + Vector((0, 0, h * 0.7)), d * reach + Vector((0, 0, h))], 4)
        p.add(tube(path, [0.014, 0.013, 0.011, 0.009], sides=3), m['leaf'])
        for t, drop in ((0.55, 0.03), (0.8, 0.02), (1.0, 0.025)):
            q = Vector(bez([(0, 0, 0), d * 0.02 + Vector((0, 0, h * 0.7)), d * reach + Vector((0, 0, h))], 11)[int(t * 10)])
            p.add(bell, m['sky'], xf(q - Vector((0, 0, drop)), (0, 0, i)))
    ground_leaves(p, m['leaf'], ((-30, 40, 0.22, 0.07), (90, 45, 0.2, 0.07), (210, 40, 0.22, 0.07)))
    return p


def flower_c(m):
    """Golden pom-pom flowers (marigold-like ruffled domes)."""
    p = Piece('flower_c')
    for i, (x, y, h, r) in enumerate(((0.0, 0.0, 0.34, 0.075), (-0.15, -0.06, 0.25, 0.065), (0.15, -0.08, 0.27, 0.065),
                                      (0.04, 0.16, 0.22, 0.06))):
        top = Vector((x, y, h))
        stem(p, m['leaf'], (x * 0.4, y * 0.4, 0.0), top - Vector((0, 0, 0.02)))

        def mod(th, k):
            return 1.0 + (0.12 * math.cos(8 * th) if k in (1, 2) else 0.0)
        head = lathe([(0.0, -0.03), (r * 0.8, -0.02), (r, 0.01), (r * 0.7, 0.045), (0.0, 0.06)], 8, mod=mod, phase=i * 0.3)
        p.add(head, m['sun'], xf(top))
    ground_leaves(p, m['leaf'], ((-80, 35, 0.2, 0.09), (40, 40, 0.19, 0.09), (160, 35, 0.2, 0.09)))
    return p


def grass_tuft(m):
    p = Piece('grass_tuft')
    for k, (yaw, pitch, ln, w) in enumerate(((15, 74, 0.36, 0.085), (80, 62, 0.28, 0.08), (140, 70, 0.34, 0.085),
                                             (205, 58, 0.26, 0.08), (262, 66, 0.31, 0.08), (322, 60, 0.28, 0.08))):
        base = Vector((math.cos(RAD(yaw)), math.sin(RAD(yaw)), 0)) * 0.03
        g = leaf(ln, w, 2, 'blade', fold=0.45, bend=-0.3).transformed(leaf_frame(base, RAD(yaw), RAD(pitch)))
        g.retag(lambda c, n, t: 1 if c.z > 0.14 else 0)
        p.add(g, {0: m['leaf'], 1: m['leaf_light']})
    return p


def mushroom(m):
    p = Piece('mushroom')
    for i, (x, y, h, r, lean) in enumerate(((0.0, 0.0, 0.26, 0.15, 0.05), (0.17, -0.1, 0.16, 0.1, -0.12))):
        base = Vector((x, y, 0))
        p.add(lathe([(0.055 * r / 0.15, 0.0), (0.045 * r / 0.15, h * 0.5), (0.04 * r / 0.15, h)], 6), m['cream'], xf(base))
        prof = [(0.03 * r / 0.15, h - 0.01), (r, h - 0.005), (r * 0.94, h + 0.05 * r / 0.15), (r * 0.6, h + 0.1 * r / 0.15),
                (0.0, h + 0.125 * r / 0.15)]
        cap = lathe(prof, 9, tag=lambda band, s: 1 if band == 0 else 0)  # cream gills underneath
        frame = xf(base, (lean, lean * 0.5, i))
        p.add(cap, {0: m['red'], 1: m['cream']}, frame)
        for k, (ang, t) in enumerate(((-100, 0.4), (-10, 0.5), (130, 0.45), (230, 0.6))[:4 - i]):
            a, b = Vector(prof[2]), Vector(prof[3])
            rr, z = a.lerp(b, t).x, a.lerp(b, t).y
            n2 = Vector((b.y - a.y, a.x - b.x)).normalized()
            n2 = n2 if n2.x > 0 else -n2
            nrm = Vector((n2.x * math.cos(RAD(ang)), n2.x * math.sin(RAD(ang)), n2.y))
            pos = Vector((rr * math.cos(RAD(ang)), rr * math.sin(RAD(ang)), z)) + nrm * 0.004
            p.add(disc([(math.cos(a2) * 0.028 * r / 0.15, math.sin(a2) * 0.028 * r / 0.15) for a2 in
                        (TAU * j / 6 for j in range(6))], dome=0.004), m['cream'], frame @ facing(pos, nrm))
    return p


# ==================================================================== trees
def tree_round(m):
    p = Piece('tree_round')
    prof = [(0.3, 0.0), (0.2, 0.14), (0.17, 1.0), (0.13, 1.9)]
    p.add(lathe(prof, 7), m['bark'])
    for side in (-1, 1):
        p.add(tube([(0, 0, 1.1), (side * 0.35, -0.08, 1.5), (side * 0.66, -0.2, 2.05)], [0.11, 0.08, 0.05], sides=5),
              m['bark'])
    blobs = [dict(c=(0.0, 0.1, 2.55), r=(0.95, 0.9, 0.8), segs=16, m=m['leaf'], lats=LATS5),
             dict(c=(-0.72, 0.35, 2.25), r=(0.62, 0.62, 0.52), segs=12, m=m['leaf'], lats=LATS_LO),
             dict(c=(0.75, 0.3, 2.3), r=(0.6, 0.62, 0.5), segs=12, m=m['leaf'], lats=LATS_LO, phase=0.4),
             dict(c=(-0.55, -0.55, 2.2), r=(0.56, 0.55, 0.46), segs=12, m=m['leaf'], lats=LATS_LO, phase=0.8),
             dict(c=(0.6, -0.5, 2.25), r=(0.55, 0.56, 0.46), segs=12, m=m['leaf'], lats=LATS_LO, phase=1.2),
             dict(c=(0.1, -0.1, 3.15), r=(0.55, 0.52, 0.4), segs=12, m=m['leaf'], lats=LATS_LO)]
    canopy(p, blobs, 0.045, seed=31)
    return p


def tree_pine(m):
    p = Piece('tree_pine')
    p.add(lathe([(0.2, 0.0), (0.14, 0.14), (0.1, 1.5)], 6), m['bark'])
    tiers = [(0.95, 2.15, 1.05), (1.65, 2.95, 0.82), (2.35, 3.65, 0.58)]
    for k, (b, t, r) in enumerate(tiers):
        prof = [(0.25 * r, b + 0.02), (r, b + 0.1), (0.86 * r, b + 0.28), (0.5 * r, b + 0.58 * (t - b)), (0.0, t)]

        def mod(th, i, k=k):
            return 1 + 0.07 * math.cos(6 * th + k) if i in (1, 2) else 1.0
        g = lathe(prof, 12, mod=mod, phase=k * 0.4)
        for v in g.verts:
            if abs(v.z - (b + 0.1)) < 1e-5:
                v.z -= 0.06 * (0.5 + 0.5 * math.cos(6 * math.atan2(v.y, v.x) + k))
            v.x += 0.05 * (v.z / 3.6) ** 2
        p.add(g, m['leaf_dark'])
    return p


def palm(m):
    p = Piece('palm')
    path = bez([(0, 0, 0), (0.15, 0.0, 1.2), (0.55, 0.05, 2.4), (0.95, 0.0, 3.05)], 10)
    radii = [0.2 if i == 0 else (0.15 - 0.045 * i / 9) * (1.12 if i % 2 else 0.94) for i in range(10)]
    g = tube(path, radii, sides=6)
    for v in g.verts:
        v.z = max(0.0, v.z)
    p.add(g, m['bark'])
    top = Vector(path[-1]) + Vector((0, 0, 0.05))
    for i in range(7):
        yaw = RAD(-90 + i * 360 / 7 + 10)
        frond = leaf(1.45, 0.52, 6, 'frond', fold=0.42, bend=-0.6)
        p.add(frond, m['leaf_dark'], leaf_frame(top, yaw, RAD(30 + 10 * (i % 2))))
    for k, (dx, dy) in enumerate(((0.12, -0.1), (-0.1, -0.08), (0.02, 0.13))):
        p.add(ico0(0.12, top + Vector((dx, dy, -0.14))), m['bark'])
    return p


# ==================================================================== coral
def coral_a(m):
    """Branching pink coral with rose tips."""
    p = Piece('coral_a')
    rng = random.Random(41)
    branches = [((0, 0, 0), (0.05, 0.0, 0.42), (0.0, 0.02, 0.82)), ((0.03, 0, 0.3), (0.28, -0.05, 0.5), (0.36, -0.1, 0.72)),
                ((0.0, 0, 0.36), (-0.25, 0.05, 0.56), (-0.34, 0.08, 0.76)), ((0.02, 0, 0.18), (0.12, -0.28, 0.4), (0.16, -0.34, 0.56)),
                ((0.0, 0, 0.22), (-0.12, 0.25, 0.42), (-0.1, 0.32, 0.6))]
    for i, pts in enumerate(branches):
        path = bez(pts, 5)
        r0 = 0.09 if i == 0 else 0.065
        g = tube(path, [r0, r0 * 0.9, r0 * 0.85, r0 * 0.8, r0 * 0.5], sides=5, cap_end=False,
                 tag=lambda b: 1 if b >= 3 else 0)
        # A round knob at the tip.
        tip = Vector(path[-1])
        cap = blob(tip, r0 * 0.85, 6, LATS_MIN, seed=i)
        cap.tags = [1] * len(cap.faces)
        p.add(K.merge(g, cap), {0: m['coral'], 1: m['rose']})
    p.add(no_floor(blob((0, 0, 0.0), (0.2, 0.18, 0.1), 8, LATS_MIN)), m['coral'])
    return p


def coral_b(m):
    """Teal tube sponges with mint rims."""
    p = Piece('coral_b')
    for i, (x, y, h, r) in enumerate(((0.0, 0.05, 0.62, 0.13), (0.22, -0.12, 0.44, 0.11), (-0.2, -0.1, 0.36, 0.1),
                                      (-0.05, 0.26, 0.3, 0.09))):
        prof = [(r * 1.1, 0.0), (r, h * 0.35), (r * 1.08, h * 0.8), (r * 1.15, h), (r * 0.75, h * 1.01), (r * 0.7, h * 0.7)]

        def mod(th, k):
            return 1.0 + 0.06 * math.cos(5 * th + k)
        g = lathe(prof, 8, mod=mod, phase=i, tag=lambda band, s: 1 if band >= 2 else 0)
        p.add(g, {0: m['teal'], 1: m['mint']}, xf((x, y, 0), (0.06 * (x * 4), -0.06 * (y * 4), 0)))
    return p


# ===================================================================== lava
def lava_rock_a(m):
    """A cracked volcanic boulder: dark chunks around a glowing core that shows through the cracks."""
    p = Piece('lava_rock_a')
    p.add(no_floor(blob((0, 0, 0.32), (0.5, 0.45, 0.4), 8, LATS_LO, seed=2)), m['lava'])
    chunks = [((-0.24, -0.1, 0.3), (0.42, 0.4, 0.38), 51), ((0.27, -0.14, 0.26), (0.38, 0.36, 0.34), 52),
              ((0.02, 0.26, 0.3), (0.42, 0.34, 0.36), 53), ((0.04, -0.06, 0.55), (0.32, 0.3, 0.24), 54)]
    for c, r, seed in chunks:
        cc = Vector(c)
        out = Vector((c[0], c[1], 0)).normalized() if abs(c[0]) + abs(c[1]) > 0.1 else Vector((0, 0, 1))
        planes = [(-out, 0.17), ((0, 0, 1), r[2] * 0.75), (out + Vector((0, 0, 0.4)), r[0] * 0.8)]
        p.add(faceted(c, r, 8, LATS_LO, seed, planes, 0.07), m['soil_dark'])
    return p


def lava_rock_b(m):
    """Jagged volcanic spires around a little glowing lava pool."""
    p = Piece('lava_rock_b')
    pool = disc([(math.cos(a) * 0.42 * (1 + 0.12 * math.cos(3 * a)), math.sin(a) * 0.34 * (1 + 0.12 * math.cos(3 * a)))
                 for a in (TAU * i / 10 for i in range(10))], dome=0.035)
    p.add(pool, m['lava'], xf((0.05, -0.08, 0.01)))
    for i, (x, y, h, r, tx, ty) in enumerate(((-0.42, 0.18, 0.95, 0.2, 0.05, -0.1), (0.38, 0.28, 0.72, 0.18, -0.08, -0.12),
                                              (0.02, 0.42, 0.58, 0.16, 0.0, -0.18), (-0.36, -0.38, 0.4, 0.15, 0.12, 0.15),
                                              (0.48, -0.32, 0.46, 0.15, -0.12, 0.1))):
        g = K.crystal((x, y, 0), h, r, (RAD(tx * 100), RAD(ty * 100)), sides=5, spin=i, tip=0.45)
        p.add(no_floor(g), m['soil_dark'])
    return p


# ==================================================================== fence
def fence(m):
    p = Piece('fence')
    for i, x in enumerate((-0.98, 0.98)):
        g = lathe([(0.085, 0.0), (0.08, 0.86), (0.05, 0.94), (0.0, 0.98)], 6, phase=RAD(30))
        p.add(no_floor(g), m['wood'], xf((x, 0, 0), (0, 0, RAD(8 * i))))
    for z, tilt in ((0.36, 0.012), (0.72, -0.015)):
        p.add(tube([(-1.02, 0, z - tilt), (0.0, 0.0, z + 0.015), (1.02, 0, z + tilt)], 0.075, sides=5, flatten=0.55,
                   ang0=RAD(36), cap_start=True, cap_end=True), m['wood_light'])
    return p


# ==================================================================== cloud
def cloud_puff(m):
    p = Piece('cloud_puff')
    floor = 0.22
    sh, wh = m['cloud_shade'], m['cloud']
    # Each blob is white from its -20 degree latitude ring up and blue-lilac below: clean ring splits.
    blobs = [dict(c=(0.0, 0.0, 0.82), r=(1.3, 1.05, 0.74), segs=12, m=sh, top=wh, split=2, lats=LATS),
             dict(c=(-1.18, 0.12, 0.64), r=(0.84, 0.8, 0.56), segs=9, m=sh, top=wh, split=2, lats=LATS, phase=0.3),
             dict(c=(1.2, -0.06, 0.62), r=(0.8, 0.76, 0.54), segs=9, m=sh, top=wh, split=2, lats=LATS, phase=0.6),
             dict(c=(0.32, 0.1, 1.3), r=(0.66, 0.6, 0.5), segs=9, m=sh, top=wh, split=2, lats=LATS, phase=1.2)]
    canopy(p, blobs, 0.07, floor=floor, seed=61, keep_floor=True)
    p.deform(lambda v: (v.x, v.y, v.z - floor))
    return p


# ================================================================ Frostfall
# Added 2026-10-16: the snowy fourth land. White snow, pale ice blue and dark pine green; never violet.
def tree_snow(m):
    """A snow-laden pine: dark green tiers with white snow on every tier top, low enough to hide the trunk."""
    p = Piece('tree_snow')
    p.add(lathe([(0.16, 0.0), (0.12, 0.12), (0.09, 0.6)], 6), m['leaf_dark'])
    tiers = [(0.28, 1.25, 1.0), (0.9, 1.95, 0.82), (1.55, 2.6, 0.62), (2.15, 3.25, 0.42)]
    for k, (b, t, r) in enumerate(tiers):
        # Green skirt, then a snow cap from ~80% of the radius up, with a wavy lower edge.
        zs = b + 0.3 * (t - b)
        prof = [(0.25 * r, b + 0.02), (r, b + 0.1), (0.93 * r, b + 0.2), (0.8 * r, zs), (0.0, t)]

        def mod(th, i, k=k):
            return 1 + 0.08 * math.cos(6 * th + k) if i in (1, 2, 3) else 1.0
        g = lathe(prof, 12, mod=mod, phase=k * 0.45, tag=lambda band, s: 1 if band >= 3 else 0)
        for v in g.verts:
            th = math.atan2(v.y, v.x)
            if abs(v.z - (b + 0.1)) < 1e-5:
                v.z -= 0.07 * (0.5 + 0.5 * math.cos(6 * th + k))
            elif abs(v.z - zs) < 1e-5:
                v.z += 0.05 * math.cos(5 * th + 2 * k)
        p.add(g, {0: m['leaf_dark'], 1: m['snow']})
    p.add(no_floor(blob((0, 0, 0.0), (0.95, 0.9, 0.22), 12, LATS_LO, 0.08, 9)), m['snow'])
    return p


def rock_snow(m):
    p = Piece('rock_snow')
    planes = [((0.3, -0.6, 0.75), 0.42), ((-0.8, -0.3, 0.5), 0.5), ((0.75, 0.4, 0.5), 0.5), ((0, 0, 1), 0.5),
              ((-0.3, 0.85, 0.45), 0.5)]
    g = faceted((0, 0, 0.3), (0.64, 0.56, 0.55), 11, LATS5, 41, planes)
    g.retag(lambda c, n, t: 1 if n.z > 0.55 else 0)
    p.add(g, {0: m['stone'], 1: m['snow']})
    g2 = faceted((0.55, -0.32, 0.06), (0.28, 0.25, 0.22), 8, LATS_LO, 42, [((0, 0, 1), 0.14), ((0.7, -0.5, 0.4), 0.18)])
    g2.retag(lambda c, n, t: 1 if n.z > 0.6 else 0)
    p.add(g2, {0: m['stone'], 1: m['snow']})
    return p


def ice_rock(m):
    """A chunky block of pale cyan ice with snow on top: broad flat facets, no spikes (never mistaken for Gloom)."""
    p = Piece('ice_rock')
    planes = [((0.2, -0.9, 0.3), 0.36), ((-0.9, -0.2, 0.3), 0.4), ((0.9, 0.3, 0.2), 0.42), ((-0.2, 0.9, 0.3), 0.4),
              ((0, 0, 1), 0.46), ((0.5, -0.5, 0.7), 0.5), ((-0.6, 0.4, 0.7), 0.5)]
    g = faceted((0, 0, 0.32), (0.62, 0.55, 0.6), 10, LATS5, 51, planes, 0.03)
    g.retag(lambda c, n, t: 1 if n.z > 0.8 else 0)
    p.add(g, {0: m['glass'], 1: m['snow']})
    for k, (c, r) in enumerate((((0.62, -0.25, 0.1), 0.22), ((-0.55, -0.4, 0.08), 0.17))):
        g2 = faceted(c, (r, r * 0.9, r * 0.85), 6, LATS_LO, 52 + k, [((0, 0, 1), r * 0.6), ((0.6, -0.6, 0.5), r * 0.7)], 0.02)
        g2.retag(lambda cc, n, t: 1 if n.z > 0.8 else 0)
        p.add(g2, {0: m['glass'], 1: m['snow']})
    return p


def snowdrift(m):
    p = Piece('snowdrift')
    blobs = [dict(c=(0.0, 0.0, 0.0), r=(0.95, 0.6, 0.42), segs=12, m=m['sky_light'], top=m['snow'], split=2, lats=LATS_LO),
             dict(c=(0.75, 0.15, 0.0), r=(0.55, 0.45, 0.3), segs=10, m=m['sky_light'], top=m['snow'], split=2, lats=LATS_LO),
             dict(c=(-0.7, -0.1, 0.0), r=(0.5, 0.42, 0.26), segs=10, m=m['sky_light'], top=m['snow'], split=1, lats=LATS_LO)]
    canopy(p, blobs, 0.07, floor=0.0, seed=71)
    return p


def snow_flower(m):
    """Little blue and white flowers poking up through a snow mound."""
    p = Piece('snow_flower')
    p.add(no_floor(blob((0, 0, 0.0), (0.3, 0.27, 0.12), 10, LATS_LO, 0.08, 5)), m['snow'])
    for i, (x, y, h, r, blue) in enumerate(((0.0, 0.02, 0.24, 0.075, True), (-0.14, -0.08, 0.19, 0.065, False),
                                            (0.15, -0.06, 0.2, 0.07, True), (0.06, 0.15, 0.17, 0.06, False),
                                            (-0.1, 0.12, 0.22, 0.065, True))):
        top = Vector((x, y, h))
        petal, centre = (m['sky'], m['snow']) if blue else (m['snow'], m['sky'])
        p.add(tube([(x * 0.6, y * 0.6, 0.08), top - Vector((0, 0, 0.01))], [0.012, 0.009], sides=3), m['sky'])
        frame = facing(top, (x * 1.5, y * 1.5 - 0.3, 1.0), spin=i * 0.8)
        p.add(disc(lobed(5, 2, 0.55 * r, r, 0.6), dome=-0.012), petal, frame)
        p.add(lathe([(0.32 * r, 0.0), (0.0, 0.22 * r)], 6), centre, frame @ xf((0, 0, -0.002)))
    return p


FROST_IDS = ['tree_snow', 'rock_snow', 'ice_rock', 'snowdrift', 'snow_flower']
FROST_BUDGET = {'tree_snow': 700, 'rock_snow': 400, 'ice_rock': 400, 'snowdrift': 300, 'snow_flower': 350}


# ===================================================================== main
def check(stats):
    errors = []
    for n, s in stats.items():
        lim = FROST_BUDGET[n] if n in FROST_IDS else BUDGET.get(n, 400)
        if s['tris'] > lim:
            errors.append(f'{n}: {s["tris"]} tris > {lim}')
        if not 1 <= len(s['materials']) <= 2:
            errors.append(f'{n}: {len(s["materials"])} materials')
        if s['children']:
            errors.append(f'{n}: has children')
        if abs(s['min_y']) > 0.01:
            errors.append(f'{n}: base {s["min_y"]}')
    c = stats['cloud_puff']['size']
    if not 3.6 <= max(c[0], c[2]) <= 4.4:
        errors.append(f'cloud_puff size {c}')
    return errors


def main():
    style.reset_scene()
    m = mats()
    roots = {}
    for n in IDS + FROST_IDS:
        piece = globals()[n](m)
        if n.startswith('flower_'):
            piece.deform(lambda v: v * 1.25)
        piece.deform(lambda v: (v.x, v.y, max(0.0, v.z)))  # nothing below the ground
        roots[n] = piece.build(sharp=40 if 'rock' in n else 60, name=n)
    bpy.context.view_layer.update()
    stats = {n: K.root_stats(o) for n, o in roots.items()}
    K.report(stats)
    errors = check(stats)
    path, size = K.export(list(roots.values()), FILE)
    print(f'{FILE}: {size} bytes, {sum(s["tris"] for s in stats.values())} tris')
    K.write_manifest(FILE, size, stats, dict(generator='art/blender/kit/build_nature.py',
                                            notes='one mesh per root, 1-2 materials; cloud_puff origin at its flat '
                                                  'underside centre'))
    if '--render' in K.args():
        order = ['tree_round', 'tree_pine', 'palm', 'cloud_puff', 'coral_a', 'coral_b', 'fence',
                 'rock_a', 'rock_b', 'rock_c', 'lava_rock_a', 'lava_rock_b', 'bush_a', 'bush_b',
                 'flower_a', 'flower_b', 'flower_c', 'grass_tuft', 'mushroom'] + FROST_IDS
        cells = [(roots[n], f'{n}  {stats[n]["tris"]}') for n in order]
        placed = K.contact_sheet(cells, os.path.join(K.PREVIEWS, 'nature.png'), cols=7, pitch=(3.8, 3.4),
                                 width_px=2400, label_size=0.24, label_dy=1.45)
        # Close-up of the small scatter at a readable zoom, then the cloud from a low side angle.
        for o in placed:
            o.hide_render = True
        row = ['flower_a', 'flower_b', 'flower_c', 'grass_tuft', 'mushroom', 'coral_a', 'coral_b', 'bush_a', 'bush_b',
               'rock_b']
        x = 0.0
        shown = []
        for n in row:
            o = roots[n]
            w = max(stats[n]['size'][0], 0.4)
            x += w / 2 + 0.25
            o.location = (x, 0, 0)
            o.hide_render = False
            shown.append(o)
            x += w / 2
        K.frame(shown, 2400, margin=0.25)
        style.render(os.path.join(K.PREVIEWS, 'nature-closeup.png'))
        for o in shown:
            o.hide_render = True
        # Frostfall close-up on snow-white ground (the ground colour is changed for this render only).
        gmat = bpy.data.objects['Preview ground'].data.materials[0]
        gbsdf = next(nd for nd in gmat.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
        old_ground = tuple(gbsdf.inputs['Base Color'].default_value)
        gbsdf.inputs['Base Color'].default_value = style.rgba('#E6F0FA')
        x = 0.0
        frost = []
        for n in ['tree_snow', 'rock_snow', 'ice_rock', 'snowdrift', 'snow_flower']:
            o = roots[n]
            w = max(stats[n]['size'][0], 0.5)
            x += w / 2 + 0.35
            o.location = (x, 0, 0)
            o.hide_render = False
            frost.append(o)
            x += w / 2
        K.frame(frost, 2000, margin=0.3)
        style.render(os.path.join(K.PREVIEWS, 'nature-frostfall.png'))
        gbsdf.inputs['Base Color'].default_value = old_ground
        for o in frost:
            o.hide_render = True
        cl = roots['cloud_puff']
        cl.hide_render = False
        cl.location = (0, 0, 1.0)
        cam = bpy.context.scene.camera
        cam.rotation_euler = (RAD(80), 0, 0)
        cam.location = (0, -14.0, 1.0 + 14.0 * math.tan(RAD(10)) + 0.8)
        cam.data.ortho_scale = 5.0
        bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = (1000, 500)
        style.render(os.path.join(K.PREVIEWS, 'nature-cloud-side.png'))
    if errors:
        raise SystemExit('nature contract failures:\n  ' + '\n  '.join(errors))
    print('nature OK')


main()
