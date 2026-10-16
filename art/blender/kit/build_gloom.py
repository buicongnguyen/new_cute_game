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
    plank                              body (boarding plank; origin at its near end, runs along +Z, top at y = 0)
    shellback                          shell (body and the big front shield), eye (peeks over the shield)
    puffcap                            shell (the stalk), cap (pivot at its base: scale it up before it bursts), eye
    pebbleturtle, mushpup              body (freed animals of the shellback and the puffcap)
    gloom_beast                        the boarding "ship": a big manta-whale (freed colours) with a flat planked deck
                                       on its back (y = 0, origin at the deck centre); crust (every Gloom crystal on it,
                                       so the code can hide them all), body, eye_l, eye_r, tail (pivot at the root),
                                       fin_l, fin_r (pivots at the roots)
    gloom_raider                       a small raid boat: a round sky-pufferfish with a plank platform on its back
                                       (y = 0, origin at the platform centre); crust, body, eye (both eyes), fin_l, fin_r,
                                       tail
The Gloom "ships" are sky creatures, like Bao: no masts or sails. They are authored in their freed colours; the game
greys them with a shader while they are crusted and hides `crust` once they are free.
"""
import math
import os
import random
import sys

import bpy
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cast import PREVIEWS  # noqa: E402
from kit_cast import (FWD, UP, Cast, Geo, Matrix, Pchip, Vector, args, camera, decal, ell_dir, ellipsoid,  # noqa: E402
                      facet_blob, frame, gem, glow, gloom_crystal, iso_split, label, lathe, lean_shard, loft, pal,
                      setup_render, smin,
                      sheet, shard,
                      smoothstep, sp, style, surface_curve, to_b, torus, tube, wing, fan)

FILE = 'gloom'
BUDGETS = dict(gloomling=1500, spitter=1500, brute=1500, flyer=1500, spire=1200, puffbun=1500, hopfrog=1500,
               rockgoat=1500, skylark=1500, cage=900, plank=300, shellback=1500, puffcap=1200,
               pebbleturtle=1500, mushpup=1500, gloom_raider=3000, gloom_beast=7000)
ORDER = ['gloomling', 'spitter', 'brute', 'flyer', 'spire', 'cage', 'puffbun', 'hopfrog', 'rockgoat', 'skylark',
         'plank', 'shellback', 'puffcap', 'pebbleturtle', 'mushpup', 'gloom_raider', 'gloom_beast']
LATE = ['plank', 'shellback', 'puffcap', 'pebbleturtle', 'mushpup', 'gloom_raider', 'gloom_beast']
SHEET_ROWS = [['puffbun', 'hopfrog', 'rockgoat', 'skylark', 'gloomling', 'spitter', 'flyer'], ['brute', 'spire', 'cage']]
GLOOM_EYE = '#B26BFF'


def M():
    return dict(crystal=gloom_crystal(), dark=pal('gloom_dark', 0.35), eye=glow('gloom', GLOOM_EYE, 1.1),
                night=pal('night', 0.2), white=pal('white', 0.25))


# ------------------------------------------------------------------ crystal helpers
def flat_base(g, y0=0.0):
    g.v = [Vector((v.x, max(v.y, y0), v.z)) for v in g.v]
    return g


def gloom_eye(c, fwd, r, m, squash=(1.0, 1.08, 0.62), up=UP, lean=False):
    """The one big Gloom eye: a glowing violet orb, a dark slit pupil and a white glint. Pivot = its centre.
    lean=True: fewer segments (later batches; the first ones keep their exact geometry)."""
    R = frame(fwd, up)
    sg = ((12, 8), (8, 5), (6, 4)) if lean else ((14, 9), (10, 6), (8, 4))
    g = Geo()
    g.add(ellipsoid(c, (r * squash[0], r * squash[1], r * squash[2]), sg[0][0], sg[0][1], R, m['eye']))
    dz = r * squash[2]
    g.add(ellipsoid(c + R @ Vector((0, -r * 0.02, dz * 0.8)), (r * 0.36, r * 0.7, dz * 0.3), sg[1][0], sg[1][1], R,
                    m['night']))
    g.add(ellipsoid(c + R @ Vector((r * 0.13, r * 0.3, dz * 1.02)), (r * 0.14, r * 0.17, r * 0.06), sg[2][0], sg[2][1], R,
                    m['white']))
    return g


def socket(c, fwd, r, m, seed=0, lean=False):
    """A ring of crystal teeth around the eye."""
    R = frame(fwd, UP)
    rng = random.Random(seed)
    g = Geo()
    n = 7 if lean else 9
    for k in range(n):
        a = math.tau * k / n
        base = c + R @ Vector((math.cos(a) * r * 1.08, math.sin(a) * r * 1.12, -r * 0.25))
        out = R @ Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.8))
        ln = r * rng.uniform(0.45, 0.7)
        g.add((lean_shard(base, out, ln, r * 0.24, 4, 0.55, m['crystal'], seed * 31 + k) if lean else
               shard(base, out, ln, r * 0.24, 4, 0.55, m['crystal'], seed * 31 + k)))
    return g


def spikes(g, m, specs, seed=0, lean=False):
    for i, (base, d, ln, r) in enumerate(specs):
        if lean:
            g.add(lean_shard(Vector(base), Vector(d), ln, r, 4, 0.45, m, seed * 17 + i))
        else:
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


# ------------------------------------------------------------------ boarding plank
def chain(top, length, m, seed, links=5, major=0.06, minor=0.02, smooth=False):
    """A dangling chain of crystal links ending in a little shard. (smooth=True: cheaper rounded links.)"""
    rng = random.Random(seed)
    g = Geo()
    p = Vector(top)
    for k in range(links):
        R = Matrix.Rotation(math.pi / 2, 3, 'X') @ Matrix.Rotation((k % 2) * math.pi / 2, 3, 'Y')
        if major == 0.06:   # the raid ship's links (kept exactly as first built)
            g.add(torus(p, 0.085, 0.028, 6, 3, Matrix.Rotation((k % 2) * math.pi / 2, 3, 'Y') @ Matrix.Rotation(math.pi / 2, 3, 'Z'),
                        m, smooth=False))
        else:
            g.add(torus(p, major, minor, 6, 3, Matrix.Rotation((k % 2) * math.pi / 2, 3, 'Y') @ Matrix.Rotation(math.pi / 2, 3, 'Z'),
                        m, smooth=smooth))
        p = p + Vector((rng.uniform(-0.01, 0.01), -length / links, rng.uniform(-0.01, 0.01)))
    if major == 0.06:
        g.add(shard(p + Vector((0, 0.04, 0)), Vector((0, -1, 0)), 0.3, 0.07, 4, 0.6, m, seed + 7))
    else:
        g.add(shard(p + Vector((0, major * 0.5, 0)), Vector((0, -1, 0)), major * 4, major, 4, 0.6, m, seed + 7))
    return g


def plank(cast, m):
    """A boarding plank: three weathered grey boards on two battens, crystal flecks, two hooks at the far end.
    Origin at the near end (on the Gloom ship), running along +Z, top at y = 0."""
    root = cast.root('plank')
    board_m, dark_m, iron_m = pal('stone_dark', 0.8), pal('gloom_dark', 0.7), pal('iron', 0.4)
    rng = random.Random(51)
    g = Geo()

    def box(x0, x1, y0, y1, z0, z1, mm):
        rings = [[Vector((x0, y0, z)), Vector((x1, y0, z)), Vector((x1, y1, z)), Vector((x0, y1, z))] for z in (z0, z1)]
        return loft(rings, mm, cap=True, smooth=False)
    for k, xc in enumerate((-0.27, 0.0, 0.27)):
        z0 = rng.uniform(0.0, 0.04)
        z1 = 3.2 - rng.uniform(0.0, 0.07)
        g.add(box(xc - 0.125, xc + 0.125, -0.07, 0.0, z0, z1, board_m if k != 1 else pal('gloom', 0.8)))
    for zc in (0.4, 2.75):
        g.add(box(-0.41, 0.41, -0.14, -0.07, zc - 0.08, zc + 0.08, dark_m))
        for xc in (-0.27, 0.0, 0.27):
            q = 0.022
            v = [g.vert((xc - q, 0.002, zc - q)), g.vert((xc + q, 0.002, zc - q)), g.vert((xc + q, 0.002, zc + q)),
                 g.vert((xc - q, 0.002, zc + q))]
            g.face(v, iron_m)
            g.f[-1] = tuple(v) if g.normal(tuple(v)).y > 0 else tuple(reversed(v))
    for k, (x, z, d) in enumerate(((0.39, 0.9, (1, 0.6, 0.2)), (-0.39, 1.7, (-1, 0.7, -0.2)), (0.13, 2.25, (0.2, 1, 0.3)),
                                   (-0.39, 2.9, (-1, 0.5, 0.3)), (0.39, 2.4, (1, 0.8, -0.1)))):
        g.add(shard(Vector((x, -0.03, z)), Vector(d), 0.13, 0.035, 4, 0.6, m['crystal'], 900 + k))
    for xc in (-0.27, 0.27):
        pts = [Vector((xc, -0.035, 3.0)), Vector((xc, 0.03, 3.2)), Vector((xc, -0.04, 3.36)), Vector((xc, -0.2, 3.36)),
               Vector((xc, -0.27, 3.26))]
        g.add(tube(pts, [0.03, 0.032, 0.03, 0.028, 0.02], 5, iron_m, round_caps=0.6))
    cast.part(root, 'body', g, (0, 0, 0))


# ------------------------------------------------------------------ chapter batch: shellback, puffcap, animals
def flat_up(g, verts, m):
    """Add one polygon facing up."""
    v = [g.vert(p) for p in verts]
    g.face(v, m)
    if g.normal(g.f[-1]).y < 0:
        g.f[-1] = tuple(reversed(g.f[-1]))
    return g


def shellback(cast, m):
    """A low crystal crawler holding a big faceted crystal shield in front (blows from the front glance off); its
    eye peeks over the shield's rim. A pebbleturtle sleeps inside."""
    root = cast.root('shellback')
    cr = m['crystal']
    sh = flat_base(facet_blob((0, 0.3, -0.2), (0.4, 0.27, 0.48), 2, 0.07, 120, cr), 0.03)
    for k, (x, z) in enumerate(((0.0, -0.2), (0.2, -0.05), (-0.2, -0.05), (0.18, -0.4), (-0.18, -0.4))):
        sh.add(lean_shard(Vector((x, 0.5, z)), Vector((x * 0.8, 1.0, -0.3)), 0.16, 0.12, 6, 0.3, cr, 121 + k))
    for sx_ in (1, -1):
        for sz in (1, -1):
            sh.add(lean_shard(Vector((sx_ * 0.28, 0.2, sz * 0.25 - 0.2)), Vector((sx_ * 0.4, -1, sz * 0.2)), 0.22, 0.08, 4,
                              0.4, cr, 130 + sx_ + 2 * sz))
    # the shield: a thick faceted octagonal lens standing in front, wider than tall
    sc = Vector((0, 0.36, 0.42))
    R = frame(FWD, UP) @ Matrix.Rotation(math.pi / 2, 3, 'X')
    shield = lathe([(0.0, -0.06), (0.42, -0.03), (0.47, 0.03), (0.41, 0.1), (0.0, 0.17)], 8, (0, 0, 0), 1.0, 1.0, R, cr,
                   smooth=False, phase=0.5)
    shield.scale((1.2, 0.85, 1.0)).move(sc)
    sh.add(shield)
    sh.add(lean_shard(sc + Vector((0, 0.0, 0.1)), FWD, 0.07, 0.1, 5, 0.6, cr, 139))   # the shield's boss
    for k in range(8):
        a = math.tau * (k + 0.5) / 8
        base = sc + Vector((math.cos(a) * 0.5, math.sin(a) * 0.4, 0.04))
        sh.add(lean_shard(base, Vector((math.cos(a) * 0.6, math.sin(a) * 0.6, 0.5)), 0.16, 0.05, 4, 0.6, cr, 140 + k))
    ec, ef = Vector((0, 0.78, 0.24)), Vector((0, 0.12, 1))
    sh.add(socket(ec, ef, 0.14, m, 12, lean=True))
    cast.part(root, 'shell', sh, (0, 0, 0))
    cast.part(root, 'eye', gloom_eye(ec, ef, 0.14, m, lean=True), ec)


