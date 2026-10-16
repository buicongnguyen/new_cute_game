"""Gloom forms, the animals they hold, and the crystal cage -> public/assets/models/gloom.glb.

Gloom forms are cute-creepy: grey-violet faceted `gloom_crystal` shells (flat shaded) around one big glowing
`glow_gloom` eye with a dark slit pupil and a glint. Each form's crystal hints at the animal inside (bunny ears on
the gloomling, frog haunches on the spitter, goat horns on the brute, a beak and tail on the flyer). The freed
animals are warm, round and smooth, with big glossy eyes. See docs/ART-CONTRACT.md and docs/STORY.md.

    blender -b --factory-startup --python art/blender/kit/build_gloom.py -- [--render]

Roots and children:
    gloomling, spitter, brute, spire   shell, eye
    flyer                              shell, eye, wing_l, wing_r (pivots at the shoulders)
    puffbun, hopfrog, rockgoat         body
    skylark                            body, wing_l, wing_r
    cage                               shell (gloom_crystal_clear, alpha 0.55)
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cast import (FWD, UP, Cast, Geo, Matrix, Vector, args, decal, ell_dir, ellipsoid, facet_blob, frame, gem,  # noqa: E402
                      glow, gloom_crystal, loft, pal, sheet, shard, style, surface_curve, torus, tube)

FILE = 'gloom'
BUDGETS = dict(gloomling=1500, spitter=1500, brute=1500, flyer=1500, spire=1200, puffbun=1500, hopfrog=1500,
               rockgoat=1500, skylark=1500, cage=900)
ORDER = ['gloomling', 'spitter', 'brute', 'flyer', 'spire', 'cage', 'puffbun', 'hopfrog', 'rockgoat', 'skylark']
SHEET_ROWS = [['puffbun', 'hopfrog', 'rockgoat', 'skylark', 'gloomling', 'spitter', 'flyer'], ['brute', 'spire', 'cage']]
GLOOM_EYE = '#B26BFF'


def M():
    return dict(crystal=gloom_crystal(), dark=pal('gloom_dark', 0.35), eye=glow('gloom', GLOOM_EYE, 1.1),
                night=pal('night', 0.2), white=pal('white', 0.25))


# ------------------------------------------------------------------ crystal helpers
def flat_base(g, y0=0.0):
    g.v = [Vector((v.x, max(v.y, y0), v.z)) for v in g.v]
    return g


def gloom_eye(c, fwd, r, m, squash=(1.0, 1.08, 0.62), up=UP):
    """The one big Gloom eye: a glowing violet orb, a dark slit pupil and a white glint. Pivot = its centre."""
    R = frame(fwd, up)
    g = Geo()
    g.add(ellipsoid(c, (r * squash[0], r * squash[1], r * squash[2]), 14, 9, R, m['eye']))
    dz = r * squash[2]
    g.add(ellipsoid(c + R @ Vector((0, -r * 0.02, dz * 0.8)), (r * 0.36, r * 0.7, dz * 0.3), 10, 6, R, m['night']))
    g.add(ellipsoid(c + R @ Vector((r * 0.13, r * 0.3, dz * 1.02)), (r * 0.14, r * 0.17, r * 0.06), 8, 4, R, m['white']))
    return g


def socket(c, fwd, r, m, seed=0):
    """A ring of crystal teeth around the eye."""
    R = frame(fwd, UP)
    rng = random.Random(seed)
    g = Geo()
    n = 9
    for k in range(n):
        a = math.tau * k / n
        base = c + R @ Vector((math.cos(a) * r * 1.08, math.sin(a) * r * 1.12, -r * 0.25))
        out = R @ Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.8))
        g.add(shard(base, out, r * rng.uniform(0.45, 0.7), r * 0.24, 4, 0.55, m['crystal'], seed * 31 + k))
    return g


def spikes(g, m, specs, seed=0):
    for i, (base, d, ln, r) in enumerate(specs):
        g.add(shard(Vector(base), Vector(d), ln, r, 5, 0.45, m, seed * 17 + i))
    return g


def plate(outline, thick, m, R=None, at=(0, 0, 0)):
    """A flat faceted plate from a 2D outline [(x, z)] lying in the XZ plane (wings, fins, feathers)."""
    g = Geo()
    top = [g.vert((x, thick / 2, z)) for x, z in outline]
    bot = [g.vert((x, -thick / 2, z)) for x, z in outline]
    g.face(top, m, False)
    g.face(list(reversed(bot)), m, False)
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        g.face((top[j], top[i], bot[i], bot[j]), m, False)
    g.outward()
    if R is not None:
        g.xf(R)
    return g.move(at)


# ------------------------------------------------------------------ Gloom forms
def gloomling(cast, m):
    root = cast.root('gloomling')
    sh = flat_base(facet_blob((0, 0.36, 0), (0.4, 0.35, 0.38), 2, 0.09, 3, m['crystal']), 0.04)
    for s in (1, -1):   # tall bunny ears of crystal
        rings = []
        base = Vector((s * 0.13, 0.58, -0.04))
        d = Vector((s * 0.22, 1.0, -0.18)).normalized()
        R = frame(d, (0, 0, 1))
        for t, w, th in ((0.0, 0.085, 0.055), (0.45, 0.1, 0.05), (0.85, 0.07, 0.04)):
            rings.append([base + d * (t * 0.5) + R @ Vector((math.cos(math.tau * k / 5) * w, math.sin(math.tau * k / 5) * th, 0))
                          for k in range(5)])
        sh.add(loft(rings, m['crystal'], end=base + d * 0.56, smooth=False))
    spikes(sh, m['crystal'], [((0.24, 0.5, -0.2), (0.7, 0.8, -0.6), 0.2, 0.06),
                              ((-0.24, 0.5, -0.2), (-0.7, 0.8, -0.6), 0.2, 0.06), ((0.0, 0.32, -0.36), (0, 0.2, -1), 0.16, 0.06)], 1)
    for s in (1, -1):   # little crystal feet
        sh.add(facet_blob((s * 0.16, 0.06, 0.22), (0.09, 0.06, 0.11), 1, 0.05, 20 + s, m['crystal']))
    ec, ef = Vector((0, 0.4, 0.31)), Vector((0, 0.08, 1))
    sh.add(socket(ec, ef, 0.17, m, 2))
    cast.part(root, 'shell', sh, (0, 0, 0))
    cast.part(root, 'eye', gloom_eye(ec, ef, 0.17, m), ec)


def spitter(cast, m):
    root = cast.root('spitter')
    sh = flat_base(facet_blob((0, 0.3, -0.02), (0.42, 0.28, 0.4), 2, 0.08, 5, m['crystal']), 0.03)
    for s in (1, -1):   # frog haunches
        sh.add(flat_base(facet_blob((s * 0.31, 0.2, -0.17), (0.17, 0.17, 0.22), 1, 0.08, 30 + s, m['crystal']), 0.02))
        sh.add(facet_blob((s * 0.22, 0.05, 0.25), (0.08, 0.05, 0.1), 1, 0.05, 40 + s, m['crystal']))
    # the mouth tube with a dark bore
    a, b = Vector((0, 0.24, 0.26)), Vector((0, 0.27, 0.6))
    d = (b - a).normalized()
    rings = []
    for t, rr in ((0.0, 0.1), (0.75, 0.095), (0.8, 0.13), (1.0, 0.13)):
        p = a.lerp(b, t)
        R = frame(d, UP)
        rings.append([p + R @ Vector((math.cos(math.tau * k / 6 + 0.5) * rr, math.sin(math.tau * k / 6 + 0.5) * rr, 0))
                      for k in range(6)])
    sh.add(loft(rings, m['crystal'], smooth=False))
    R = frame(d, UP)
    sh.add(loft([[b + d * 0.003 + R @ Vector((math.cos(math.tau * k / 6 + 0.5) * 0.085, math.sin(math.tau * k / 6 + 0.5) * 0.085, 0))
                  for k in range(6)]], m['dark'], end=b + d * 0.004, smooth=False))
    spikes(sh, m['crystal'], [((0.0, 0.5, -0.2), (0, 1, -0.7), 0.24, 0.07), ((0.18, 0.46, -0.28), (0.5, 0.8, -0.8), 0.18, 0.06),
                              ((-0.18, 0.46, -0.28), (-0.5, 0.8, -0.8), 0.18, 0.06)], 2)
    ec, ef = Vector((0, 0.56, 0.12)), Vector((0, 0.45, 1))
    sh.add(facet_blob(ec - ef.normalized() * 0.07, (0.17, 0.14, 0.15), 1, 0.05, 50, m['crystal']))   # eye mound
    sh.add(socket(ec, ef, 0.15, m, 3))
    cast.part(root, 'shell', sh, (0, 0, 0))
    cast.part(root, 'eye', gloom_eye(ec, ef, 0.15, m), ec)


def brute(cast, m):
    root = cast.root('brute')
    sh = facet_blob((0, 0.82, -0.12), (0.62, 0.55, 0.86), 2, 0.08, 7, m['crystal'])
    for sx_ in (1, -1):
        for sz in (1, -1):
            base = Vector((sx_ * 0.36, 0.0, sz * 0.48 - 0.08))
            rings = []
            for y, rr in ((0.0, 0.17), (0.12, 0.19), (0.62, 0.15)):
                rings.append([base + Vector((math.cos(math.tau * k / 6) * rr, y, math.sin(math.tau * k / 6) * rr))
                              for k in range(6)])
            sh.add(loft(rings, m['crystal'], smooth=False))
    head_c = Vector((0, 0.82, 0.86))
    sh.add(facet_blob(head_c, (0.38, 0.33, 0.36), 2, 0.07, 9, m['crystal']))
    # curled goat horns: faceted tubes sweeping back and curling forward
    for s in (1, -1):
        pts = []
        for i in range(8):
            t = i / 7
            a = t * 3.6
            pts.append(head_c + Vector((s * (0.2 + 0.42 * math.sin(t * 1.9)), 0.22 + 0.34 * math.sin(a * 0.72),
                                        -0.12 - 0.3 * math.sin(a * 0.6) + 0.42 * t * t)))
        sh.add(tube(pts, [0.12 - 0.09 * (i / 7) for i in range(8)], 5, m['crystal'], smooth=False, round_caps=0.8))
    spikes(sh, m['crystal'], [((0.0, 1.32, -0.05), (0, 1, -0.25), 0.42, 0.13), ((0.0, 1.25, -0.5), (0, 1, -0.6), 0.38, 0.12),
                              ((0.0, 1.05, -0.9), (0, 0.6, -1), 0.32, 0.11), ((0.3, 1.2, -0.2), (0.6, 1, -0.2), 0.32, 0.1),
                              ((-0.3, 1.2, -0.2), (-0.6, 1, -0.2), 0.32, 0.1), ((0.0, 1.32, 0.38), (0, 1, 0.2), 0.3, 0.1)], 3)
    ec, ef = head_c + Vector((0, 0.04, 0.3)), Vector((0, 0.05, 1))
    sh.add(socket(ec, ef, 0.17, m, 4))
    cast.part(root, 'shell', sh, (0, 0, 0))
    cast.part(root, 'eye', gloom_eye(ec, ef, 0.17, m), ec)


def flyer(cast, m):
    root = cast.root('flyer')
    body_c = Vector((0, 0.42, 0))
    sh = facet_blob(body_c, (0.21, 0.19, 0.3), 2, 0.07, 13, m['crystal'])
    sh.add(shard(body_c + Vector((0, 0.03, 0.26)), Vector((0, -0.12, 1)), 0.2, 0.06, 4, 0.7, m['crystal'], 5))   # beak
    for k, a in enumerate((-0.35, 0.0, 0.35)):   # tail fan
        sh.add(shard(body_c + Vector((0, 0.04, -0.24)), Vector((math.sin(a), 0.25, -1)), 0.32, 0.055, 4, 0.5,
                     m['crystal'], 60 + k))
    spikes(sh, m['crystal'], [((0.0, 0.58, 0.02), (0, 1, -0.6), 0.2, 0.05), ((0.0, 0.57, -0.1), (0, 1, -1), 0.16, 0.045)], 4)
    ec, ef = body_c + Vector((0, 0.07, 0.2)), Vector((0, 0.15, 1))
    cast.part(root, 'shell', sh, (0, 0, 0))
    cast.part(root, 'eye', gloom_eye(ec, ef, 0.105, m), ec)
    for s, name in ((1, 'wing_l'), (-1, 'wing_r')):
        piv = body_c + Vector((s * 0.16, 0.08, 0.02))
        w = Geo()
        feathers = [(0.62, 0.0, 0.16), (0.5, -0.12, 0.13), (0.38, -0.24, 0.11)]
        for k, (ln, back, wd) in enumerate(feathers):
            outline = [(0.0, wd * 0.5 + back * 0.2), (ln * 0.6, wd * 0.55 + back * 0.7), (ln, back * 0.9 + 0.02),
                       (ln * 0.8, back - wd * 0.45), (ln * 0.25, back * 0.5 - wd * 0.5), (0.0, -wd * 0.4)]
            outline = [(s * x, z) for x, z in outline]
            if s < 0:
                outline = list(reversed(outline))
            w.add(plate(outline, 0.035 - 0.006 * k, m['crystal'], Matrix.Rotation(s * -0.22, 3, 'Z'),
                        piv + Vector((0, 0.01 * k, 0))))
        cast.part(root, name, w, piv)


def spire(cast, m):
    root = cast.root('spire')
    sh = Geo()
    sh.add(flat_base(facet_blob((0, 0.16, 0), (0.62, 0.3, 0.6), 1, 0.12, 70, m['dark']), 0.0))
    core_c = Vector((0, 1.4, 0))
    for k in range(3):   # three columns cradle the glowing core
        a = math.tau * k / 3 + 0.3
        base = Vector((math.cos(a) * 0.32, 0.15, math.sin(a) * 0.32))
        top = Vector((math.cos(a) * 0.12, 2.15, math.sin(a) * 0.12))
        mid = Vector((math.cos(a) * 0.42, 1.35, math.sin(a) * 0.42))
        rings = []
        for p, rr in ((base, 0.2), (mid, 0.17), (top, 0.15)):
            rings.append([p + Vector((math.cos(math.tau * j / 5 + a) * rr, 0, math.sin(math.tau * j / 5 + a) * rr))
                          for j in range(5)])
        sh.add(loft(rings, m['crystal'], smooth=False))
    rings = []
    for y, rr in ((1.95, 0.26), (2.2, 0.36), (2.85, 0.3)):
        rings.append([Vector((math.cos(math.tau * j / 6) * rr, y, math.sin(math.tau * j / 6) * rr)) for j in range(6)])
    sh.add(loft(rings, m['crystal'], end=Vector((0.03, 3.5, 0.0)), smooth=False))
    spikes(sh, m['crystal'], [((0.4, 0.2, 0.15), (0.6, 1, 0.2), 1.1, 0.16), ((-0.35, 0.2, 0.3), (-0.5, 1, 0.4), 0.9, 0.14),
                              ((0.05, 0.2, -0.42), (0.1, 1, -0.6), 1.25, 0.17), ((-0.3, 0.15, -0.3), (-0.7, 0.8, -0.5), 0.6, 0.12),
                              ((0.3, 2.3, 0.1), (0.8, 1, 0.2), 0.45, 0.1), ((-0.25, 2.4, -0.1), (-0.8, 1, -0.2), 0.4, 0.09)], 5)
    cast.part(root, 'shell', sh, (0, 0, 0))
    cast.part(root, 'eye', gem(core_c, 0.27, 0.62, 6, m['eye']), core_c)


def cage(cast, m):
    root = cast.root('cage')
    clear = gloom_crystal(alpha=0.55)
    g = Geo()
    n = 8
    for k in range(n):
        a = math.tau * k / n
        g.add(facet_blob((math.cos(a) * 0.6, 0.1, math.sin(a) * 0.6), (0.15, 0.12, 0.15), 1, 0.12, 80 + k, clear))
        b0 = Vector((math.cos(a) * 0.6, 0.05, math.sin(a) * 0.6))
        b1 = Vector((math.cos(a) * 0.64, 1.15, math.sin(a) * 0.64))
        b2 = Vector((math.cos(a + 0.1) * 0.34, 1.78, math.sin(a + 0.1) * 0.34))
        rings = []
        for p, rr in ((b0, 0.075), (b1, 0.068), (b2, 0.05)):
            rings.append([p + Vector((math.cos(math.tau * j / 5 + a) * rr, 0, math.sin(math.tau * j / 5 + a) * rr))
                          for j in range(5)])
        g.add(loft(rings, clear, end=b2 + Vector((-math.cos(a) * 0.12, 0.16, -math.sin(a) * 0.12)), smooth=False))
    g.add(facet_blob((0, 1.9, 0), (0.22, 0.12, 0.22), 1, 0.1, 90, clear))
    for k in range(4):
        a = math.tau * k / 4 + 0.4
        g.add(shard(Vector((math.cos(a) * 0.12, 1.88, math.sin(a) * 0.12)), Vector((math.cos(a) * 0.5, 1, math.sin(a) * 0.5)),
                    0.14, 0.05, 4, 0.5, clear, 95 + k))
    cast.part(root, 'shell', g, (0, 0, 0))


# ------------------------------------------------------------------ freed animals
def face(g, c, r, d_az=0.42, el=0.05, eye_w=None, eye_h=None, smile_el=-0.28, cheeks=True, m=None):
    """Big glossy eyes, pink cheeks and a little smile on an ellipsoid head (centre c, radii r)."""
    ew = eye_w or r[0] * 0.2
    eh = eye_h or r[1] * 0.28
    for side in (1, -1):
        d = Vector((math.sin(side * d_az), math.sin(el), math.cos(d_az)))
        g.add(decal(c, r, d, ew, eh, m['night'], 12, 2, 0.003, r[0] * 0.03))
        g.add(decal(c, r, d, ew * 0.38, ew * 0.38, m['white'], 8, 1, r[0] * 0.05, 0.0, offset=(ew * 0.3, eh * 0.38)))
        g.add(decal(c, r, d, ew * 0.18, ew * 0.18, m['white'], 6, 1, r[0] * 0.05, 0.0, offset=(-ew * 0.3, -eh * 0.42)))
        if cheeks:
            dc = Vector((math.sin(side * (d_az + 0.32)), math.sin(el - 0.3), math.cos(d_az + 0.32)))
            g.add(decal(c, r, dc, ew * 0.95, eh * 0.45, pal('cheek', 0.6), 10, 1, 0.003, 0.002))
    pts = surface_curve(c, r, Vector((0, math.sin(smile_el), math.cos(smile_el))),
                        [(u * ew * 0.85, -ew * 0.35 * (1 - u * u)) for u in (-1, -0.5, 0, 0.5, 1)], 0.003)
    g.add(tube(pts, [ew * 0.1, ew * 0.15, ew * 0.16, ew * 0.15, ew * 0.1], 5, m['night']))


def puffbun(cast, m):
    root = cast.root('puffbun')
    fur, pink, white = pal('honey', 0.6), pal('blossom', 0.6), pal('white', 0.5)
    c, r = Vector((0, 0.22, 0)), (0.25, 0.22, 0.24)
    g = ellipsoid(c, r, 18, 12, None, fur)
    g.add(decal(c, r, Vector((0, -0.45, 1)), 0.12, 0.09, white, 12, 2, 0.004, 0.006))   # cream tummy
    face(g, c, r, 0.4, 0.12, 0.042, 0.052, -0.1, m=m)
    nose_p, nose_n = ell_dir(c, r, Vector((0, 0.0, 1)))
    g.add(ellipsoid(nose_p + nose_n * 0.006, (0.016, 0.012, 0.01), 6, 4, None, pink))
    for s in (1, -1):
        R = Matrix.Rotation(-s * 0.28, 3, 'Z') @ Matrix.Rotation(-0.25, 3, 'X')
        ec = c + Vector((s * 0.1, 0.34, -0.03))
        g.add(ellipsoid(ec, (0.058, 0.16, 0.04), 10, 7, R, fur))
        g.add(ellipsoid(ec + R @ Vector((0, 0.01, 0.028)), (0.033, 0.12, 0.016), 8, 5, R, pink))
        g.add(ellipsoid(Vector((s * 0.1, 0.03, 0.15)), (0.06, 0.035, 0.07), 8, 5, None, fur))   # feet
    g.add(ellipsoid(c + Vector((0, -0.05, -0.24)), 0.07, 8, 6, None, white))   # tail puff
    cast.part(root, 'body', g, (0, 0, 0))


def hopfrog(cast, m):
    root = cast.root('hopfrog')
    skin, belly, spot = pal('grass', 0.5), pal('sun', 0.5), pal('leaf_dark', 0.5)
    c, r = Vector((0, 0.15, 0)), (0.21, 0.14, 0.2)
    g = ellipsoid(c, r, 16, 10, None, skin)
    g.add(decal(c, r, Vector((0, -0.55, 1)), 0.13, 0.07, belly, 12, 2, 0.003, 0.006))
    for s in (1, -1):
        ec = Vector((s * 0.09, 0.27, 0.07))
        g.add(ellipsoid(ec, (0.072, 0.07, 0.068), 12, 8, None, skin))
        R = frame(Vector((s * 0.25, 0.25, 1)), UP)
        g.add(ellipsoid(ec + R @ Vector((0, 0.005, 0.05)), (0.045, 0.05, 0.03), 10, 6, R, m['night']))
        g.add(ellipsoid(ec + R @ Vector((0.016, 0.022, 0.074)), (0.014, 0.014, 0.008), 6, 4, R, m['white']))
        g.add(decal(c, r, Vector((s * 0.75, -0.05, 0.7)), 0.04, 0.025, pal('cheek', 0.6), 10, 1, 0.003, 0.002))
        g.add(ellipsoid(Vector((s * 0.2, 0.08, -0.08)), (0.08, 0.07, 0.11), 10, 6, None, skin))   # haunch
        g.add(ellipsoid(Vector((s * 0.12, 0.02, 0.17)), (0.05, 0.02, 0.05), 8, 4, None, belly))   # front feet
        g.add(ellipsoid(Vector((s * 0.24, 0.02, 0.02)), (0.06, 0.02, 0.07), 8, 4, None, belly))   # back feet
    for k, (dx, dz, rr) in enumerate(((0.05, -0.08, 0.03), (-0.08, -0.04, 0.025), (0.0, -0.14, 0.022))):
        g.add(decal(c, r, Vector((dx, 1, dz)), rr, rr, spot, 8, 1, 0.003, 0.002))
    pts = surface_curve(c, r, Vector((0, -0.12, 1)), [(u * 0.11, -0.022 * (1 - u * u)) for u in (-1, -0.5, 0, 0.5, 1)],
                        0.003)
    g.add(tube(pts, [0.005, 0.007, 0.008, 0.007, 0.005], 5, m['night']))
    cast.part(root, 'body', g, (0, 0, 0))


def rockgoat(cast, m):
    root = cast.root('rockgoat')
    fur, face_m, horn, hoof, wool = (pal('wood_light', 0.6), pal('wood', 0.55), pal('wood_dark', 0.45),
                                     pal('charcoal', 0.5), pal('white', 0.6))
    g = ellipsoid((0, 0.42, -0.05), (0.27, 0.25, 0.34), 12, 8, None, fur)
    for k, (x, y, z, rr) in enumerate(((0, 0.6, -0.06, 0.19), (0.13, 0.56, -0.24, 0.15), (-0.13, 0.56, -0.24, 0.15),
                                       (0, 0.58, 0.12, 0.15))):
        g.add(ellipsoid((x, y, z), rr, 7, 5, None, wool))
    for sx_ in (1, -1):
        for sz in (1, -1):
            p = Vector((sx_ * 0.14, 0.0, sz * 0.19 - 0.04))
            g.add(tube([p + Vector((0, 0.26, 0)), p + Vector((0, 0.07, 0))], 0.066, 6, face_m, round_caps=0.3))
            g.add(ellipsoid(p + Vector((0, 0.04, 0.012)), (0.07, 0.05, 0.075), 7, 3, None, hoof))
    hc, hr = Vector((0, 0.64, 0.3)), (0.16, 0.15, 0.155)
    g.add(ellipsoid(hc, hr, 12, 8, None, fur))
    g.add(ellipsoid(hc + Vector((0, -0.05, 0.11)), (0.09, 0.07, 0.07), 8, 5, None, wool))   # muzzle
    g.add(ellipsoid(hc + Vector((0, -0.03, 0.175)), (0.025, 0.016, 0.012), 6, 4, None, pal('blossom', 0.6)))   # nose
    g.add(ellipsoid(hc + Vector((0, -0.15, 0.1)), (0.035, 0.05, 0.03), 8, 5, None, wool))   # little beard
    face(g, hc, hr, 0.45, 0.2, 0.03, 0.04, -0.3, cheeks=True, m=m)
    for s in (1, -1):
        g.add(ellipsoid(hc + Vector((s * 0.16, 0.03, -0.02)), (0.07, 0.03, 0.04), 8, 4, Matrix.Rotation(s * -0.4, 3, 'Z'),
                        face_m))   # ears
        pts = [hc + Vector((s * (0.06 + 0.11 * math.sin(t * 2.2)), 0.12 + 0.15 * math.sin(t * 2.5), -0.02 - 0.18 * t))
               for t in (0, 0.25, 0.5, 0.75, 1.0)]
        g.add(tube(pts, [0.045, 0.04, 0.032, 0.022, 0.012], 6, horn))
    g.add(ellipsoid((0, 0.5, -0.4), 0.06, 6, 4, None, wool))
    cast.part(root, 'body', g, (0, 0, 0))


def skylark(cast, m):
    root = cast.root('skylark')
    feather, belly, beak, dark = pal('tangerine', 0.5), pal('sun', 0.5), pal('honey', 0.5), pal('pumpkin', 0.5)
    g = ellipsoid((0, 0.2, 0), (0.12, 0.11, 0.16), 14, 9, None, feather)
    g.add(decal((0, 0.2, 0), (0.12, 0.11, 0.16), Vector((0, -0.6, 0.8)), 0.07, 0.07, belly, 12, 2, 0.003, 0.006))
    hc, hr = Vector((0, 0.32, 0.09)), (0.095, 0.09, 0.09)
    g.add(ellipsoid(hc, hr, 14, 9, None, feather))
    face(g, hc, hr, 0.5, 0.12, 0.022, 0.03, -0.45, cheeks=True, m=m)
    p, n = ell_dir(hc, hr, Vector((0, -0.05, 1)))
    g.add(tube([p - n * 0.01, p + n * 0.05], [0.022, 0.004], 6, beak, round_caps=0.3))
    for k, a in enumerate((-0.25, 0.25)):   # crest
        g.add(tube([hc + Vector((0, 0.07, -0.01)), hc + Vector((a * 0.1, 0.15, -0.06)), hc + Vector((a * 0.16, 0.17, -0.12))],
                   [0.016, 0.011, 0.004], 5, dark))
    for k, a in enumerate((-0.3, 0.0, 0.3)):   # tail
        g.add(ellipsoid(Vector((math.sin(a) * 0.05, 0.22, -0.19)), (0.03, 0.012, 0.08), 8, 4,
                        Matrix.Rotation(a, 3, 'Y') @ Matrix.Rotation(-0.3, 3, 'X'), dark))
    for s in (1, -1):
        g.add(tube([Vector((s * 0.04, 0.1, 0.02)), Vector((s * 0.045, 0.01, 0.03))], 0.01, 4, beak, round_caps=0.5))
        g.add(ellipsoid(Vector((s * 0.045, 0.008, 0.05)), (0.022, 0.008, 0.03), 6, 3, None, beak))
    cast.part(root, 'body', g, (0, 0, 0))
    for s, name in ((1, 'wing_l'), (-1, 'wing_r')):
        piv = Vector((s * 0.1, 0.25, 0.02))
        w = Geo()
        for k, (ln, back, col) in enumerate(((0.2, 0.0, dark), (0.16, -0.05, feather), (0.12, -0.09, feather))):
            R = Matrix.Rotation(s * -0.35, 3, 'Z') @ Matrix.Rotation(0.15 * k, 3, 'Y') if s > 0 else \
                Matrix.Rotation(s * -0.35, 3, 'Z') @ Matrix.Rotation(-0.15 * k, 3, 'Y')
            w.add(ellipsoid(piv + R @ Vector((s * ln * 0.5, 0.0, back)), (ln * 0.55, 0.014, 0.045), 10, 4, R, col))
        w.add(ellipsoid(piv + Matrix.Rotation(s * -0.35, 3, 'Z') @ Vector((s * 0.2, 0.0, 0.0)), (0.04, 0.012, 0.03), 8, 4,
                        Matrix.Rotation(s * -0.35, 3, 'Z'), belly))
        cast.part(root, name, w, piv)


# ------------------------------------------------------------------ assemble
def build():
    style.reset_scene()
    cast = Cast(FILE)
    m = M()
    for fn in (gloomling, spitter, brute, flyer, spire, cage, puffbun, hopfrog, rockgoat, skylark):
        fn(cast, m)
    return cast


def main():
    cast = build()
    cast.export(BUDGETS)
    if '--render' in args():
        sheet(cast, 'gloom.png', rows=SHEET_ROWS, gap=0.6, row_gap=2.4, size=(2000, 1300), elev=45, yaw=0, ortho=11.0)
        sheet(cast, 'gloom-front.png', rows=SHEET_ROWS, gap=0.6, row_gap=2.4, size=(2000, 1100), elev=12, yaw=0,
              ortho=10.0)


if __name__ == '__main__':
    main()
