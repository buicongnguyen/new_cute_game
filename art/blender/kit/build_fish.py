"""Cloudback sky fish: puff_minnow, sun_carp, star_ray, cloud_koi (0.3-0.8 m, <= 500 triangles each).

Each root is the body mesh (eyes and fixed fins included), with its origin at the body centre and the
head toward glTF +Z. A child mesh `tail` has its pivot at the tail root, so the game can wag it about
its local Y axis (suggested +-0.5 rad; accumulate the phase, see lightweight-game-objects).

Run from the repository root:
    blender -b --factory-startup --python art/blender/kit/build_fish.py -- [--render]
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit_world as K  # noqa: E402
from kit_world import RAD, TAU, Geo, Piece, Vector, attach, disc, facing, lathe, slab, star_outline, tube, xf  # noqa: E402
import style  # noqa: E402

FILE = 'fish.glb'
IDS = ['puff_minnow', 'sun_carp', 'star_ray', 'cloud_koi']
BUDGET = 500
SCALE = {'star_ray': 0.95, 'cloud_koi': 0.95}


def mats():
    m = {n: K.M(n, 0.45) for n in ('sky', 'sky_light', 'white', 'night', 'tangerine', 'sun', 'gold', 'violet', 'lilac',
                                     'honey', 'red', 'rose', 'cream', 'cheek')}
    return m


# ================================================================== helpers
def smooth_step(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def interp(keys, s):
    """Piecewise-smooth interpolation through [(s, value), ...]."""
    for (s0, v0), (s1, v1) in zip(keys, keys[1:]):
        if s <= s1:
            t = smooth_step(s0, s1, s) if s1 > s0 else 1.0
            return v0 + (v1 - v0) * t
    return keys[-1][1]


class Body:
    """A fish body lofted from the nose (s = 0, toward -Y) to the tail root (s = 1)."""

    def __init__(self, length, w, ht, hb, zc=None, y_nose=None):
        self.L = length
        self.y0 = -length / 2 if y_nose is None else y_nose
        self.w, self.ht, self.hb = w, ht, hb
        self.zc = zc or [(0, 0.0), (1, 0.0)]

    def y(self, s):
        return self.y0 + self.L * s

    def point(self, s, th):
        w, ht, hb, zc = interp(self.w, s), interp(self.ht, s), interp(self.hb, s), interp(self.zc, s)
        sn = math.sin(th)
        return Vector((w * math.cos(th), self.y(s), zc + (ht if sn >= 0 else hb) * sn))

    def normal(self, s, th):
        e = 1e-3
        p = self.point(s, th)
        a = self.point(min(1, s + e), th) - self.point(max(0, s - e), th)
        b = self.point(s, th + e) - self.point(s, th - e)
        n = b.cross(a).normalized()
        c = Vector((0, self.y(s), interp(self.zc, s)))
        return n if n.dot(p - c) > 0 else -n

    def loft(self, ss, segs):
        verts, rings = [], []
        for s in ss:
            if interp(self.w, s) < 1e-4:
                rings.append([len(verts)])
                verts.append(Vector((0, self.y(s), interp(self.zc, s))))
                continue
            ring = []
            for k in range(segs):
                ring.append(len(verts))
                verts.append(self.point(s, TAU * k / segs + math.pi / segs))
            rings.append(ring)
        faces = []
        for lo, up in zip(rings, rings[1:]):
            for k in range(segs):
                if len(lo) == 1:
                    faces.append((lo[0], up[(k + 1) % segs], up[k]))
                elif len(up) == 1:
                    faces.append((lo[k], lo[(k + 1) % segs], up[0]))
                else:
                    faces.append((lo[k], lo[(k + 1) % segs], up[(k + 1) % segs], up[k]))
        if len(rings[-1]) > 1:  # close the tail root
            faces.append(tuple(reversed(rings[-1])))
        return Geo(verts, faces).outward()


def yz_fin(outline, thick, at=(0, 0, 0), puff=0.6):
    """A thin vertical fin: outline [(y, z)] in the body's side plane, thickness along X."""
    g = slab(outline, [(puff, -thick / 2), (1.0, 0.0), (puff, thick / 2)], -thick * 0.55, thick * 0.55)
    g.deform(lambda v: (v.z + at[0], v.x + at[1], v.y + at[2]))
    return g.outward()


