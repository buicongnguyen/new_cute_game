"""Cloudback props: Bao's deck, camps and isle set pieces.

Roots (docs/ART-CONTRACT.md): hut, workbench, kitchen, maptable, ropepost, fishspot, pantry, chimepost,
postspot, market, tent, lantern, windmill (child `blades`, pivot at the hub, spins about its local +Z),
coral_arch, ore_rock, forge, rod (marker `tip`), speck, skydew. Budget 2,000 triangles each.
Ship-deck set (added later): hatch (child `door` hinged at the back edge; open with door.rotation.x toward
-1.9) and planter (marker `soil`). The cabin interior reuses the owner's Zoo Garden house kit.
Origins at the ground centre, front (doors, counters) toward glTF +Z. skydew floats: its origin is the
centre of its underside. The rod's origin is the butt of the handle; it points up (+Y) and leans forward.

Run from the repository root:
    blender -b --factory-startup --python art/blender/kit/build_props.py -- [--render]
"""
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_world as K  # noqa: E402
from kit_world import (LATS, LATS5, LATS_LO, LATS_MIN, RAD, TAU, Geo, Piece, Vector, attach, bez, blob, canopy,  # noqa: E402
                       disc, facing, ico0, lathe, leaf, leaf_frame, lobed, marker, rbox, rcyl, slab, star_outline,
                       surface_point, tube, xf)
import style  # noqa: E402

FILE = 'props.glb'
IDS = ['hut', 'workbench', 'kitchen', 'maptable', 'ropepost', 'fishspot', 'pantry', 'chimepost', 'postspot', 'market',
       'tent', 'lantern', 'windmill', 'coral_arch', 'ore_rock', 'forge', 'rod', 'speck', 'skydew']
BUDGET = 2000


def mats():
    names = ['wood', 'wood_light', 'wood_dark', 'straw', 'straw_dark', 'straw_light', 'stone', 'stone_light', 'stone_dark',
             'iron', 'charcoal', 'cream', 'white', 'red', 'teal', 'gold', 'sun', 'leaf', 'leaf_dark', 'moss', 'moss_light',
             'awning', 'coral', 'rose', 'mint', 'tangerine', 'berry', 'pear', 'cloud', 'cloud_shade', 'soil', 'sky', 'navy',
             'pumpkin', 'honey']
    rough = {'iron': 0.4, 'gold': 0.3, 'charcoal': 0.8, 'cloud': 0.9, 'cloud_shade': 0.9, 'stone': 0.75}
    m = {n: K.M(n, rough.get(n, 0.6)) for n in names}
    m['lantern'] = K.G('lantern', 'lantern', 2.0)
    m['lava'] = K.G('lava', 'lava', 2.2)
    m['glow_gold'] = K.G('gold', 'gold', 2.0)
    m['glow_sky'] = K.G('sky_light', 'sky_light', 1.6)
    m['gloom'] = K.gloom_crystal()
    m['glow_gloom'] = K.G('gloom', '#B26BFF', 2.4)
    m['glow_moss'] = K.G('moss', 'moss_light', 1.2)
    return m


# ================================================================== helpers
def box(p, mtl, size, c, r=0.035, rot=(0, 0, 0)):
    """A chunky rounded box (108 triangles): for big, close, important shapes."""
    p.add(rbox(size, r, 1), mtl, xf(c, rot))


def plank(p, mtl, size, c, r=0.025, rot=(0, 0, 0)):
    """A chamfered box (44 triangles): planks, crates, spars."""
    p.add(K.cbox(size, r), mtl, xf(c, rot))