def puffcap(cast, m):
    """A mushroom of Gloom crystal: a squat stalk with the eye, and a spotted crystal cap that swells before it
    bursts (the `cap` node's pivot is its base, so the code can scale it). A mushpup sleeps inside."""
    root = cast.root('puffcap')
    cr = m['crystal']
    st = lathe([(0.0, 0.0), (0.2, 0.0), (0.24, 0.08), (0.2, 0.25), (0.16, 0.42), (0.18, 0.5), (0.0, 0.52)], 7, (0, 0, 0),
               1.0, 1.0, None, cr, smooth=False, phase=0.2)
    for k in range(3):
        a = math.tau * k / 3 + 0.4
        st.add(facet_blob((math.cos(a) * 0.2, 0.05, math.sin(a) * 0.2), (0.09, 0.06, 0.09), 1, 0.05, 150 + k, cr))
    ec, ef = Vector((0, 0.3, 0.19)), Vector((0, 0.05, 1))
    # (the cap frames the eye, so no socket teeth)
    cast.part(root, 'shell', st, (0, 0, 0))
    cast.part(root, 'eye', gloom_eye(ec, ef, 0.12, m, lean=True), ec)
    base = Vector((0, 0.5, 0))
    cap = lathe([(0.0, 0.0), (0.44, 0.0), (0.47, 0.05), (0.42, 0.17), (0.3, 0.29), (0.14, 0.36), (0.0, 0.38)], 10,
                (0, 0, 0), 1.0, 1.0, None, cr, smooth=False).move(base)
    cap.add(lathe([(0.0, -0.03), (0.43, -0.03), (0.42, 0.0), (0.0, 0.01)], 10, (0, 0, 0), 1.0, 1.0, None, m['dark'],
                  smooth=False).move(base))
    for k, (a, rr, y) in enumerate(((0.3, 0.38, 0.15), (1.5, 0.37, 0.16), (2.6, 0.39, 0.14), (3.8, 0.36, 0.17),
                                    (5.0, 0.38, 0.15), (0.9, 0.2, 0.31), (3.2, 0.2, 0.31))):
        p = base + Vector((math.cos(a) * rr, y, math.sin(a) * rr))
        d = (p - (base + Vector((0, -0.1, 0)))).normalized()
        cap.add(gem(p, 0.06, 0.08, 5, m['eye'], frame(d) @ Matrix.Rotation(math.pi / 2, 3, 'X')))
    cap.add(lean_shard(base + Vector((0.05, 0.34, 0.0)), Vector((0.2, 1, 0.1)), 0.18, 0.05, 4, 0.5, cr, 160))
    cast.part(root, 'cap', cap, base)