def xy_fin(outline, thick, frame):
    """A thin flat fin: outline in local XY, thickness along local Z, placed by a matrix."""
    g = slab(outline, [(0.6, -thick / 2), (1.0, 0.0), (0.6, thick / 2)], -thick * 0.55, thick * 0.55)
    return g.transformed(frame)


def eyes(p, m, body, s, th, r, look=0.25):
    """Big friendly eyes: white, a dark pupil looking slightly forward, a highlight dot."""
    for side in (1, -1):
        t = th if side > 0 else math.pi - th
        pos = body.point(s, t)
        n = body.normal(s, t)
        f = facing(pos + n * 0.002, n)
        p.add(disc(K.circle(10, r), dome=r * 0.35), m['white'], f)
        fwd = Vector((0, -1, 0))
        off = (fwd - n * fwd.dot(n)).normalized() * r * look
        p.add(disc(K.circle(8, r * 0.62), dome=r * 0.3), m['night'], facing(pos + n * (r * 0.3) + off, n))
        hi = (Vector((0, 0, 1)) - n * n.z).normalized() * r * 0.3
        p.add(disc(K.circle(6, r * 0.22), dome=r * 0.1), m['white'], facing(pos + n * (r * 0.5) + off + hi, n))


def cheek(p, m, body, s, th, r):
    for side in (1, -1):
        t = th if side > 0 else math.pi - th
        pos, n = body.point(s, t), body.normal(s, t)
        p.add(disc(K.circle(8, r, sy=0.7), dome=r * 0.12), m['cheek'], facing(pos + n * 0.002, n, spin=0))


def fork_tail(L, H, notch=0.55):
    return [(0.0, 0.02 * H), (L * 0.55, H * 0.42), (L, H * 0.62), (L * (1 - notch * 0.6), 0.0), (L, -H * 0.62),
            (L * 0.55, -H * 0.42), (0.0, -0.02 * H)]


def fan_tail(L, H):
    pts = [(0.0, 0.03 * H)]
    for k in range(7):
        a = RAD(60 - 120 * k / 6)
        r = L * (1 + 0.1 * math.cos(3 * a * 3))
        pts.append((r * math.cos(a) * 0.9 + L * 0.1, H * 0.85 * math.sin(a)))
    pts.append((0.0, -0.03 * H))
    return pts


# ==================================================================== fish
def puff_minnow(m):
    L = 0.24
    b = Body(L, w=[(0, 0.0), (0.06, 0.06), (0.35, 0.1), (0.7, 0.085), (1.0, 0.03)],
             ht=[(0, 0.0), (0.06, 0.06), (0.35, 0.1), (0.7, 0.085), (1.0, 0.032)],
             hb=[(0, 0.0), (0.06, 0.055), (0.38, 0.095), (0.7, 0.08), (1.0, 0.03)])
    p = Piece('puff_minnow')
    g = b.loft([0, 0.04, 0.12, 0.24, 0.38, 0.54, 0.7, 0.86, 1.0], 12)
    g.retag(lambda c, n, t: 1 if c.z < -0.03 else 0)
    p.add(g, {0: m['sky'], 1: m['sky_light']})
    eyes(p, m, b, 0.26, RAD(25), 0.032)
    cheek(p, m, b, 0.4, RAD(-5), 0.018)
    p.add(yz_fin([(-0.03, 0.0), (0.02, 0.05), (0.07, 0.035), (0.08, 0.0)], 0.014, (0, 0.0, 0.09)), m['white'])
    for side in (1, -1):
        fr = facing((side * 0.09, -0.005, -0.03), (side * 0.4, 0.2, -0.9)) @ xf((0, 0, 0), (0, 0, RAD(90 if side > 0 else -90)))
        p.add(xy_fin([(0.0, 0.0), (0.055, 0.02), (0.065, -0.02), (0.02, -0.03)], 0.01, fr), m['white'])
    root = Vector((0, b.y(1.0) - 0.005, 0.0))
    t = Piece('puff_minnow_tail')
    t.add(yz_fin(fork_tail(0.11, 0.13), 0.016, (0, root.y, 0)), m['sky_light'])
    return p, t, root