def cube(size, c=(0, 0, 0)):
    """A plain 12-triangle box for small hidden-ish parts."""
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    v = [(sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return Geo(v, f).outward().transformed(xf(c))


def post(p, mtl, x, y, h, r=0.06, segs=6, z0=0.0, rt=None):
    p.add(rcyl(r, h, r * 0.35, segs, z0=z0, r_top=rt, arc=1), mtl, xf((x, y, 0), (0, 0, RAD(180 / segs))))


def torus(R, r, segs=16, sides=6, phase=0.0):
    """A torus in the XY plane around the origin."""
    verts = []
    for i in range(segs):
        a = phase + TAU * i / segs
        for j in range(sides):
            b = TAU * j / sides
            rr = R + r * math.cos(b)
            verts.append((rr * math.cos(a), rr * math.sin(a), r * math.sin(b)))
    faces = []
    for i in range(segs):
        for j in range(sides):
            i2, j2 = (i + 1) % segs, (j + 1) % sides
            faces.append((i * sides + j, i2 * sides + j, i2 * sides + j2, i * sides + j2))
    return Geo(verts, faces).outward()


def coil(R, r, turns, z0, rise, segs_per_turn=12, sides=5):
    n = int(turns * segs_per_turn) + 1
    pts = [(R * math.cos(TAU * turns * i / (n - 1)), R * math.sin(TAU * turns * i / (n - 1)), z0 + rise * i / (n - 1))
           for i in range(n)]
    return tube(pts, r, sides=sides, cap_start=True, cap_end=True)


def bell_geo(h=0.24, r=0.14, segs=8):
    prof = [(r * 0.8, -h * 0.97), (r * 1.04, -h), (r * 0.96, -h * 0.9), (r * 0.66, -h * 0.66),
            (r * 0.6, -h * 0.36), (r * 0.5, -h * 0.13), (r * 0.26, -h * 0.02), (0.0, 0.0)]
    inner = lathe([(0.0, -h * 0.5), (r * 0.8, -h * 0.97)], segs)
    return K.merge(lathe(prof, segs), inner.flipped())


def arch_outline(w, h, n=6):
    """A round-topped door outline in XY (y up), base at y = 0."""
    r = w / 2
    pts = [(r, 0.0), (r, h - r)]
    pts += [(r * math.cos(math.pi * k / n), h - r + r * math.sin(math.pi * k / n)) for k in range(1, n)]
    pts += [(-r, h - r), (-r, 0.0)]
    return pts


def standing(outline, thick, c, yaw=0.0, lip=0.0):
    """Extrude an XY outline (y up) into a slab facing -Y (the front), centred at c."""
    layers = [(1.0, -thick / 2), (1.0, thick / 2)] if not lip else [(1.0, -thick / 2), (1.0, thick / 2 - lip),
                                                                     (1 - lip, thick / 2)]
    g = slab(outline, layers)
    return g.transformed(xf(c, (RAD(90), 0, yaw)))


def paper_lantern(p, mtl, cap, top, r=0.17, h=0.36, segs=10, tassel=True):
    """A ribbed round paper lantern hanging from `top` (its top cap)."""
    t = Vector(top)

    def mod(th, i):
        return 1.0 + (0.06 * math.cos(segs * th) if 0 < i < 5 else 0.0)
    body = lathe([(r * 0.45, -h), (r * 0.8, -h * 0.92), (r, -h * 0.66), (r, -h * 0.34), (r * 0.8, -h * 0.08),
                  (r * 0.45, 0.0)], segs, mod=mod)
    p.add(body, mtl, xf(t))
    p.add(rcyl(r * 0.5, 0.05, 0.015, 8, z0=-0.02, arc=1), cap, xf(t))
    p.add(rcyl(r * 0.5, 0.05, 0.015, 8, z0=-h - 0.03, arc=1), cap, xf(t))
    if tassel:
        p.add(lathe([(0.0, -h - 0.2), (0.035, -h - 0.17), (0.02, -h - 0.04)], 5), cap, xf(t))


def fruit_pile(p, mtl, c, n, r, spread, seed, kind='ball'):
    rng = random.Random(seed)
    for i in range(n):
        a = TAU * i / n + rng.uniform(-0.3, 0.3)
        d = spread * (0.35 + 0.65 * rng.random()) if i else 0.0
        z = c[2] + r * 0.8 + (0.0 if i else r * 0.5)
        p.add(ico0(r, (c[0] + d * math.cos(a), c[1] + d * math.sin(a) * 0.7, z)), mtl)


def no_floor(g, eps=1e-4):
    return g.keep(lambda f, gg: not all(gg.verts[i].z <= eps for i in f))


def faceted(c, r, segs, lats, seed, planes, wobble=0.06):
    g = blob(c, r, segs, lats, wobble, seed)
    cc = Vector(c)
    for v in g.verts:
        for d, lim in planes:
            d = Vector(d).normalized()
            over = (v - cc).dot(d) - lim
            if over > 0:
                v -= d * over * 0.85
        v.z = max(v.z, 0.0)
    return no_floor(g)


# ==================================================================== deck
def hut(m):
    p = Piece('hut')
    # Foundation stones and a plank wall (planks alternate two woods, no extra triangles).
    p.add(lathe([(1.42, 0.0), (1.44, 0.1), (1.38, 0.2), (1.28, 0.24)], 16,
                mod=lambda th, i: 1 + 0.025 * math.cos(7 * th)), m['stone'])
    wall = lathe([(1.3, 0.2), (1.32, 0.7), (1.28, 1.35), (1.2, 1.72)], 16, phase=RAD(11.25), tag=lambda b, s: s % 2)
    p.add(wall, {0: m['wood'], 1: m['wood_light']})
    # Thatch: three scalloped tiers, light and dark straw.
    tiers = [((0.95, 1.62), (1.62, 1.4), (1.64, 1.5), (1.15, 1.98)), ((0.7, 1.92), (1.26, 1.78), (1.28, 1.87), (0.8, 2.38)),
             ((0.45, 2.32), (0.9, 2.24), (0.91, 2.32), (0.0, 2.98))]
    for k, prof in enumerate(tiers):
        def mod(th, i, k=k):
            return 1 + (0.04 * math.cos(10 * th + k) if i in (1, 2) else 0.0)
        g = lathe(list(prof), 16, mod=mod, phase=k * 0.2)
        for v in g.verts:
            if abs(v.z - prof[1][1]) < 1e-6 or abs(v.z - prof[2][1]) < 1e-6:
                v.z -= 0.05 * (0.5 + 0.5 * math.cos(10 * math.atan2(v.y, v.x) + k))
        p.add(g, m['straw_dark'] if k == 1 else m['straw'])
    p.add(rcyl(0.07, 0.2, 0.03, 6, z0=2.9, arc=1), m['wood_dark'])
    p.add(ico0(0.09, (0, 0, 3.14)), m['gold'])
    # Chimney poking through the roof at the back.
    post(p, m['stone'], 0.5, 0.55, 1.0, 0.13, 6, z0=1.8)
    # Round-topped teal door with a wooden frame, a step and a round warm-lit window.
    p.add(standing(arch_outline(1.0, 1.36), 0.1, (0, -1.29, 0.2), lip=0.03), m['wood_dark'])
    p.add(standing(arch_outline(0.82, 1.26), 0.1, (0, -1.33, 0.2), lip=0.03), m['teal'])
    p.add(ico0(0.045, (0.26, -1.4, 0.86)), m['gold'])
    box(p, m['stone'], (1.0, 0.45, 0.14), (0, -1.55, 0.07), 0.05)
    win = Vector((math.cos(RAD(-38)), math.sin(RAD(-38)), 0)) * 1.25 + Vector((0, 0, 0.95))
    yaw = RAD(-38 + 90)
    p.add(torus(0.22, 0.05, 12, 5).transformed(xf(win, (RAD(90), 0, yaw))), m['wood_dark'])
    p.add(disc([(math.cos(a) * 0.2, math.sin(a) * 0.2) for a in (TAU * i / 12 for i in range(12))], dome=0.02),
          m['lantern'], xf(win, (RAD(90), 0, yaw)) @ xf((0, 0, -0.01), (RAD(180), 0, 0)))
    p.add(cube((0.4, 0.03, 0.035), (0, 0, 0)).transformed(xf(win + Vector((0, -0.04, 0)).normalized() * 0.0, (0, 0, yaw))),
          m['wood_dark'])
    # Nana's lantern on a bracket beside the door.
    side = Vector((-0.86, -1.04, 0))
    p.add(tube([side + Vector((0, 0, 1.45)), side + Vector((-0.12, -0.28, 1.56)), side + Vector((-0.22, -0.42, 1.5))],
               0.025, sides=4), m['wood_dark'])
    paper_lantern(p, m['lantern'], m['red'], side + Vector((-0.22, -0.42, 1.45)), 0.16, 0.32)
    # A flower pot and a little sprout by the door.
    p.add(lathe([(0.12, 0.0), (0.16, 0.22), (0.17, 0.26), (0.13, 0.25)], 8), m['pumpkin'], xf((0.72, -1.38, 0)))
    for yaw2 in (20, 140, 260):
        p.add(leaf(0.2, 0.15, 3, 'round', 0.3, -0.1), m['leaf'], leaf_frame((0.72, -1.38, 0.24), RAD(yaw2), RAD(35)))
    return p


def workbench(m):
    p = Piece('workbench')
    box(p, m['wood_light'], (1.7, 0.78, 0.13), (0, 0, 0.86), 0.04)
    for x in (-0.72, 0.72):
        for y in (-0.28, 0.28):
            post(p, m['wood'], x, y, 0.8, 0.06, 4)
    plank(p, m['wood'], (1.5, 0.6, 0.06), (0, 0, 0.3), 0.025)
    # Vise on the front-left corner.
    p.add(cube((0.24, 0.22, 0.16), (-0.6, -0.36, 0.99)), m['iron'])
    p.add(cube((0.24, 0.06, 0.2), (-0.6, -0.5, 1.0)), m['iron'])
    p.add(tube([(-0.78, -0.56, 0.98), (-0.42, -0.56, 0.98)], 0.02, sides=4), m['iron'])
    # Hammer, a saw, a rope coil and a plank offcut.
    p.add(tube([(0.0, -0.18, 0.95), (0.42, -0.04, 0.95)], 0.03, sides=5), m['wood_dark'])
    plank(p, m['iron'], (0.1, 0.22, 0.1), (0.44, -0.04, 0.96), 0.025, (0, 0, RAD(18)))
    saw = slab([(-0.3, -0.07), (0.25, -0.07), (0.3, 0.07), (-0.3, 0.07)], [(1, -0.008), (1, 0.008)])
    p.add(saw, m['stone_light'], xf((0.15, 0.2, 0.935), (0, 0, RAD(-8))))
    plank(p, m['wood_dark'], (0.14, 0.05, 0.12), (-0.18, 0.21, 0.95), 0.02, (0, 0, RAD(-8)))
    p.add(coil(0.16, 0.035, 2.0, 0.96, 0.06, 10, 5), m['straw'], xf((-0.42, 0.12, 0.0)))
    plank(p, m['wood'], (0.6, 0.18, 0.06), (0.3, 0.05, 0.36), 0.02, (0, 0, RAD(6)))
    p.add(rcyl(0.12, 0.22, 0.03, 8, arc=1), m['straw_dark'], xf((0.86, -0.42, 0)))
    for k in range(3):
        p.add(tube([(0.86 + 0.04 * (k - 1), -0.42, 0.2), (0.86 + 0.08 * (k - 1), -0.45 - 0.02 * k, 0.52)], 0.02, sides=4),
              m['wood_light'])
    return p


def kitchen(m):
    p = Piece('kitchen')
    # Chunky stone stove with an arched, glowing fire mouth on the front.
    box(p, m['stone_light'], (1.1, 0.8, 0.72), (0, 0, 0.36), 0.12)
    plank(p, m['stone_dark'], (1.2, 0.9, 0.1), (0, 0, 0.76), 0.04)
    p.add(standing(arch_outline(0.42, 0.36), 0.04, (0, -0.4, 0.1)), m['lava'])
    p.add(standing(arch_outline(0.56, 0.44), 0.05, (0, -0.39, 0.06), lip=0.02), m['stone_dark'])
    for x in (-0.12, 0.0, 0.13):
        p.add(cube((0.08, 0.3, 0.06), (x, -0.32, 0.12)), m['charcoal'])
    # Pot with stew, a ladle and the stove pipe.
    pot = lathe([(0.0, 0.0), (0.24, 0.02), (0.3, 0.12), (0.3, 0.28), (0.33, 0.32), (0.3, 0.33), (0.27, 0.3)], 12)
    p.add(pot, m['charcoal'], xf((-0.15, -0.05, 0.81)))
    p.add(disc([(math.cos(a) * 0.27, math.sin(a) * 0.27) for a in (TAU * i / 12 for i in range(12))], dome=0.02),
          m['pumpkin'], xf((-0.15, -0.05, 1.08)))
    for k, (x, y) in enumerate(((-0.25, -0.1), (-0.08, 0.05), (-0.12, -0.16))):
        p.add(ico0(0.05, (x, y, 1.11)), (m['leaf'], m['honey'], m['leaf'])[k])
    p.add(tube([(-0.02, -0.05, 1.08), (0.12, -0.12, 1.35)], 0.018, sides=4), m['wood_dark'])
    for side in (-1, 1):
        p.add(torus(0.05, 0.015, 6, 4).transformed(xf((-0.15 + side * 0.32, -0.05, 1.05), (RAD(90), 0, RAD(90)))), m['iron'])
    post(p, m['iron'], 0.38, 0.2, 1.05, 0.08, 8, z0=0.8)
    p.add(rcyl(0.13, 0.08, 0.02, 8, z0=1.83, arc=1), m['iron'], xf((0.38, 0.2, 0)))
    # A little side shelf with two of Mina's buns and a jar.
    plank(p, m['wood'], (0.5, 0.5, 0.07), (0.85, 0.0, 0.62), 0.025)
    post(p, m['wood_dark'], 0.85, 0.0, 0.6, 0.06, 4)
    for x, y in ((0.78, -0.08), (0.94, 0.1)):
        p.add(lathe([(0.0, 0.0), (0.1, 0.01), (0.12, 0.05), (0.08, 0.1), (0.0, 0.12)], 8), m['honey'], xf((x, y, 0.655)))
    p.add(rcyl(0.07, 0.18, 0.02, 8, arc=1), m['teal'], xf((0.95, -0.14, 0.655)))
    return p


def maptable(m):
    p = Piece('maptable')
    p.add(rcyl(0.78, 0.1, 0.04, 16, z0=0.8, arc=1), m['wood_light'])
    p.add(lathe([(0.36, 0.0), (0.34, 0.06), (0.12, 0.16), (0.1, 0.62), (0.18, 0.8)], 8), m['wood'])
    # The open map: a cream sheet with the three isles painted on, and a compass.
    sheet = slab([(-0.42, -0.3), (0.42, -0.3), (0.44, 0.3), (-0.4, 0.31)], [(1, 0.0), (1, 0.015)])
    p.add(sheet, m['cream'], xf((0.02, -0.08, 0.9), (0, 0, RAD(-6))))
    for (x, y, r, col) in ((-0.22, -0.16, 0.08, 'leaf'), (0.05, 0.05, 0.075, 'teal'), (0.24, -0.15, 0.07, 'red')):
        p.add(disc(lobed(5, 2, r * 0.75, r, 0.5), dome=0.012), m[col], xf((x, y, 0.918)))
    p.add(tube([(-0.22, -0.16, 0.92), (0.05, 0.05, 0.92), (0.24, -0.15, 0.92)], 0.008, sides=3), m['red'])
    p.add(rcyl(0.07, 0.025, 0.01, 10, z0=0.915, arc=1), m['gold'], xf((0.32, 0.12, 0)))
    # Rolled maps tied with a red ribbon.
    p.add(rcyl(0.06, 0.62, 0.02, 8, arc=1), m['cream'], xf((-0.3, 0.42, 0.97), (0, RAD(90), RAD(12))))
    p.add(torus(0.065, 0.014, 8, 4), m['red'], xf((-0.3, 0.42, 0.97), (0, RAD(90), RAD(12))))
    p.add(rcyl(0.05, 0.5, 0.02, 8, arc=1), m['straw_light'], xf((0.12, 0.5, 0.95), (0, RAD(90), RAD(-20))))
    return p


def ropepost(m):
    p = Piece('ropepost')
    p.add(lathe([(0.3, 0.0), (0.3, 0.12), (0.24, 0.18)], 8), m['stone'])
    post(p, m['wood'], 0, 0, 1.75, 0.13, 8)
    plank(p, m['wood_dark'], (0.16, 0.7, 0.14), (0, -0.25, 1.62), 0.04)
    # Pulley at the end of the arm, the rope over it and down into a coil on the deck.
    hub = Vector((0, -0.55, 1.5))
    p.add(torus(0.16, 0.045, 12, 5), m['iron'], xf(hub, (0, RAD(90), 0)))
    p.add(rcyl(0.12, 0.06, 0.02, 10, z0=-0.03, arc=1), m['wood_light'], xf(hub, (0, RAD(90), 0)))
    p.add(tube([(0, -0.38, 1.6), (0, -0.2, 1.55), (0, 0.05, 0.7), (0, 0.1, 0.35)], 0.035, sides=5), m['straw'])
    p.add(tube([(0, -0.71, 1.5), (0, -0.74, 1.0), (0, -0.72, 0.35)], 0.035, sides=5), m['straw'])
    for k, (R, z) in enumerate(((0.32, 0.0), (0.27, 0.07), (0.22, 0.14))):
        p.add(coil(R, 0.045, 1.0, z + 0.045, 0.06, 14, 5), m['straw'], xf((0.0, 0.45, 0), (0, 0, k)))
    p.add(rcyl(0.06, 0.2, 0.02, 6, arc=1), m['iron'], xf((0, -0.72, 0.15)))
    return p


def fishspot(m):
    p = Piece('fishspot')
    for i, x in enumerate((-0.66, -0.22, 0.22, 0.66)):
        plank(p, m['wood_light'] if i % 2 else m['wood'], (0.42, 1.3, 0.1), (x, 0, 0.12), 0.03)
    for x in (-0.6, 0.6):
        plank(p, m['wood_dark'], (0.16, 1.2, 0.08), (x, 0, 0.04), 0.02)
    # Railing along the front edge (the side that faces the cloud sea).
    for x in (-0.82, 0.0, 0.82):
        post(p, m['wood'], x, -0.58, 0.95, 0.055, 4, z0=0.12)
    p.add(tube([(-0.9, -0.58, 0.98), (0.9, -0.58, 0.98)], 0.045, sides=6, cap_start=True, cap_end=True), m['wood_dark'])
    p.add(tube([(-0.86, -0.58, 0.6), (0.86, -0.58, 0.6)], 0.03, sides=5, cap_start=True, cap_end=True), m['wood'])
    # Rod holder: an iron sleeve on the middle post, tilted out over the edge.
    p.add(rcyl(0.05, 0.3, 0.015, 6, arc=1, cap_bottom=True), m['iron'], xf((0.1, -0.64, 0.62), (RAD(-35), 0, 0)))
    # A bait bucket and a little stool.
    p.add(lathe([(0.0, 0.17), (0.14, 0.17), (0.16, 0.42), (0.13, 0.42), (0.12, 0.2)], 8), m['teal'], xf((-0.55, 0.3, 0)))
    p.add(torus(0.13, 0.012, 8, 3), m['iron'], xf((-0.55, 0.3, 0.5), (RAD(90), 0, 0)))
    p.add(rcyl(0.2, 0.08, 0.03, 10, z0=0.48, arc=1), m['red'], xf((0.4, 0.25, 0)))
    for a in (0, 120, 240):
        d = Vector((math.cos(RAD(a)), math.sin(RAD(a)), 0)) * 0.13
        p.add(tube([(0.4 + d.x * 1.3, 0.25 + d.y * 1.3, 0.17), (0.4 + d.x, 0.25 + d.y, 0.5)], 0.025, sides=4), m['wood'])
    return p


def pantry(m):
    p = Piece('pantry')
    box(p, m['straw'], (1.2, 0.8, 0.66), (0, 0, 0.33), 0.12)
    for z in (0.16, 0.46):
        plank(p, m['straw_dark'], (1.24, 0.84, 0.07), (0, 0, z), 0.03)
    for x in (-0.4, 0.0, 0.4):
        plank(p, m['straw_dark'], (0.07, 0.84, 0.6), (x, 0, 0.31), 0.03)
    # The lid sits a little open; a puffberry and a pear peek out.
    box(p, m['straw_dark'], (1.26, 0.86, 0.12), (0, 0.06, 0.74), 0.06, (RAD(-12), 0, 0))
    plank(p, m['wood_dark'], (0.16, 0.06, 0.12), (0, -0.44, 0.58), 0.02)
    p.add(ico0(0.09, (-0.22, -0.2, 0.7)), m['berry'])
    p.add(ico0(0.09, (-0.06, -0.22, 0.68)), m['berry'])
    p.add(lathe([(0.0, 0.0), (0.09, 0.03), (0.07, 0.12), (0.04, 0.18), (0.0, 0.2)], 7), m['pear'], xf((0.22, -0.18, 0.64)))
    for x in (-0.64, 0.64):
        p.add(torus(0.09, 0.022, 8, 4), m['wood_dark'], xf((x, 0, 0.45), (0, RAD(90), 0)))
    return p


def chimepost(m):
    p = Piece('chimepost')
    p.add(lathe([(0.36, 0.0), (0.36, 0.1), (0.3, 0.18), (0.16, 0.22)], 8), m['stone'])
    post(p, m['wood'], 0, 0, 1.9, 0.08, 8)
    # A curved yoke with three bells at different heights, under a little red roof.
    yoke = [(-0.52, 0, 1.68), (-0.25, 0, 1.78), (0.0, 0, 1.8), (0.25, 0, 1.78), (0.52, 0, 1.68)]
    p.add(tube(yoke, 0.045, sides=5, cap_start=True, cap_end=True), m['wood_dark'])
    p.add(lathe([(0.0, 1.88), (0.42, 1.92), (0.45, 1.97), (0.14, 2.12), (0.0, 2.2)], 8, phase=RAD(22.5)), m['red'])
    p.add(ico0(0.06, (0, 0, 2.22)), m['gold'])
    bell = bell_geo(0.26, 0.15)
    clap = ico0(0.045, (0, 0, -0.27))
    for x, drop in ((-0.46, 0.18), (0.0, 0.3), (0.46, 0.14)):
        top = Vector((x, 0, 1.76 if x else 1.8)) - Vector((0, 0, drop))
        p.add(tube([top + Vector((0, 0, drop)), top], 0.012, sides=3), m['wood_dark'])
        p.add(K.merge(bell, clap), m['gold'], xf(top))
    # A teal ribbon tied round the pole.
    p.add(torus(0.095, 0.03, 10, 4), m['teal'], xf((0, 0, 1.3)))
    p.add(leaf(0.3, 0.09, 2, 'blade', 0.0, 0.0), m['teal'], leaf_frame((0.06, -0.06, 1.28), RAD(-60), RAD(-70)))
    return p


def postspot(m):
    p = Piece('postspot')
    for i in range(8):
        a = TAU * i / 8 + 0.2
        c = (math.cos(a) * 0.46, math.sin(a) * 0.46, 0.04)
        r = 0.13 + 0.025 * math.sin(i * 2.3)
        p.add(faceted(c, (r, r * 0.9, 0.11), 6, LATS_MIN, 70 + i, [((0, 0, 1), 0.08)]), m['stone'])
    p.add(disc([(math.cos(a) * 0.34, math.sin(a) * 0.34) for a in (TAU * i / 12 for i in range(12))], dome=0.03),
          m['moss'], xf((0, 0, 0.005)))
    return p


def market(m):
    p = Piece('market')
    box(p, m['wood_dark'], (2.4, 0.84, 0.86), (0, 0.0, 0.43), 0.05)
    for i in range(6):
        plank(p, m['wood_light'] if i % 2 else m['wood'], (0.38, 0.08, 0.76), (-0.98 + i * 0.392, -0.44, 0.44), 0.03)
    box(p, m['wood_light'], (2.6, 1.0, 0.1), (0, -0.04, 0.9), 0.04)
    for x in (-1.24, 1.24):
        post(p, m['wood'], x, -0.48, 2.25, 0.07, 4)
        post(p, m['wood'], x, 0.42, 2.5, 0.07, 4)
    # Awning: a sloped, scalloped canvas in pal_awning (tinted per isle by the game) with white stripes.
    n = 8
    x0, x1 = -1.42, 1.42
    for i in range(n):
        xa, xb = x0 + (x1 - x0) * i / n, x0 + (x1 - x0) * (i + 1) / n
        verts, faces = [], []
        rows = [(-0.82, 2.18), (-0.4, 2.36), (0.05, 2.52), (0.52, 2.66)]
        for (y, z) in rows:
            verts += [(xa, y, z + 0.0), (xb, y, z + 0.0)]
        for r in range(len(rows) - 1):
            a = r * 2
            faces.append((a, a + 1, a + 3, a + 2))
        # Scalloped tongue hanging off the front edge.
        tip = len(verts)
        verts += [((xa + xb) / 2, -0.86, 2.0)]
        faces.append((0, tip, 1))
        g = Geo(verts, faces)
        g = K.merge(g, g.flipped().transformed(xf((0, 0, -0.035))))
        p.add(g, m['awning'] if i % 2 == 0 else m['white'], smooth=False)
    plank(p, m['wood_dark'], (2.9, 0.08, 0.08), (0, -0.8, 2.2), 0.02)
    # Crates of produce on the counter, and a sign board.
    for k, (x, col, n_f) in enumerate(((-0.78, 'berry', 5), (-0.1, 'pear', 4), (0.6, 'tangerine', 4))):
        plank(p, m['wood'], (0.56, 0.44, 0.16), (x, -0.16, 1.02), 0.025)
        fruit_pile(p, m[col], (x, -0.16, 1.06), n_f, 0.1, 0.16, 90 + k)
    plank(p, m['cream'], (1.1, 0.06, 0.32), (0, -0.84, 2.4), 0.03, (RAD(-20), 0, 0))
    p.add(disc(star_outline(5, 0.11, 0.05), dome=0.01), m['gold'], xf((0, -0.885, 2.41), (RAD(70), 0, 0)))
    # A basket and a sack on the ground.
    p.add(rcyl(0.22, 0.26, 0.05, 10, arc=1), m['straw'], xf((1.15, -0.85, 0)))
    fruit_pile(p, m['berry'], (1.15, -0.85, 0.2), 3, 0.09, 0.08, 99)
    p.add(blob((-1.2, -0.85, 0.22), (0.24, 0.2, 0.25), 8, LATS_LO), m['straw'])
    return p


def tent(m):
    p = Piece('tent')
    ridge, half_w, depth = 1.55, 1.05, 1.8
    # Two canvas panels (outer orange, a cream inside), with a darker doorway on the front.
    for side in (-1, 1):
        verts = [(0, -depth / 2, ridge), (0, depth / 2, ridge), (side * half_w, depth / 2, 0.02), (side * half_w, -depth / 2, 0.02),
                 (side * half_w * 0.5, -depth / 2 - 0.02, ridge * 0.52), (side * half_w * 0.5, depth / 2 + 0.02, ridge * 0.52)]
        faces = [(0, 4, 5, 1), (4, 3, 2, 5)]
        g = Geo(verts, faces)
        g = K.merge(g, g.flipped().transformed(xf((-side * 0.03, 0, -0.03))))
        g.tags = [0] * 2 + [1] * 2
        p.add(g, {0: m['tangerine'], 1: m['cream']})
    back = Geo([(-half_w, depth / 2, 0.02), (half_w, depth / 2, 0.02), (0, depth / 2, ridge)], [(0, 1, 2)])
    p.add(K.merge(back, back.flipped()), m['tangerine'])
    door = Geo([(-0.42, -depth / 2 + 0.05, 0.02), (0.42, -depth / 2 + 0.05, 0.02), (0, -depth / 2 + 0.05, 1.15)], [(0, 1, 2)])
    p.add(K.merge(door, door.flipped()), m['wood_dark'])
    for side in (-1, 1):  # flaps tied back
        flap = Geo([(0, -depth / 2 - 0.01, ridge), (side * 0.48, -depth / 2 - 0.03, 0.02), (side * 0.75, -depth / 2 - 0.03, 0.4)],
                   [(0, 1, 2)])
        p.add(K.merge(flap, flap.flipped()), m['cream'])
    p.add(tube([(0, -depth / 2 - 0.08, ridge + 0.04), (0, depth / 2 + 0.08, ridge + 0.04)], 0.04, sides=5,
               cap_start=True, cap_end=True), m['wood_dark'])
    for y in (-depth / 2 - 0.06, depth / 2 + 0.06):
        post(p, m['wood'], 0, y, ridge + 0.18, 0.04, 4)
    for x, y in ((-1.4, -1.05), (1.4, -1.05), (-1.4, 1.05), (1.4, 1.05)):
        p.add(tube([(x * 0.55, y * 0.85, ridge * 0.5), (x, y, 0.06)], 0.012, sides=3), m['straw_light'])
        p.add(rcyl(0.03, 0.12, 0.01, 4, arc=1), m['wood'], xf((x, y, 0)))
    p.add(disc(star_outline(5, 0.12, 0.055), dome=0.01), m['sun'], xf((0, -depth / 2 - 0.035, 1.25), (RAD(90), 0, 0)))
    return p


def lantern(m):
    p = Piece('lantern')
    p.add(lathe([(0.16, 0.0), (0.15, 0.08), (0.1, 0.12)], 6), m['stone'])
    post(p, m['wood_dark'], 0, 0, 1.75, 0.045, 6)
    p.add(tube([(0, 0, 1.68), (0.0, -0.18, 1.8), (0.0, -0.36, 1.74)], 0.03, sides=4), m['wood_dark'])
    paper_lantern(p, m['lantern'], m['red'], (0, -0.36, 1.68), 0.2, 0.42, 10)
    return p


def windmill(m):
    p = Piece('windmill')
    p.add(lathe([(1.25, 0.0), (1.26, 0.14), (1.2, 0.24)], 12, mod=lambda th, i: 1 + 0.03 * math.cos(5 * th)), m['stone'])
    p.add(lathe([(1.12, 0.2), (1.05, 1.6), (0.88, 3.1), (0.8, 3.5)], 12), m['white'])
    for z in (1.15, 2.4):
        p.add(lathe([(1.12 - 0.15 * z / 1.6 + 0.02, z), (1.14 - 0.15 * z / 1.6, z + 0.06), (1.12 - 0.15 * z / 1.6 + 0.02, z + 0.12)],
                    12), m['wood'])
    # Golden cap roof (Clover gold), with a little finial.
    cap = lathe([(0.0, 3.42), (0.98, 3.4), (1.0, 3.5), (0.86, 3.78), (0.5, 4.2), (0.0, 4.42)], 12,
                mod=lambda th, i: 1 + (0.03 * math.cos(12 * th) if i in (1, 2) else 0))
    p.add(cap, m['straw'])
    p.add(ico0(0.1, (0, 0, 4.48)), m['gold'])
    # Green door, round windows and a flower box.
    p.add(standing(arch_outline(0.66, 1.0), 0.1, (0, -1.11, 0.2), lip=0.03), m['wood_dark'])
    p.add(standing(arch_outline(0.52, 0.92), 0.1, (0, -1.15, 0.2), lip=0.03), m['leaf_dark'])
    for (a, z) in ((-60, 2.0), (-120, 2.7), (40, 1.9)):
        r = 1.05 - 0.15 * (z - 0.2) / 1.5 + 0.0
        c = Vector((math.cos(RAD(a)) * r, math.sin(RAD(a)) * r, z))
        p.add(torus(0.17, 0.04, 10, 4), m['wood'], xf(c, (RAD(90), 0, RAD(a + 90))))
        p.add(disc([(math.cos(t) * 0.15, math.sin(t) * 0.15) for t in (TAU * i / 10 for i in range(10))]), m['sky'],
              xf(c, (RAD(90), 0, RAD(a + 90))) @ xf((0, 0, -0.01), (RAD(180), 0, 0)))
    box(p, m['wood'], (0.8, 0.22, 0.16), (0, -1.12, 1.38), 0.03)
    for k, x in enumerate((-0.25, 0.0, 0.25)):
        p.add(disc(lobed(5, 2, 0.05, 0.09, 0.6), dome=0.02), m['red'] if k != 1 else m['sun'], xf((x, -1.16, 1.48), (RAD(-30), 0, 0)))
    # Hub housing at the front of the cap; the blades are a separate child spinning on it.
    hub = Vector((0, -1.02, 3.72))
    p.add(rcyl(0.2, 0.36, 0.05, 10, arc=1), m['wood_dark'], xf(hub + Vector((0, 0.32, 0)), (RAD(90), 0, 0)))
    b = Piece('windmill_blades')
    b.add(rcyl(0.17, 0.16, 0.05, 10, z0=-0.08, arc=1), m['gold'], xf(hub, (RAD(90), 0, 0)))
    for k in range(4):
        ang = RAD(45 + 90 * k)
        d = Vector((math.cos(ang), 0, math.sin(ang)))
        s = Vector((-math.sin(ang), 0, math.cos(ang)))
        b.add(K.cbox((0.1, 0.07, 2.0), 0.02), m['wood'],
              Matrix_from(hub + d * 1.05 - Vector((0, 0.06, 0)), d, s))
        # Sail: a slightly cupped cloth panel beside the spar, with two cross slats.
        verts = []
        for t in (0.28, 0.75, 1.0):
            for w in (0.05, 0.32, 0.6):
                cup = 0.06 * math.sin(math.pi * (w - 0.05) / 0.55)
                verts.append(hub + d * (2.0 * t) + s * w + Vector((0, -0.1 - cup, 0)))
        faces = [(0, 1, 4, 3), (1, 2, 5, 4), (3, 4, 7, 6), (4, 5, 8, 7)]
        g = Geo(verts, faces)
        b.add(K.merge(g, g.flipped().transformed(xf((0, 0.02, 0)))), m['white'])
        for t in (0.42, 0.75):
            b.add(tube([hub + d * (2.0 * t) + Vector((0, -0.08, 0)), hub + d * (2.0 * t) + s * 0.62 + Vector((0, -0.12, 0))],
                       0.022, sides=4), m['wood_light'])
    return p, b, hub


def Matrix_from(origin, z_axis, x_axis):
    """A frame with local Z along z_axis and local X along x_axis."""
    z = Vector(z_axis).normalized()
    x = (Vector(x_axis) - z * Vector(x_axis).dot(z)).normalized()
    y = z.cross(x)
    from mathutils import Matrix
    mtx = Matrix((x, y, z)).transposed().to_4x4()
    mtx.translation = Vector(origin)
    return mtx


def coral_arch(m):
    p = Piece('coral_arch')
    rng = random.Random(5)
    span, height = 1.55, 2.9
    pts = []
    for i in range(15):
        a = math.pi * i / 14
        pts.append((span * math.cos(a) * (1.0 + 0.06 * math.sin(3 * a)), 0.08 * math.sin(2 * a), height * math.sin(a) ** 0.9))
    radii = [0.36 - 0.12 * math.sin(math.pi * i / 14) + 0.035 * math.sin(i * 1.9) for i in range(15)]
    g = tube(pts, radii, sides=8)
    for v in g.verts:
        v.z = max(0.0, v.z)
    p.add(g, m['coral'])
    # Knobbly coral branches sprouting off the arch, with rose tips.
    for k, (i, d, ln) in enumerate(((3, (-0.8, -0.2, 0.6), 0.45), (6, (-0.3, -0.5, 1.0), 0.4), (8, (0.4, -0.4, 1.0), 0.42),
                                    (11, (0.8, -0.2, 0.6), 0.45), (5, (-0.4, 0.6, 0.8), 0.36), (10, (0.5, 0.5, 0.8), 0.36))):
        base = Vector(pts[i])
        dv = Vector(d).normalized()
        path = [base, base + dv * ln * 0.55 + Vector((0, 0, 0.05)), base + dv * ln + Vector((0, 0, 0.12))]
        p.add(tube(path, [0.11, 0.08, 0.06], sides=5), m['coral'])
        p.add(blob(path[-1], 0.08, 6, LATS_MIN, seed=k), m['rose'])
    # Rose polyps dotted over the arch.
    for i in range(1, 14, 2):
        c = Vector(pts[i])
        p.add(blob(c + Vector((0, -radii[i] * 0.9, 0.02)), 0.07, 6, LATS_MIN, seed=i), m['rose'])
    # Teal tube sponges and a paper lantern hanging from the top (unlit until the reef is freed: glow_lantern).
    for side in (-1, 1):
        for k, (dx, dy, h, r) in enumerate(((0.5, -0.3, 0.55, 0.11), (0.25, -0.5, 0.36, 0.09), (0.62, 0.2, 0.42, 0.1))):
            x = side * (span + dx * 0.5)
            prof = [(r * 1.1, 0.0), (r, h * 0.4), (r * 1.12, h), (r * 0.72, h * 1.01), (r * 0.68, h * 0.7)]
            p.add(lathe(prof, 7, tag=lambda band, s: 1 if band >= 2 else 0), {0: m['teal'], 1: m['mint']}, xf((x, dy, 0)))
    p.add(tube([(0, 0.0, height - 0.28), (0, 0.0, height - 0.6)], 0.012, sides=3), m['wood_dark'])
    paper_lantern(p, m['lantern'], m['red'], (0, 0.0, height - 0.6), 0.16, 0.32, 8, tassel=True)
    return p


def ore_rock(m):
    p = Piece('ore_rock')
    planes = [((0.3, -0.6, 0.75), 0.45), ((-0.8, -0.3, 0.5), 0.52), ((0.75, 0.4, 0.5), 0.5), ((0, 0, 1), 0.52),
              ((-0.3, 0.85, 0.45), 0.5)]
    p.add(faceted((0, 0, 0.32), (0.66, 0.58, 0.58), 10, LATS5, 8, planes), m['stone'])
    p.add(faceted((0.55, 0.3, 0.06), (0.3, 0.26, 0.24), 7, LATS_LO, 9, [((0, 0, 1), 0.15)]), m['stone_dark'])
    for k, (c, h, r, tilt) in enumerate((((0.12, -0.42, 0.55), 0.34, 0.09, (-0.7, 0.3)), ((-0.36, -0.3, 0.5), 0.28, 0.08, (-0.5, -0.6)),
                                         ((0.42, -0.2, 0.42), 0.26, 0.075, (-0.6, 0.7)), ((-0.05, 0.05, 0.8), 0.3, 0.09, (0.1, 0.2)),
                                         ((0.3, 0.32, 0.62), 0.22, 0.07, (0.5, 0.5)), ((-0.48, 0.15, 0.55), 0.22, 0.07, (0.3, -0.7)))):
        p.add(K.crystal(c, h, r, tilt, sides=5, spin=k, tip=0.4), m['gold'] if k % 2 == 0 else m['tangerine'])
    for c in ((0.0, -0.55, 0.32), (-0.55, -0.28, 0.26), (0.36, 0.0, 0.7)):
        p.add(ico0(0.035, c), m['glow_gold'])
    return p


def forge(m):
    p = Piece('forge')
    # A chunky stone hearth with a coal bed, a hooded chimney, an anvil on a stump and a quench tub.
    box(p, m['stone'], (1.5, 1.1, 0.8), (0, 0.15, 0.4), 0.14)
    plank(p, m['stone_dark'], (1.6, 1.2, 0.12), (0, 0.15, 0.82), 0.05)
    plank(p, m['charcoal'], (1.1, 0.72, 0.1), (0, 0.12, 0.88), 0.04)
    for k in range(9):
        a, r = k * 2.4, 0.08 + 0.32 * (k / 9) ** 0.5
        p.add(ico0(0.07 + 0.02 * (k % 2), (math.cos(a) * r * 1.3, 0.12 + math.sin(a) * r * 0.8, 0.94), 0.7), m['charcoal'])
    hood = lathe([(0.62, 1.55), (0.5, 1.95), (0.26, 2.3)], 4, phase=RAD(45), cap_bottom=False)
    for v in hood.verts:
        v.y *= 0.8
    p.add(hood, m['stone_dark'], xf((0, 0.38, 0)))
    for x in (-0.6, 0.6):
        post(p, m['stone_dark'], x, 0.55, 1.6, 0.08, 4, z0=0.8)
    post(p, m['stone_dark'], 0, 0.38, 0.75, 0.2, 6, z0=2.2)
    p.add(rcyl(0.26, 0.1, 0.03, 6, z0=2.92, arc=1), m['stone'], xf((0, 0.38, 0), (0, 0, RAD(30))))
    # Anvil on a stump, in front-right.
    p.add(rcyl(0.26, 0.5, 0.05, 8, arc=1), m['wood'], xf((0.95, -0.55, 0)))
    anvil = slab([(-0.34, 0.0), (0.2, 0.0), (0.3, 0.05), (0.42, 0.06), (0.2, 0.1), (-0.34, 0.1)], [(1, -0.1), (1, 0.1)])
    p.add(anvil, m['iron'], xf((0.95, -0.55, 0.62), (RAD(90), 0, 0)))
    plank(p, m['iron'], (0.2, 0.16, 0.14), (0.95, -0.55, 0.56), 0.02)
    p.add(tube([(0.86, -0.75, 0.74), (1.2, -0.5, 0.82)], 0.022, sides=4), m['wood_dark'])
    plank(p, m['iron'], (0.1, 0.08, 0.16), (1.22, -0.48, 0.83), 0.02, (0, 0, RAD(40)))
    # A quench tub on the left, and a stack of cold ore.
    p.add(lathe([(0.0, 0.0), (0.3, 0.0), (0.32, 0.45), (0.27, 0.45), (0.26, 0.35)], 10), m['wood'], xf((-1.0, -0.5, 0)))
    p.add(disc([(math.cos(a) * 0.27, math.sin(a) * 0.27) for a in (TAU * i / 10 for i in range(10))]), m['sky'],
          xf((-1.0, -0.5, 0.36)))
    for k, (x, y) in enumerate(((-0.45, -0.7), (-0.3, -0.62), (-0.38, -0.5))):
        p.add(faceted((x, y, 0.05), (0.1, 0.09, 0.08), 5, LATS_MIN, 30 + k, []), m['stone_dark'])
    return p


def rod(m):
    p = Piece('rod')
    # Built lying along +Z (Blender) = glTF +Y: the butt at the origin, the tip leaning toward the front.
    shaft = bez([(0, 0, 0.42), (0, -0.03, 1.0), (0, -0.16, 1.58)], 7)
    p.add(tube(shaft, [0.025, 0.022, 0.019, 0.016, 0.013, 0.011, 0.009], sides=5, cap_end=True), m['wood'])
    p.add(rcyl(0.04, 0.42, 0.015, 6, arc=1), m['wood_light'])
    p.add(rcyl(0.045, 0.05, 0.015, 6, z0=0.4, arc=1), m['red'])
    p.add(rcyl(0.05, 0.06, 0.02, 6, arc=1), m['wood_dark'])
    # Reel on the front of the grip.
    reel_c = Vector((0, -0.07, 0.32))
    p.add(rcyl(0.07, 0.05, 0.015, 8, z0=-0.025, arc=1), m['gold'], xf(reel_c, (0, RAD(90), 0)))
    p.add(torus(0.05, 0.02, 8, 3), m['straw_light'], xf(reel_c, (0, RAD(90), 0)))
    p.add(tube([reel_c + Vector((0.04, 0, 0)), reel_c + Vector((0.08, -0.03, 0.04))], 0.01, sides=3), m['iron'])
    for t in (0.35, 0.7):
        q = Vector(bez([(0, 0, 0.42), (0, -0.03, 1.0), (0, -0.16, 1.58)], 21)[int(t * 20)])
        p.add(K.octa(0.022, q + Vector((0, -0.024, 0)), 0.4), m['iron'])
    return p, Vector(shaft[-1])


def speck(m):
    p = Piece('speck')
    for k, (c, h, r, tilt) in enumerate((((0, 0, 0), 0.34, 0.07, (0.0, 0.05)), ((0.08, -0.04, 0), 0.22, 0.05, (-0.35, 0.45)),
                                         ((-0.08, -0.03, 0), 0.24, 0.055, (-0.3, -0.5)), ((0.0, 0.09, 0), 0.18, 0.045, (0.5, 0.1)),
                                         ((0.04, -0.09, 0), 0.13, 0.04, (-0.7, 0.2)))):
        p.add(no_floor(K.crystal(c, h, r, tilt, sides=5, spin=k, tip=0.4)), m['gloom'])
    p.add(ico0(0.035, (0.0, -0.075, 0.08)), m['glow_gloom'])
    return p


def skydew(m):
    p = Piece('skydew')
    sh, wh = m['cloud_shade'], m['cloud']
    floor = 0.1
    blobs = [dict(c=(0.0, 0.0, 0.32), r=(0.45, 0.36, 0.26), segs=10, m=sh, top=wh, split=2, lats=LATS),
             dict(c=(-0.38, 0.03, 0.24), r=(0.28, 0.26, 0.2), segs=8, m=sh, top=wh, split=2, lats=LATS, phase=0.3),
             dict(c=(0.38, -0.02, 0.23), r=(0.27, 0.25, 0.19), segs=8, m=sh, top=wh, split=2, lats=LATS, phase=0.6),
             dict(c=(0.08, 0.04, 0.52), r=(0.24, 0.22, 0.18), segs=8, m=sh, top=wh, split=2, lats=LATS, phase=1.0)]
    canopy(p, blobs, 0.06, floor=floor, seed=81, keep_floor=True)
    # A dew drop and a twinkle sparkle sitting on top.
    drop = lathe([(0.0, 0.0), (0.07, 0.03), (0.085, 0.09), (0.06, 0.16), (0.0, 0.24)], 8)
    p.add(drop, m['glow_sky'], xf((0.0, -0.08, 0.62)))
    p.add(disc(star_outline(4, 0.14, 0.035), dome=0.02, back=0.02), m['glow_gold'], xf((0.22, -0.16, 0.86), (RAD(60), 0, 0.3)))
    p.add(disc(star_outline(4, 0.08, 0.02), dome=0.01, back=0.01), m['glow_gold'], xf((-0.2, -0.1, 0.74), (RAD(60), 0, -0.2)))
    p.deform(lambda v: (v.x, v.y, v.z - floor))
    return p


# ===================================================== deck hatch + planter
# Added 2026-10-16: Bao's back is a wooden ship deck; Nana's hut is replaced by a hatch down into the cabin.
# (The cabin interior reuses the owner's Zoo Garden house kit, so it is not built here.)
NEW_IDS = ['hatch', 'planter']
NEW_BUDGET = {'hatch': 1500, 'planter': 600}


def rrect(w, h, r, per=2):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -h / 2 + r, -90), (w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90),
                       (-w / 2 + r, -h / 2 + r, 180)):
        for k in range(per + 1):
            a = RAD(a0 + 90 * k / per)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def terraced(outline, rings, centre_z):
    """A disc over an outline: rings [(scale, z, tag)] from the rim inward, closed by a centre fan.
    Faces between ring i and i+1 take ring i's tag; the fan takes the last ring's tag."""
    n = len(outline)
    cx, cy = sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n
    verts, ids = [], []
    for s, z, _ in rings:
        row = []
        for x, y in outline:
            row.append(len(verts))
            verts.append((cx + (x - cx) * s, cy + (y - cy) * s, z))
        ids.append(row)
    c = len(verts)
    verts.append((cx, cy, centre_z))
    faces, tags = [], []
    for k in range(len(rings) - 1):
        a, b = ids[k], ids[k + 1]
        for i in range(n):
            faces.append((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
            tags.append(rings[k][2])
    for i in range(n):
        faces.append((ids[-1][i], ids[-1][(i + 1) % n], c))
        tags.append(rings[-1][2])
    g = Geo(verts, faces, tags)
    g.faces = [f if (g.verts[f[1]] - g.verts[f[0]]).cross(g.verts[f[2]] - g.verts[f[0]]).z >= 0 else tuple(reversed(f))
               for f in g.faces]
    return g


def hatch(m):
    p = Piece('hatch')
    R = 0.8
    # Brass lip on a dark-wood collar, flush with the deck at y = 0; the dark shaft goes down 0.75 m.
    prof = [(R, -0.06), (R, 0.09), (R + 0.025, 0.12), (R + 0.12, 0.12), (R + 0.15, 0.09), (R + 0.18, 0.03), (R + 0.22, 0.0)]
    p.add(lathe(prof, 24, tag=lambda b, s: 0 if b <= 3 else 1), {0: m['gold'], 1: m['wood_dark']})
    p.add(lathe([(R, -0.75), (R, -0.06)], 24), m['charcoal'])
    p.add(disc(K.circle(24, R)), m['navy'], xf((0, 0, -0.75)))
    # The top of the cabin ladder, at the back of the shaft (under the hinge).
    for x in (-0.27, 0.27):
        p.add(tube([(x, 0.52, -0.75), (x, 0.6, 0.08)], 0.04, sides=6, cap_end=True), m['wood_light'])
    for z in (-0.5, -0.24, 0.0):
        y = 0.52 + 0.08 * (z + 0.75) / 0.83
        p.add(tube([(-0.27, y, z), (0.27, y, z)], 0.028, sides=5), m['wood'])
    # Hinge brackets on the collar at the back.
    for x in (-0.38, 0.38):
        plank(p, m['iron'], (0.16, 0.16, 0.05), (x, R + 0.1, 0.11), 0.015)
    # A little lantern post beside the hatch.
    lp = Vector((1.3, 0.2, 0))
    p.add(lathe([(0.16, 0.0), (0.15, 0.07), (0.09, 0.11)], 6), m['wood_dark'], xf(lp))
    post(p, m['wood_dark'], lp.x, lp.y, 1.2, 0.045, 6)
    p.add(tube([lp + Vector((0, 0, 1.12)), lp + Vector((-0.14, -0.06, 1.22)), lp + Vector((-0.28, -0.1, 1.17))], 0.025,
               sides=4), m['wood_dark'])
    paper_lantern(p, m['lantern'], m['red'], lp + Vector((-0.28, -0.1, 1.12)), 0.13, 0.26, 8)
    # The lid (child `door`): planks across, two iron straps, hinge knuckles at the back, a ring pull at the front.
    d = Piece('hatch_door')
    rl, z0, z1 = R + 0.07, 0.125, 0.185
    n = 5
    for i in range(n):
        y0 = -rl + 2 * rl * i / n + 0.008
        y1 = -rl + 2 * rl * (i + 1) / n - 0.008
        ys = [y0, (y0 + y1) / 2, y1]
        right = [(math.sqrt(max(1e-4, rl * rl - y * y)), y) for y in ys]
        outline = right + [(-x, y) for x, y in reversed(right)]
        d.add(slab(outline, [(1.0, z0), (1.0, z1 - 0.012), (0.95, z1)]), m['wood'] if i % 2 else m['wood_light'])
    for x in (-0.38, 0.38):
        chord = math.sqrt(rl * rl - x * x)
        d.add(K.cbox((0.11, rl + chord - 0.04, 0.03), 0.01), m['iron'], xf((x, (rl - chord + 0.04) / 2, z1 + 0.012)))
        d.add(tube([(x - 0.075, rl + 0.01, 0.165), (x + 0.075, rl + 0.01, 0.165)], 0.04, sides=6, cap_start=True,
                   cap_end=True), m['iron'])
    d.add(K.cbox((0.16, 0.1, 0.02), 0.008), m['iron'], xf((0, -rl + 0.2, z1 + 0.01)))
    d.add(torus(0.08, 0.016, 10, 4), m['iron'], xf((0, -rl + 0.14, z1 + 0.025)))
    hinge = Vector((0, rl + 0.01, 0.165))
    return dict(body=p, children=[('door', d, hinge)], markers=[])


def planter(m):
    p = Piece('planter')
    W = 1.5
    hw = W / 2
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.add(rcyl(0.1, 0.32, 0.04, 4, arc=1), m['wood_dark'], xf((sx * (hw - 0.09), sy * (hw - 0.09), 0), (0, 0, RAD(45))))
    for k, z in enumerate((0.085, 0.225)):
        for side, (cx, cy, rot) in enumerate(((0, -hw + 0.05, 0), (0, hw - 0.05, 0), (-hw + 0.05, 0, 90), (hw - 0.05, 0, 90))):
            col = m['wood'] if (k + side) % 2 == 0 else m['wood_light']
            plank(p, col, (W - 0.26, 0.07, 0.13), (cx, cy, z), 0.025, (0, 0, RAD(rot)))
    soil = terraced(rrect(W - 0.12, W - 0.12, 0.2, 2), [(1.0, 0.2, 'moss'), (1.0, 0.25, 'glow'), (0.95, 0.255, 'moss'),
                                                      (0.6, 0.266, 'moss')], 0.27)
    p.add(soil, {'moss': m['moss'], 'glow': m['glow_moss']})
    return dict(body=p, children=[], markers=[('soil', Vector((0, 0, 0.27)))])


# ===================================================================== main
def check(stats):
    errors = []
    for n, s in stats.items():
        limit = NEW_BUDGET[n] if n in NEW_IDS else BUDGET
        if s['tris'] > limit:
            errors.append(f'{n}: {s["tris"]} tris > {limit}')
        if n not in ('skydew', 'hatch') and abs(s['min_y']) > 0.01:
            errors.append(f'{n}: base {s["min_y"]}')
    want = {'hatch': ['door'], 'planter': ['soil']}
    for n, kids in want.items():
        if sorted(stats[n]['children']) != kids:
            errors.append(f'{n}: children {stats[n]["children"]} (want {kids})')
    sizes = dict(chimepost=(2.1, 2.35, 'max_y'), rod=(1.5, 1.7, 'max_y'), speck=(0.3, 0.4, 'max_y'), hut=(2.8, 3.3, 'max_y'))
    for n, (lo, hi, key) in sizes.items():
        if not lo <= stats[n][key] <= hi:
            errors.append(f'{n}: {key} {stats[n][key]} not in {lo}..{hi}')
    if not 1.1 <= max(stats['skydew']['size'][0], stats['skydew']['size'][2]) <= 1.3:
        errors.append(f'skydew size {stats["skydew"]["size"]}')
    if 'blades' not in stats['windmill']['children'] or 'tip' not in stats['rod']['children']:
        errors.append('windmill blades / rod tip missing')
    return errors


def hatch_preview(roots, placed, m):
    """hatch.png: the hatch shut, and open at door.rotation.x = -1.9 (glTF X is Blender X), on deck patches."""
    for o in placed:
        o.hide_render = True
    for r in roots.values():
        for o in K.subtree(r):
            o.hide_render = True
    scene = bpy.context.scene
    ground = bpy.data.objects.get('Preview ground')
    if ground:
        ground.hide_render = True
    bg = next(nd for nd in scene.world.node_tree.nodes if nd.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = style.rgba('#5CC2F7')
    bg.inputs['Strength'].default_value = 1.25
    deck = Piece('Preview deck')
    deck.add(lathe([(1.0, 0.0), (1.3, 0.0), (1.6, 0.0), (1.9, 0.0), (2.2, 0.0)], 32, tag=lambda b, s2: b % 2),
             {0: m['wood'], 1: m['wood_light']})
    dk = deck.build(sharp=0)
    dk.location = (0, 0, -0.002)
    hatch_open = K.place_copy(roots['hatch'], (2.3, 0, 0))
    hatch_shut = roots['hatch']
    hatch_shut.location = (-2.3, 0, 0)
    for o in [o for o in K.subtree(hatch_open) if o.name.startswith('door')]:
        o.rotation_euler = (-1.9, 0, 0)
    dk.location = (-2.3, 0, -0.002)
    dk2 = K.place_copy(dk, (2.3, 0, -0.002))
    show2 = K.subtree(hatch_open) + K.subtree(hatch_shut)
    for o in show2 + [dk, dk2]:
        o.hide_render = False
    K.frame(show2, 1600, margin=0.5)
    style.render(os.path.join(K.PREVIEWS, 'hatch.png'))


def main():
    style.reset_scene()
    m = mats()
    roots = {}
    extra = {}
    for n in IDS + NEW_IDS:
        out = globals()[n](m)
        if isinstance(out, dict):
            body = out['body']
            if n != 'hatch':
                body.deform(lambda v: (v.x, v.y, max(0.0, v.z)))
            obj = body.build(sharp=50, name=n)
            for cname, piece, pivot in out['children']:
                co = piece.build(sharp=50, pivot=pivot, name=cname)
                co.data.name = f'{n}_{cname}'
                attach(co, obj)
                extra[f'{n}/{cname}'] = [round(c, 3) for c in K.gltf_vec(pivot)]
            for mname, loc in out['markers']:
                marker(mname, loc, obj)
                extra[f'{n}/{mname}'] = [round(c, 3) for c in K.gltf_vec(loc)]
        elif n == 'windmill':
            body, blades, hub = out
            obj = body.build(sharp=50, name=n)
            bo = blades.build(sharp=50, pivot=hub, name='blades')
            bo.data.name = 'windmill_blades'
            attach(bo, obj)
            extra['windmill_hub'] = [round(c, 3) for c in K.gltf_vec(hub)]
        elif n == 'rod':
            body, tip = out
            obj = body.build(sharp=50, name=n)
            marker('tip', tip, obj)
            extra['rod_tip'] = [round(c, 3) for c in K.gltf_vec(tip)]
        else:
            if n != 'skydew':
                out.deform(lambda v: (v.x, v.y, max(0.0, v.z)))
            obj = out.build(sharp=50, name=n)
        roots[n] = obj
    bpy.context.view_layer.update()
    stats = {n: K.root_stats(o) for n, o in roots.items()}
    K.report(stats)
    errors = check(stats)
    path, size = K.export(list(roots.values()), FILE)
    print(f'{FILE}: {size} bytes, {sum(s["tris"] for s in stats.values())} tris', extra)
    K.write_manifest(FILE, size, stats, dict(generator='art/blender/kit/build_props.py', markers=extra,
                                            notes='windmill/blades: pivot at the hub, spin about local +Z (the front '
                                                  'axis); rod: origin at the butt, tip marker at the end; skydew: '
                                                  'origin at its underside centre; market awning uses pal_awning; '
                                                  'lanterns/windows use glow_lantern (set emissive 0 for unlit); '
                                                  'hatch/door pivots on the hinge at the back edge, open with '
                                                  'door.rotation.x -> -1.9; planter/soil: empty marker at the '
                                                  'soil top; the hatch shaft reaches below y = 0'))
    if '--render' in K.args():
        order = ['hut', 'windmill', 'market', 'forge', 'coral_arch', 'tent',
                 'kitchen', 'workbench', 'maptable', 'fishspot', 'ropepost', 'pantry',
                 'chimepost', 'lantern', 'ore_rock', 'postspot', 'rod', 'speck', 'skydew']
        new_small = ['hatch', 'planter']
        cells = [(roots[n], f'{n}  {stats[n]["tris"]}') for n in order + new_small]
        placed = K.contact_sheet(cells, os.path.join(K.PREVIEWS, 'props.png'), cols=6, pitch=(4.4, 4.7),
                                 width_px=2400, label_size=0.26, label_dy=2.15)
        roots['skydew'].location.z += 0.6  # it floats
        for tag, names in (('a', order[:6]), ('b', order[6:12]), ('c', order[12:]), ('d', new_small)):
            objs = [o for n in names for o in K.subtree(roots[n]) if o.type == 'MESH']
            K.frame(objs, 2000, margin=0.3)
            style.render(os.path.join(K.PREVIEWS, f'props-closeup-{tag}.png'))
        hatch_preview(roots, placed, m)
    if errors:
        raise SystemExit('props contract failures:\n  ' + '\n  '.join(errors))
    print('props OK')


main()