def pebbleturtle(cast, m):
    """The shellback's animal: a round little turtle with a tangerine shell and sunny plates."""
    root = cast.root('pebbleturtle')
    skin, shellc, plate_m, rim = pal('honey', 0.6), pal('tangerine', 0.5), pal('sun', 0.5), pal('wood', 0.5)
    c, r = Vector((0, 0.17, -0.03)), (0.25, 0.17, 0.29)
    g = ellipsoid(c, r, 14, 8, None, shellc)
    g.v = [Vector((v.x, max(v.y, 0.1), v.z)) for v in g.v]
    for k, (dx, dz, s) in enumerate(((0, 0, 0.085), (0.6, 0.5, 0.06), (-0.6, 0.5, 0.06), (0.6, -0.5, 0.06), (-0.6, -0.5, 0.06))):
        g.add(decal(c, r, Vector((dx, 1.0, dz)), s, s, plate_m, 6, 1, 0.004, 0.006, spin=0.3))
    g.add(torus(Vector((0, 0.1, -0.03)), 0.25, 0.03, 16, 4, None, rim).scale((1.0, 1.0, 1.15), about=(0, 0.1, -0.03)))
    g.add(ellipsoid((0, 0.08, -0.03), (0.22, 0.05, 0.26), 12, 5, None, plate_m))
    hc, hr = Vector((0, 0.2, 0.33)), (0.12, 0.11, 0.12)
    g.add(ellipsoid(hc, hr, 12, 8, None, skin))
    face(g, hc, hr, 0.42, 0.18, 0.026, 0.034, -0.28, m=m)
    for sx_ in (1, -1):
        for sz in (1, -1):
            g.add(ellipsoid((sx_ * 0.2, 0.05, sz * 0.17 - 0.03), (0.07, 0.05, 0.08), 8, 5, None, skin))
    g.add(ellipsoid((0, 0.1, -0.33), (0.035, 0.03, 0.06), 6, 4, Matrix.Rotation(0.4, 3, 'X'), skin))
    cast.part(root, 'body', g, (0, 0, 0))