def sun_carp(m):
    L = 0.42
    b = Body(L, w=[(0, 0.0), (0.05, 0.05), (0.3, 0.1), (0.65, 0.085), (1.0, 0.028)],
             ht=[(0, 0.0), (0.05, 0.05), (0.32, 0.115), (0.66, 0.095), (1.0, 0.035)],
             hb=[(0, 0.0), (0.05, 0.045), (0.32, 0.095), (0.66, 0.08), (1.0, 0.03)])
    p = Piece('sun_carp')
    g = b.loft([0, 0.035, 0.1, 0.2, 0.32, 0.46, 0.6, 0.74, 0.88, 1.0], 12)
    g.retag(lambda c, n, t: 1 if c.z < -0.035 else 0)
    p.add(g, {0: m['tangerine'], 1: m['sun']})
    eyes(p, m, b, 0.17, RAD(30), 0.034)
    # Whiskers, a long dorsal fin, pectoral and pelvic fins.
    for side in (1, -1):
        p.add(tube([(side * 0.022, b.y(0.02), -0.012), (side * 0.06, b.y(-0.02), -0.04), (side * 0.085, b.y(0.06), -0.07)],
                   [0.007, 0.005, 0.003], sides=3), m['gold'])
    p.add(yz_fin([(-0.12, 0.0), (-0.07, 0.07), (0.02, 0.08), (0.12, 0.055), (0.16, 0.0)], 0.016, (0, 0.0, 0.1)), m['honey'])
    for side in (1, -1):
        fr = facing((side * 0.09, -0.06, -0.05), (side * 0.5, 0.2, -0.85)) @ xf((0, 0, 0), (0, 0, RAD(80 if side > 0 else -80)))
        p.add(xy_fin([(0.0, 0.0), (0.08, 0.03), (0.1, -0.03), (0.03, -0.045)], 0.012, fr), m['honey'])
    root = Vector((0, b.y(1.0) - 0.005, 0.0))
    t = Piece('sun_carp_tail')
    tg = yz_fin(fan_tail(0.17, 0.2), 0.018, (0, root.y, 0))
    tg.retag(lambda c, n, tt: 1 if (c.y - root.y) > 0.1 else 0)
    t.add(tg, {0: m['tangerine'], 1: m['honey']})
    return p, t, root


def star_ray(m):
    p = Piece('star_ray')
    # A flat diamond with rounded wing tips, domed on top, lilac underneath.
    # Ray outline (top view, nose toward -Y): rounded nose, wide wings with soft points, tapering rear.
    right = [(0.0, -0.17), (0.08, -0.16), (0.17, -0.115), (0.26, -0.05), (0.33, 0.0), (0.355, 0.03), (0.3, 0.06),
             (0.2, 0.09), (0.11, 0.135), (0.045, 0.17)]
    out = right + [(-x, y) for x, y in reversed(right[1:])] + [(0.0, 0.18)]
    out = out[:len(right)] + [(0.0, 0.185)] + [(-x, y) for x, y in reversed(right[1:])]
    out = list(reversed(out))
    g = slab(out, [(0.86, -0.022), (1.0, 0.0), (0.84, 0.03), (0.42, 0.058)], -0.03, 0.07)
    g.retag(lambda c, n, t: 1 if n.z < -0.2 else 0)
    p.add(g, {0: m['violet'], 1: m['lilac']})
    # Two little head lobes at the front and star spots on the back.
    for side in (1, -1):
        p.add(K.blob((side * 0.055, -0.2, 0.012), (0.035, 0.05, 0.025), 6, K.LATS_MIN), m['violet'])
    for k, (x, y, r, spin) in enumerate(((0.0, 0.04, 0.042, 0.0), (-0.15, 0.03, 0.03, 0.4), (0.15, 0.03, 0.03, -0.4),
                                         (-0.08, 0.12, 0.024, 0.8), (0.08, 0.12, 0.024, -0.8), (0.0, -0.08, 0.026, 0.2))):
        z = 0.07 - 0.25 * (abs(x) + abs(y) * 0.6) ** 1.5
        p.add(disc(star_outline(5, r, r * 0.45, math.pi / 2 + spin), dome=0.006), m['honey'], xf((x, y, z + 0.004)))
    for side in (1, -1):
        pos = Vector((side * 0.05, -0.13, 0.05))
        n = Vector((side * 0.3, -0.3, 0.9)).normalized()
        p.add(disc(K.circle(10, 0.026), dome=0.009), m['white'], facing(pos, n))
        p.add(disc(K.circle(8, 0.016), dome=0.008), m['night'], facing(pos + n * 0.008 + Vector((0, -0.005, 0)), n))
        p.add(disc(K.circle(6, 0.006), dome=0.003), m['white'], facing(pos + n * 0.014 + Vector((0, -0.002, 0.004)), n))
    root = Vector((0, 0.2, 0.0))
    t = Piece('star_ray_tail')
    path = [root + Vector((0, 0.0, 0)), root + Vector((0, 0.12, 0.01)), root + Vector((0, 0.24, 0.025)),
            root + Vector((0, 0.34, 0.04))]
    t.add(tube(path, [0.022, 0.013, 0.008, 0.005], sides=4, cap_end=True), m['violet'])
    t.add(disc(star_outline(5, 0.04, 0.018), dome=0.008, back=0.008), m['honey'],
          xf(path[-1] + Vector((0, 0.03, 0.0)), (RAD(80), 0, 0)))
    return p, t, root


def cloud_koi(m):
    L = 0.56
    b = Body(L, w=[(0, 0.0), (0.05, 0.05), (0.28, 0.09), (0.62, 0.07), (1.0, 0.022)],
             ht=[(0, 0.0), (0.05, 0.05), (0.3, 0.095), (0.64, 0.075), (1.0, 0.026)],
             hb=[(0, 0.0), (0.05, 0.045), (0.3, 0.08), (0.64, 0.065), (1.0, 0.024)], y_nose=-0.36)
    p = Piece('cloud_koi')
    g = b.loft([0, 0.035, 0.1, 0.19, 0.3, 0.42, 0.55, 0.68, 0.8, 0.91, 1.0], 12)
    # Red and pink patches on the back: deterministic blobs, white elsewhere.
    patches = [((0.0, -0.22, 0.09), 0.08, 1), ((0.05, -0.02, 0.07), 0.075, 2), ((-0.04, 0.12, 0.05), 0.06, 1),
               ((0.0, -0.33, 0.03), 0.035, 1)]

    def paint(c, n, t):
        for centre, r, tag in patches:
            if (c - Vector(centre)).length < r:
                return tag
        return 0
    g.retag(paint)
    p.add(g, {0: m['white'], 1: m['red'], 2: m['rose']})
    eyes(p, m, b, 0.15, RAD(28), 0.032)
    p.add(yz_fin([(-0.08, 0.0), (-0.03, 0.06), (0.06, 0.06), (0.12, 0.0)], 0.014, (0, -0.02, 0.085)), m['rose'])
    # Long flowing pectoral fins (they trail back like veils).
    for side in (1, -1):
        fr = facing((side * 0.08, -0.12, -0.04), (side * 0.35, 0.1, -0.93)) @ xf((0, 0, 0), (0, 0, RAD(65 if side > 0 else -65)))
        p.add(xy_fin([(0.0, 0.0), (0.09, 0.04), (0.17, 0.02), (0.19, -0.04), (0.08, -0.05)], 0.012, fr), m['white'])
    root = Vector((0, b.y(1.0) - 0.004, 0.0))
    t = Piece('cloud_koi_tail')
    veil = [(0.0, 0.02), (0.08, 0.07), (0.2, 0.11), (0.27, 0.07), (0.2, 0.0), (0.27, -0.07), (0.2, -0.11), (0.08, -0.07),
            (0.0, -0.02)]
    tg = yz_fin(veil, 0.014, (0, root.y, 0))
    tg.retag(lambda c, n, tt: 1 if (c.y - root.y) > 0.17 else 0)
    t.add(tg, {0: m['white'], 1: m['rose']})
    return p, t, root