def mushpup(cast, m):
    """The puffcap's animal: a caramel puppy wearing a red mushroom cap with white spots."""
    root = cast.root('mushpup')
    fur, ear, white, red = pal('wood_light', 0.6), pal('wood', 0.6), pal('white', 0.5), pal('red', 0.5)
    g = ellipsoid((0, 0.21, -0.06), (0.15, 0.14, 0.2), 10, 7, None, fur)
    g.add(decal((0, 0.21, -0.06), (0.15, 0.14, 0.2), Vector((0, -0.4, 1)), 0.07, 0.07, white, 10, 1, 0.003, 0.004))
    hc, hr = Vector((0, 0.38, 0.13)), (0.15, 0.14, 0.14)
    g.add(ellipsoid(hc, hr, 12, 8, None, fur))
    g.add(ellipsoid(hc + Vector((0, -0.04, 0.11)), (0.075, 0.055, 0.055), 8, 5, None, white))
    g.add(ellipsoid(hc + Vector((0, -0.02, 0.165)), (0.025, 0.018, 0.015), 6, 4, None, m['night']))
    g.add(ellipsoid(hc + Vector((0.0, -0.085, 0.14)), (0.02, 0.012, 0.015), 6, 3, None, pal('rose', 0.5)))
    face(g, hc, hr, 0.4, 0.15, 0.03, 0.038, -0.6, cheeks=True, m=m)
    for s in (1, -1):
        g.add(ellipsoid(hc + Vector((s * 0.15, -0.04, -0.02)), (0.045, 0.1, 0.035), 8, 5,
                        Matrix.Rotation(s * 0.35, 3, 'Z'), ear))
    cc = hc + Vector((0, 0.12, -0.01))
    cap = lathe([(0.0, -0.01), (0.18, -0.01), (0.19, 0.02), (0.15, 0.07), (0.08, 0.11), (0.0, 0.12)], 12, (0, 0, 0), 1.0,
                1.0, Matrix.Rotation(-0.25, 3, 'Z'), red).move(cc)
    for k, (dx, dz) in enumerate(((0.0, 0.0), (0.12, 0.05), (-0.1, 0.08), (0.05, -0.12), (-0.12, -0.06))):
        p = cc + Matrix.Rotation(-0.25, 3, 'Z') @ Vector((dx, 0.1 - 0.25 * (dx * dx + dz * dz) ** 0.5 * 2.2, dz))
        cap.add(ellipsoid(p, (0.025, 0.012, 0.025), 6, 3, Matrix.Rotation(-0.25, 3, 'Z'), white))
    g.add(cap)
    for sx_ in (1, -1):
        for sz in (1, -1):
            p = Vector((sx_ * 0.08, 0.0, sz * 0.12 - 0.05))
            g.add(tube([p + Vector((0, 0.15, 0)), p + Vector((0, 0.04, 0))], 0.04, 6, fur, round_caps=0.3))
            g.add(ellipsoid(p + Vector((0, 0.03, 0.015)), (0.045, 0.03, 0.05), 6, 4, None, white))
    g.add(tube([Vector((0, 0.26, -0.24)), Vector((0, 0.36, -0.3)), Vector((0.03, 0.42, -0.27))], [0.03, 0.025, 0.012], 5,
               fur))
    cast.part(root, 'body', g, (0, 0, 0))


# ------------------------------------------------------------------ sky creatures with decks (the Gloom's "ships")
def keep_ship_materials(cast, m):
    """The first raid ship (since replaced by gloom_raider) defined these materials before the plank. Defining them
    the same way here keeps the plank and everything after it exactly as exported before."""
    pal('iron', 0.7)
    pal('gloom', 0.75)
    pal('stone_dark', 0.75)


def freed():
    return dict(skin=pal('coral', 0.5), rose=pal('rose', 0.5), teal=pal('teal', 0.45), belly=pal('whale_belly', 0.5),
                white=pal('white', 0.25), night=pal('night', 0.2), wood_light=pal('wood_light', 0.6), wood=pal('wood', 0.6),
                wood_dark=pal('wood_dark', 0.6), rope=pal('straw', 0.7), iron=pal('iron', 0.45))


def gentle_eye(c, d, r, F, lid, segs=(12, 8, 10, 6, 6, 4, 10, 5)):
    """A big, gentle eye: white, a large dark pupil, two glints and a soft upper lid. Pivot = its centre."""
    R = frame(d, UP)
    g = Geo()
    g.add(ellipsoid(c, (r * 0.92, r, r * 0.55), segs[0], segs[1], R, F['white']))
    pc = c + R @ Vector((0, -r * 0.1, r * 0.34))
    g.add(ellipsoid(pc, (r * 0.6, r * 0.66, r * 0.24), segs[2], segs[3], R, F['night']))
    for u, v, rr in ((0.24, 0.24, 0.2), (-0.2, -0.26, 0.1)):
        g.add(ellipsoid(pc + R @ Vector((u * r, v * r, r * 0.21)), (rr * r, rr * r, rr * r * 0.5), segs[4], segs[5], R,
                        F['white']))
    g.add(ellipsoid(c + R @ Vector((0, r * 0.66, r * 0.06)), (r * 1.02, r * 0.46, r * 0.62), segs[6], segs[7], R, lid))
    return g


def deck_planks(g, half_w, zmin, zmax, count, F, rng, y=0.0):
    """Lengthwise planks at y, inside |x| < half_w(z), with two staggered joints each and a dark base under the seams."""
    w = 2 * half_w(0.0) / count
    for i in range(count):
        xa, xb = -half_w(0.0) + i * w + 0.025, -half_w(0.0) + (i + 1) * w - 0.025
        xo = max(abs(xa), abs(xb))
        zin = [z / 20.0 for z in range(int(zmin * 20), int(zmax * 20) + 1) if half_w(z / 20.0) - 0.03 > xo]
        if not zin:
            continue
        z0, z1 = zin[0], zin[-1]
        off = (i * 0.618) % 1.0
        edges = [z0, z0 + (z1 - z0) * (0.22 + 0.25 * off), z0 + (z1 - z0) * (0.6 + 0.2 * off), z1]
        if z1 - z0 < 3.0:
            edges = [z0, z1]
        for k in range(len(edges) - 1):
            za = edges[k] + (0.03 if k else 0.0)
            zb = edges[k + 1] - (0.03 if k + 1 < len(edges) - 1 else 0.0)
            mm = F['wood'] if rng.random() < 0.34 else F['wood_light']
            flat_up(g, [(xa, y, za), (xa, y, zb), (xb, y, zb), (xb, y, za)], mm)
    outline = []
    for k in range(48):
        a = math.tau * k / 48
        z = math.sin(a) * zmax
        outline.append(Vector((math.cos(a) * max(0.05, half_w(z)) * 0.995, y - 0.015, z)))
    flat_up(g, outline, F['wood_dark'])


def hatch(g, centre, half, F):
    """A hold hatch, flush with the deck (a few millimetres proud so it never flickers)."""
    hx, hz = half, centre.z
    for (x0, x1, z0, z1) in ((-hx, hx, hz - hx, hz - hx + 0.12), (-hx, hx, hz + hx - 0.12, hz + hx),
                             (-hx, -hx + 0.12, hz - hx, hz + hx), (hx - 0.12, hx, hz - hx, hz + hx)):
        flat_up(g, [(x0, 0.006, z0), (x0, 0.006, z1), (x1, 0.006, z1), (x1, 0.006, z0)], F['iron'])
    for k in range(4):
        x0 = -hx + 0.12 + k * (2 * hx - 0.24) / 4
        x1 = x0 + (2 * hx - 0.24) / 4 - 0.03
        flat_up(g, [(x0, 0.004, hz - hx + 0.12), (x0, 0.004, hz + hx - 0.12), (x1, 0.004, hz + hx - 0.12),
                    (x1, 0.004, hz - hx + 0.12)], F['wood_dark'])
    outer = [Vector((0.14 * math.cos(a), 0.008, hz + 0.14 * math.sin(a))) for a in (math.tau * k / 10 for k in range(10))]
    inner = [Vector((0.09 * math.cos(a), 0.008, hz + 0.09 * math.sin(a))) for a in (math.tau * k / 10 for k in range(10))]
    for k in range(10):
        j = (k + 1) % 10
        flat_up(g, [outer[k], outer[j], inner[j], inner[k]], F['iron'])


BEAST = Pchip([  # z, half-width, waist height, top and bottom half-heights (before the deck flattens the back)
    (-12.6, 0.9, -1.3, 0.6, 0.6), (-11.5, 1.3, -1.4, 0.9, 0.95), (-10.0, 2.6, -1.6, 2.0, 1.8),
    (-8.0, 4.2, -1.8, 3.0, 2.4), (-4.0, 5.4, -1.9, 3.4, 2.7), (0.0, 5.7, -1.9, 3.5, 2.8), (4.0, 5.6, -1.9, 3.5, 2.7),
    (8.0, 5.1, -1.9, 3.4, 2.5), (10.5, 4.7, -1.85, 3.2, 2.4), (14.0, 4.4, -1.7, 3.0, 2.2),
])
B_ZT, B_ZC, B_ZN, B_E, B_N = -11.5, 10.0, 13.2, 2 / 2.6, 28
B_GAPS = (-6.0, 0.0, 6.0)
B_POSTS = [(-9.0, -7.0), (-5.0, -3.0, -1.0), (1.0, 3.0, 5.0), (7.0, 9.0)]


def b_section(z):
    A, Yw, Ht, Hb = BEAST(z)
    if z > B_ZC:
        u = min(1.0, (z - B_ZC) / (B_ZN - B_ZC))
        f = max(0.0, 1 - u ** 3.0) ** (1 / 3.0)
        A, Ht, Hb = A * f, Ht * f, Hb * f
    return A, Yw, Ht, Hb


def b_clamp(x, z):
    q = (abs(x) / 4.5) ** 4 + (abs(z) / 9.8) ** 4
    y = -0.06
    if q > 1:
        y -= 1.5 * (q - 1) ** 1.2
    return y + 6.0 * smoothstep(-9.9, -11.3, z)


def BP(z, th):
    A, Yw, Ht, Hb = b_section(z)
    s, c = math.sin(th), math.cos(th)
    x = A * sp(s, B_E)
    y = Yw + (Ht if c > 0 else Hb) * sp(c, B_E)
    return Vector((x, smin(y, b_clamp(x, z), 0.9), z))


def BN(z, th, eps=1e-3):
    n = (BP(z, th + eps) - BP(z, th - eps)).cross(BP(z + eps, th) - BP(z - eps, th))
    if n.length < 1e-9:
        return Vector((0, 0, 1))
    n.normalize()
    if n.dot(BP(z, th) - Vector((0, b_section(z)[1], z))) < 0:
        n = -n
    return n


def deck_w(z):
    """Half-width of the beast's deck: 8 m wide, rounding off toward bow and stern (about 18.4 m long)."""
    a = abs(z)
    return 4.0 if a <= 7.0 else 4.0 * math.sqrt(max(0.0, 1 - ((a - 7.0) / 2.2) ** 2))


def beast_body(F):
    zs = [B_ZT + (B_ZC - B_ZT) * i / 20 for i in range(21)]
    zs += [B_ZC + (B_ZN - B_ZC) * math.sin((math.pi / 2) * k / 10) for k in range(1, 10)]
    base = [BP(B_ZT, math.tau * j / B_N) for j in range(B_N)]
    cy = sum(p.y for p in base) / len(base)
    cen = Vector((0, cy, B_ZT))
    back = []
    for k in range(1, 4):
        a = (math.pi / 2) * k / 4
        back.append([cen + (p - cen) * math.cos(a) + Vector((0, 0, -1.0 * math.sin(a))) for p in base])
    rows = list(reversed(back)) + [[BP(z, math.tau * j / B_N) for j in range(B_N)] for z in zs]
    g = loft(rows, F['skin'], start=cen + Vector((0, 0, -1.0)), end=Vector((0, b_section(B_ZN)[1], B_ZN)))
    iso_split(g, lambda p: p.y - (BEAST(p.z)[1] - 0.5 * BEAST(p.z)[3]), F['belly'], F['skin'])
    return g


def beast_patch(zc, thc, rz, rth, mat_, segs=10):
    g = Geo()
    c = g.vert(BP(zc, thc) + BN(zc, thc) * 0.06)
    ring_ = []
    for j in range(segs):
        a = math.tau * j / segs
        z, th = zc + rz * math.cos(a), thc + rth * math.sin(a)
        ring_.append(g.vert(BP(z, th) + BN(z, th) * -0.02))
    fan(g, c, ring_, mat_)
    return g.toward(lambda p: p - Vector((0, b_section(p.z)[1], p.z)))