# ==================================================================== main
def main():
    style.reset_scene()
    m = mats()
    roots, extra = {}, {}
    for n in IDS:
        body, tail, root = globals()[n](m)
        # Origin at the body centre (bounding-box middle of the body + tail).
        lo, hi = body.bounds()
        tlo, thi = tail.bounds()
        centre = Vector([(min(lo[i], tlo[i]) + max(hi[i], thi[i])) / 2 for i in range(3)])
        centre.x = 0.0
        k = SCALE.get(n, 1.0)
        body.deform(lambda v: (v - centre) * k)
        tail.deform(lambda v: (v - centre) * k)
        root = (root - centre) * k
        obj = body.build(sharp=60, name=n)
        to = tail.build(sharp=60, pivot=root, name='tail')
        to.data.name = f'{n}_tail'
        attach(to, obj)
        roots[n] = obj
        extra[n] = dict(tail_pivot=[round(c, 3) for c in K.gltf_vec(root)])
    bpy.context.view_layer.update()
    stats = {n: K.root_stats(o) for n, o in roots.items()}
    K.report(stats)
    errors = []
    for n, s in stats.items():
        if s['tris'] > BUDGET:
            errors.append(f'{n}: {s["tris"]} tris')
        size = max(s['size'])
        if not 0.3 <= size <= 0.8:
            errors.append(f'{n}: size {size}')
        if s['children'] != ['tail']:
            errors.append(f'{n}: children {s["children"]}')
    path, size = K.export(list(roots.values()), FILE)
    print(f'{FILE}: {size} bytes, {sum(s["tris"] for s in stats.values())} tris', extra)
    K.write_manifest(FILE, size, stats, dict(generator='art/blender/kit/build_fish.py', tails=extra,
                                            notes='origin at the body centre, head toward +Z; child `tail` pivots '
                                                  'at the tail root, wag it about local Y'))
    if '--render' in K.args():
        cells = [(roots[n], f'{n}  {stats[n]["tris"]}') for n in IDS]
        for o in roots.values():
            o.rotation_euler = (0, 0, RAD(-60))  # three-quarter view so the side, eye and back all show
        placed = K.contact_sheet(cells, os.path.join(K.PREVIEWS, 'fish.png'), cols=4, pitch=(1.1, 1.0), width_px=2000,
                                 label_size=0.06, label_dy=0.38, ground='#8FDBFF')
        for o in roots.values():
            o.location.z = 0.25
        style.render(os.path.join(K.PREVIEWS, 'fish.png'))
        # Swing check: tails at +0.5 rad.
        for o in roots.values():
            o.children[0].rotation_euler = (0, 0, 0.5)
        style.render(os.path.join(K.PREVIEWS, 'fish-tail-swing.png'))
    if errors:
        raise SystemExit('fish contract failures:\n  ' + '\n  '.join(errors))
    print('fish OK')


main()