def gloom_beast(cast, m):
    """The boarding ship: a big manta-whale the Gloom has crusted over, with a flat planked deck on its back."""
    root = cast.root('gloom_beast')
    F = freed()
    rng = random.Random(71)
    body = beast_body(F)
    for side in (1, -1):   # teal spots on the flanks
        for z, deg, rr in ((-7.0, 98, 0.7), (-3.5, 104, 0.9), (0.5, 100, 0.8), (4.5, 105, 0.85), (8.0, 100, 0.6),
                           (-5.5, 118, 0.5), (2.5, 120, 0.55)):
            A = b_section(z)[0]
            body.add(beast_patch(z, side * math.radians(deg), rr, rr / A * 1.1, F['teal']))
    smile = []
    for k in range(13):
        a = k / 6 - 1
        z, th = 12.75 - 1.1 * a * a, math.pi + a * math.radians(58)
        smile.append(BP(z, th) + BN(z, th) * 0.05)
    body.add(tube(smile, [0.07 + 0.08 * math.sin(math.pi * k / 12) for k in range(13)], 6, F['night']))
    for s in (1, -1):   # cephalic lobes: the manta's curled head fins beside the mouth
        z, th = 11.9, s * math.radians(118)
        loc, n = BP(z, th), BN(z, th)
        pts = [loc - n * 0.3, loc + Vector((s * 0.25, 0.1, 0.6)), loc + Vector((s * 0.35, 0.55, 1.05)),
               loc + Vector((s * 0.15, 0.95, 1.0)), loc + Vector((0.0, 1.0, 0.7))]
        body.add(tube(pts, [0.5, 0.45, 0.35, 0.22, 0.1], 7, F['rose']))
    # the deck: lengthwise planks, a flush hatch, rope-and-post rails with three gaps a side
    body_deck = Geo()
    deck_planks(body_deck, deck_w, -9.2, 9.2, 16, F, rng)
    hatch(body_deck, Vector((0, 0, 4.5)), 0.8, F)
    for side in (1, -1):
        for span in B_POSTS:
            tops = []
            for z in span:
                x = side * (deck_w(z) - 0.15)
                ring0 = [Vector((x + 0.09 * math.cos(math.tau * k / 4 + 0.785), y, z + 0.09 * math.sin(math.tau * k / 4 + 0.785)))
                         for y, k in ((-0.02, k) for k in range(4))]
                ring1 = [Vector((p.x, 0.62, p.z)) for p in ring0]
                body_deck.add(loft([ring0, ring1], F['wood_dark'], end=Vector((x, 0.68, z)), smooth=False))
                tops.append(Vector((x, 0.55, z)))
            for a, b in zip(tops, tops[1:]):
                mid = (a + b) / 2 - Vector((0, 0.09, 0))
                body_deck.add(tube([a, (a + mid) / 2 - Vector((0, 0.03, 0)), mid, (mid + b) / 2 - Vector((0, 0.03, 0)), b],
                                   0.035, 4, F['rope'], round_caps=0.5))
    body.add(body_deck)
    cast.part(root, 'body', body, (0, 0, 0))
    # eyes: big and gentle, with soft rose lids
    for side, name in ((1, 'eye_l'), (-1, 'eye_r')):
        z, th = 10.9, side * math.radians(76)
        n = BN(z, th)
        d = (n * 0.6 + FWD * 0.6 + UP * 0.08).normalized()
        c = BP(z, th) - d * 0.32
        cast.part(root, name, gentle_eye(c, d, 0.9, F, F['rose'], segs=(10, 6, 8, 4, 5, 3, 8, 3)), c)
    # broad wing-fins (pivots at the roots; the code flaps them about Z)
    for side, name in ((1, 'fin_l'), (-1, 'fin_r')):
        rootp = BP(1.0, side * math.radians(96))
        n = BN(1.0, side * math.radians(96))
        out = Vector((side * 1.0, -0.08, -0.12)).normalized()
        chord = (FWD - out * FWD.dot(out)).normalized()
        thick = out.cross(chord)
        if thick.y < 0:
            thick = -thick
        span = Pchip([(-0.06, 9.4, 1.2, 0.0, 0.0), (0.0, 9.6, 1.2, 0.0, 0.0), (0.25, 8.6, 0.95, 0.8, -0.15),
                      (0.5, 7.0, 0.7, 2.0, -0.35), (0.72, 5.0, 0.5, 3.2, -0.3), (0.88, 3.0, 0.32, 4.0, 0.1),
                      (0.97, 1.4, 0.18, 4.4, 0.55), (1.0, 0.5, 0.1, 4.5, 0.75)])
        st = []
        for s_ in (-0.06, 0.0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.72, 0.8, 0.88, 0.94, 0.97, 1.0):
            c_, t_, sw, up_ = span(s_)
            st.append((rootp - n * 0.5 + out * (s_ * 10.5) - chord * sw + thick * up_, chord, thick, c_, t_))
        fin = wing(st, 14, F['teal'])
        for i, f in enumerate(fin.f):
            if fin.normal(f).dot(thick) < -0.3:
                fin.m[i] = F['belly']
        cast.part(root, name, fin, rootp - n * 0.2)
    # a long tail that curls up at the end (pivot at the root)
    yt = b_section(B_ZT)[1]
    piv = Vector((0, yt, B_ZT))
    tpts = [Vector((0, yt, -10.9)), Vector((0, yt - 0.05, -12.5)), Vector((0, yt + 0.1, -14.5)), Vector((0.4, yt + 0.7, -16.6)),
            Vector((1.4, yt + 1.9, -18.0)), Vector((2.4, yt + 3.0, -18.0)), Vector((2.7, yt + 3.6, -16.9)),
            Vector((2.2, yt + 3.6, -16.1))]
    tail = tube(tpts, [0.95, 0.85, 0.62, 0.44, 0.32, 0.23, 0.15, 0.08], 8, F['skin'])
    for i in range(len(tail.f)):
        if (i // 8) % 2 == 1 and i < 8 * (len(tpts) - 1):
            tail.m[i] = F['teal']
    cast.part(root, 'tail', tail, piv)
    # every Gloom crystal on the beast, in one node the code can hide
    cr = m['crystal']
    crust = Geo()
    specs = []
    for side in (1, -1):
        for z, ln in ((-8.0, 1.0), (-3.5, 1.2), (2.0, 1.1), (6.5, 1.0)):
            base = Vector((side * 5.0, -0.45, z))
            specs.append((base, (side * 1.0, 0.8, 0.1), ln, 0.24))
        for z in (-6.0, -1.0, 4.0, 8.2):
            specs.append((BP(z, side * math.radians(108)), (side * 1.0, -0.15, 0.1), 1.3, 0.26))
        for z in (-8.9, 8.9):   # on the deck's rounded ends, outside the rails
            specs.append((Vector((side * (deck_w(z) + 0.05), -0.02, z)), (side * 0.6, 0.6, math.copysign(0.6, z)), 0.45, 0.12))
        specs.append((Vector((side * 2.6, -0.4, 11.4)), (side * 0.4, 1.0, 0.4), 0.9, 0.2))
        for z, deg, ln in ((-4.8, 92, 1.4), (-0.4, 90, 1.5), (3.2, 91, 1.3), (9.6, 96, 0.9)):
            specs.append((BP(z, side * math.radians(deg)), (side * 1.0, 0.45, 0.15), ln, 0.3))

        specs.append((Vector((side * 0.8, -0.9, -10.6)), (side * 0.6, 1.0, -0.4), 0.8, 0.18))
    for z in (-7.0, -3.0, 1.0, 5.0, 8.5):
        specs.append((Vector((0.25 * math.sin(z), -BEAST(z)[1] * 0 - (1.9 + BEAST(z)[3]) + 0.25, z)), (0.1 * math.sin(z), -1.0, 0.1),
                      1.6 + 0.4 * math.cos(z), 0.32))
    for k, (base, d, ln, r) in enumerate(specs):
        crust.add(lean_shard(Vector(base), Vector(d), ln, r, 4, 0.45, cr, 1300 + k))
    for k, (x, z) in enumerate(((5.1, -6.0), (-5.1, 0.6), (5.0, 4.0), (-4.9, -4.5))):
        crust.add(facet_blob((x, -0.7, z), (0.55, 0.35, 0.6), 1, 0.15, 1400 + k, cr))
    cast.part(root, 'crust', crust, (0, 0, 0))


def gloom_raider(cast, m):
    """A small raid boat: a round sky-pufferfish with a plank platform on its back where raiders stand."""
    root = cast.root('gloom_raider')
    F = freed()
    rng = random.Random(73)
    c, r = Vector((0, -1.55, 0)), (2.7, 2.2, 3.05)
    body = ellipsoid(c, r, 20, 12, None, F['skin'])
    for i, v in enumerate(body.v):
        q = (abs(v.x) / 2.2) ** 4 + (abs(v.z) / 2.62) ** 4
        top = -0.05 - 1.3 * max(0.0, q - 1) ** 1.2
        body.v[i] = Vector((v.x, smin(v.y, top, 0.6), v.z))
    iso_split(body, lambda p: p.y + 2.6, F['belly'], F['skin'])
    for k, (dx, dy, dz, rr) in enumerate(((0.8, -0.25, 0.3, 0.42), (-0.8, -0.3, 0.2, 0.42), (0.85, -0.2, -0.45, 0.36),
                                          (-0.85, -0.25, -0.5, 0.36), (0.3, -0.35, -0.9, 0.3), (-0.35, -0.3, -0.88, 0.3))):
        body.add(decal(c, r, Vector((dx, dy, dz)), rr, rr * 0.8, F['teal'], 10, 1, 0.01, 0.01))
    for k in range(9):   # soft puffer spines
        az = math.tau * k / 9 + 0.2
        el = -0.15 - 0.3 * (k % 2)
        p, n = ell_dir(c, r, Vector((math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el))))
        body.add(lean_shard(p - n * 0.05, n, 0.32, 0.08, 4, 0.7, F['rose'], 1500 + k))
    p, n = ell_dir(c, r, Vector((0, -0.25, 1)))
    body.add(torus(p + n * 0.02, 0.2, 0.07, 10, 5, frame(n) @ Matrix.Rotation(math.pi / 2, 3, 'X'), F['rose']))
    body.add(ellipsoid(p - n * 0.02, (0.16, 0.16, 0.05), 8, 3, frame(n), F['night']))
    deck = Geo()

    def plat_w(z):
        return 2.0 * math.sqrt(max(0.0, 1 - (z / 2.45) ** 2))
    deck_planks(deck, plat_w, -2.45, 2.45, 8, F, rng)
    for zs_ in ((0.95, 2.35), (-2.35, -0.95)):   # a low curb front and back; the sides stay open for boarding
        for side in (1, -1):
            arc = [Vector((side * (plat_w(a) - 0.06), 0.06, a)) for a in [zs_[0] + (zs_[1] - zs_[0]) * k / 5 for k in range(6)]]
            deck.add(tube(arc, 0.07, 5, F['wood_dark'], round_caps=0.5))
    body.add(deck)
    cast.part(root, 'body', body, (0, 0, 0))
    # both eyes in one node (pivot between them, so one Y squash blinks both)
    eyes = Geo()
    centres = []
    for side in (1, -1):
        p, n = ell_dir(c, r, Vector((side * 0.52, 0.28, 0.82)))
        d = (n * 0.7 + FWD * 0.4).normalized()
        ec = p - d * 0.12
        centres.append(ec)
        eyes.add(gentle_eye(ec, d, 0.46, F, F['rose'], segs=(8, 6, 6, 4, 4, 3, 6, 3)))
    cast.part(root, 'eye', eyes, (centres[0] + centres[1]) / 2)
    for side, name in ((1, 'fin_l'), (-1, 'fin_r')):
        p, n = ell_dir(c, r, Vector((side * 1.0, -0.3, 0.25)))
        out = Vector((side * 1.0, -0.25, -0.35)).normalized()
        chord = (FWD - out * FWD.dot(out)).normalized()
        thick = out.cross(chord)
        if thick.y < 0:
            thick = -thick
        st = [(p - n * 0.2 + out * (s_ * 1.7) - chord * (0.4 * s_), chord, thick, cw, tw)
              for s_, cw, tw in ((-0.1, 1.2, 0.3), (0.0, 1.3, 0.28), (0.3, 1.5, 0.2), (0.6, 1.25, 0.14), (0.85, 0.7, 0.1),
                                 (1.0, 0.2, 0.06))]
        fin = wing(st, 10, F['teal'])
        for i, f in enumerate(fin.f):
            if fin.normal(f).dot(thick) < -0.3:
                fin.m[i] = F['belly']
        cast.part(root, name, fin, p - n * 0.1)
    p, n = ell_dir(c, r, Vector((0, -0.05, -1)))
    tail = tube([p + Vector((0, 0, 0.35)), p + Vector((0, 0.05, -0.45))], [0.55, 0.4], 8, F['skin'], round_caps=0.3)
    st = []
    for s_ in (-1.0, -0.8, -0.5, -0.2, 0.0, 0.2, 0.5, 0.8, 1.0):
        cw = 0.6 + 0.5 * abs(s_) ** 1.5 - (0.25 if abs(s_) < 0.3 else 0.0)
        st.append((p + Vector((0, s_ * 1.15, -0.55 - cw * 0.5)), FWD, Vector((1, 0, 0)), max(0.15, cw if abs(s_) < 0.999 else 0.2),
                   0.16 * (1 - 0.6 * abs(s_))))
    tail.add(wing(st, 10, F['teal']))
    cast.part(root, 'tail', tail, p)
    cr = m['crystal']
    crust = Geo()
    for k in range(18):
        az = rng.uniform(0, math.tau)
        el = rng.uniform(-0.55, 0.15)
        d = Vector((math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)))
        if d.z > 0.75 and abs(d.x) < 0.7:     # keep the face clear
            continue
        pp, nn = ell_dir(c, r, d)
        crust.add(lean_shard(pp - nn * 0.1, nn + Vector((0, 0.4, 0)), rng.uniform(0.5, 0.95), rng.uniform(0.12, 0.2), 4, 0.45,
                             cr, 1600 + k))
    for k, z in enumerate((-2.0, 0.0, 2.0)):
        crust.add(lean_shard(Vector((0, -3.6, z)), Vector((0.1 * z, -1, 0)), 0.9, 0.2, 4, 0.5, cr, 1650 + k))
    for k, (x, z) in enumerate(((2.3, -1.6), (-2.35, 1.4))):
        crust.add(facet_blob((x, -0.55, z), (0.42, 0.3, 0.45), 1, 0.15, 1660 + k, cr))
    cast.part(root, 'crust', crust, (0, 0, 0))


def batch_preview(cast):
    """The newer Gloom forms and animals side by side; the raider with a boarding plank; the deck beast."""
    objs = {r.name: r for r in cast.roots}
    keep = {n: (o.location.copy(), o.rotation_euler.copy()) for n, o in objs.items()}
    small = ['shellback', 'pebbleturtle', 'puffcap', 'mushpup']
    sheet(cast, 'gloom-batch.png', rows=[small], gap=0.5, size=(1800, 800), elev=35, yaw=15, ortho=5.8,
          hide=[n for n in objs if n not in small])

    def solo(names, path, size, target, ortho, ground_y, labels):
        for n, o in objs.items():
            for c in cast.tree(o):
                c.hide_render = n not in names
        setup_render(size, '#7DD957')
        ground = bpy.data.objects.get('Preview ground')
        if ground is not None:
            ground.location.z = ground_y
            ground.scale = (2, 2, 1)
        cam = camera(to_b(target), ortho, 45, 35)
        bpy.context.view_layer.update()
        for text, at, sz in labels:
            label(cam, text, to_b(at), sz)
        out = os.path.join(PREVIEWS, path)
        style.render(out)
        print('preview', out)
    objs['plank'].location = to_b((2.0, 0.0, 0.0))
    objs['plank'].rotation_mode = 'XYZ'
    objs['plank'].rotation_euler = (0, 0, math.pi / 2)    # glTF +Z -> +X: the plank reaches out to the side
    for n, o in objs.items():
        if n != 'plank':
            o.location, o.rotation_euler = keep[n]
    solo({'gloom_raider', 'plank'}, 'gloom-raider.png', (1600, 1100), (1.6, -1.3, -0.6), 12.5, -4.2,
         [('gloom_raider', (-1.0, -4.3, 3.6), 0.32), ('plank', (4.2, -0.9, 1.4), 0.32)])
    objs['plank'].location, objs['plank'].rotation_euler = keep['plank']
    solo({'gloom_beast'}, 'gloom-beast.png', (1600, 1200), (0.0, -1.0, -2.0), 38.0, -6.5,
         [('gloom_beast', (-9.0, -6.0, 9.0), 1.0)])
    for n, o in objs.items():
        o.location, o.rotation_euler = keep[n]


# ------------------------------------------------------------------ assemble
def build():
    style.reset_scene()
    cast = Cast(FILE)
    m = M()
    for fn in (gloomling, spitter, brute, flyer, spire, cage, puffbun, hopfrog, rockgoat, skylark, keep_ship_materials,
               plank, shellback, puffcap, pebbleturtle, mushpup, gloom_raider, gloom_beast):
        fn(cast, m)
    return cast


def main():
    cast = build()
    cast.export(BUDGETS)
    if '--render' in args():
        big = LATE    # later batches have their own sheets (gloom-batch.png, gloom-raider.png, gloom-beast.png)
        sheet(cast, 'gloom.png', rows=SHEET_ROWS, gap=0.6, row_gap=2.4, size=(2000, 1300), elev=45, yaw=0, ortho=11.0,
              hide=big)
        sheet(cast, 'gloom-front.png', rows=SHEET_ROWS, gap=0.6, row_gap=2.4, size=(2000, 1100), elev=12, yaw=0,
              ortho=10.0, hide=big)
        batch_preview(cast)


if __name__ == '__main__':
    main()
