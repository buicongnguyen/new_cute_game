"""Cast kit: geometry helpers and the export pipeline for the Cloudback cast files
(whale.glb, keeper.glb, crew.glb, gloom.glb, hives.glb).

Everything here is authored in glTF space: Y up, +Z is the front, metres. `Geo` converts to Blender
(x, -z, y) only when it builds an object, so the numbers in the generators read like the contract.
Left/right follow the character: `*_l` parts sit at +X (the character's own left when it faces +Z),
`*_r` parts at -X.

Blender object names must be unique, so parts are named '<root>__<part>' in Blender and
`fix_names` strips the prefix in the GLB (every crew member gets plain `body`, `head`, ...).

Uses style.py (shared, read-only) for palette materials, studio light and rendering.
"""
import bpy
import bmesh
import json
import math
import os
import random
import struct
import sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
from style import PALETTE, glow, gloom_crystal, mat, pal  # noqa: E402,F401

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'assets', 'models')
MANIFESTS = os.path.join(REPO, 'art', 'manifests')
PREVIEWS = os.path.join(REPO, 'art', 'previews')
SEP = '__'
TAU = math.tau
RAD = math.radians
UP = Vector((0.0, 1.0, 0.0))
FWD = Vector((0.0, 0.0, 1.0))


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    return set(argv)


def to_b(p):
    """glTF (x, y, z) -> Blender (x, -z, y)."""
    return Vector((p[0], -p[2], p[1]))


def from_b(p):
    return Vector((p[0], p[2], -p[1]))


def sp(v, e):
    """Signed power, for superellipses."""
    return math.copysign(abs(v) ** e, v)


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def smin(a, b, k):
    """Polynomial smooth minimum: rounds the crease where two height fields meet."""
    if k <= 0:
        return min(a, b)
    h = max(k - abs(a - b), 0.0) / k
    return min(a, b) - h * h * k * 0.25


def lerp(a, b, t):
    return a + (b - a) * t


class Pchip:
    """Monotone cubic interpolation through (x, (v0, v1, ...)) control rows. Smooth, no overshoot."""

    def __init__(self, rows):
        self.x = [r[0] for r in rows]
        self.y = [list(r[1:]) for r in rows]
        n, k = len(rows), len(rows[0]) - 1
        self.d = [[0.0] * k for _ in range(n)]
        h = [self.x[i + 1] - self.x[i] for i in range(n - 1)]
        for c in range(k):
            delta = [(self.y[i + 1][c] - self.y[i][c]) / h[i] for i in range(n - 1)]
            for i in range(n):
                if i == 0:
                    d = delta[0]
                elif i == n - 1:
                    d = delta[-1]
                elif delta[i - 1] * delta[i] <= 0:
                    d = 0.0
                else:
                    w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
                    d = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i])
                self.d[i][c] = d

    def __call__(self, x):
        xs = self.x
        if x <= xs[0]:
            return list(self.y[0])
        if x >= xs[-1]:
            return list(self.y[-1])
        i = max(j for j in range(len(xs) - 1) if xs[j] <= x)
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        h00, h10 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t
        h01, h11 = -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
        return [h00 * self.y[i][c] + h10 * h * self.d[i][c] + h01 * self.y[i + 1][c] + h11 * h * self.d[i + 1][c]
                for c in range(len(self.y[i]))]


def frame(fwd, up_hint=(0, 1, 0)):
    """A rotation whose local +Z points along `fwd` and local +Y leans toward `up_hint`."""
    f = Vector(fwd).normalized()
    u = Vector(up_hint)
    r = u.cross(f)
    if r.length < 1e-6:
        r = Vector((0, 0, 1)).cross(f) if abs(f.z) < 0.9 else Vector((1, 0, 0))
    r.normalize()
    u = f.cross(r).normalized()
    return Matrix((r, u, f)).transposed()


def rot(x=0.0, y=0.0, z=0.0):
    """Euler XYZ rotation (radians) in glTF space."""
    return (Matrix.Rotation(z, 3, 'Z') @ Matrix.Rotation(y, 3, 'Y') @ Matrix.Rotation(x, 3, 'X'))


# ================================================================ geometry
class Geo:
    """A polygon soup with a material and a smooth flag per face, in glTF space."""

    def __init__(self):
        self.v, self.f, self.m, self.s = [], [], [], []

    def vert(self, p):
        self.v.append(Vector(p))
        return len(self.v) - 1

    def face(self, idx, m=None, smooth=True):
        self.f.append(tuple(idx))
        self.m.append(m)
        self.s.append(smooth)

    def add(self, *geos):
        for g in geos:
            o = len(self.v)
            self.v += [p.copy() for p in g.v]
            self.f += [tuple(i + o for i in f) for f in g.f]
            self.m += list(g.m)
            self.s += list(g.s)
        return self

    def copy(self):
        return Geo().add(self)

    def paint(self, m, where=None):
        """Set the material of every face (or of faces whose centre passes `where`)."""
        for i, f in enumerate(self.f):
            if where is None or where(self.centre(f)):
                self.m[i] = m
        return self

    def fill(self, m):
        """Set the material of faces that have none yet."""
        self.m = [m if x is None else x for x in self.m]
        return self

    def flat(self, on=True):
        self.s = [not on] * len(self.f)
        return self

    def xf(self, M, about=None):
        M4 = M.to_4x4() if len(M) == 3 else M
        if about is not None:
            a = Vector(about)
            M4 = Matrix.Translation(a) @ M4 @ Matrix.Translation(-a)
        self.v = [M4 @ p for p in self.v]
        if M4.to_3x3().determinant() < 0:
            self.flip()
        return self

    def move(self, d):
        d = Vector(d)
        self.v = [p + d for p in self.v]
        return self

    def scale(self, s, about=(0, 0, 0)):
        s = (s, s, s) if isinstance(s, (int, float)) else s
        return self.xf(Matrix.Diagonal(Vector(s)).to_4x4(), about)

    def mirrored(self):
        """A copy mirrored across X = 0 (faces flipped so they still point out)."""
        return self.copy().xf(Matrix.Diagonal((-1.0, 1.0, 1.0)))

    def flip(self):
        self.f = [tuple(reversed(f)) for f in self.f]
        return self

    def centre(self, f):
        c = Vector()
        for i in f:
            c += self.v[i]
        return c / len(f)

    def normal(self, f):
        n = Vector()
        for a, b in zip(f, f[1:] + f[:1]):
            p, q = self.v[a], self.v[b]
            n += Vector(((p.y - q.y) * (p.z + q.z), (p.z - q.z) * (p.x + q.x), (p.x - q.x) * (p.y + q.y)))
        return n.normalized() if n.length > 1e-12 else n

    def volume(self):
        vol = 0.0
        for f in self.f:
            a = self.v[f[0]]
            for b, c in zip(f[1:-1], f[2:]):
                vol += a.dot(self.v[b].cross(self.v[c]))
        return vol / 6.0

    def outward(self):
        """For closed pieces: flip every face if the piece is inside out."""
        if self.volume() < 0:
            self.flip()
        return self

    def toward(self, fn):
        """For open pieces: flip each face whose normal points away from fn(centre)."""
        for i, f in enumerate(self.f):
            if self.normal(f).dot(fn(self.centre(f))) < 0:
                self.f[i] = tuple(reversed(f))
        return self

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def bounds(self):
        lo = Vector((min(p.x for p in self.v), min(p.y for p in self.v), min(p.z for p in self.v)))
        hi = Vector((max(p.x for p in self.v), max(p.y for p in self.v), max(p.z for p in self.v)))
        return lo, hi


def iso_split(g, fn, m_neg, m_pos=None, only=None):
    """Cut faces along the zero line of the scalar field fn(point) and paint the negative side m_neg (and the
    positive side m_pos, if given). Gives crisp, smooth colour boundaries (a belly line) on a coarse mesh.
    only(face_index) -> bool limits the cut to some faces."""
    s = [fn(p) for p in g.v]
    cache = {}

    def cross(a, b):
        key = (min(a, b), max(a, b))
        if key not in cache:
            t = s[a] / (s[a] - s[b])
            cache[key] = g.vert(g.v[a].lerp(g.v[b], t))
            s.append(0.0)
        return cache[key]

    nf, nm, ns = [], [], []
    for fi, (f, m, sm) in enumerate(zip(g.f, g.m, g.s)):
        if only is not None and not only(fi):
            nf.append(f)
            nm.append(m)
            ns.append(sm)
            continue
        neg = [s[i] < 0 for i in f]
        if all(neg) or not any(neg):
            nf.append(f)
            nm.append(m_neg if neg[0] else (m_pos or m))
            ns.append(sm)
            continue
        changes = sum(1 for k in range(len(f)) if neg[k] != neg[(k + 1) % len(f)])
        if changes != 2:  # a saddle: leave it whole, painted by its centre
            nf.append(f)
            nm.append(m_neg if fn(g.centre(f)) < 0 else (m_pos or m))
            ns.append(sm)
            continue
        a_side, b_side = [], []
        for k in range(len(f)):
            a, b = f[k], f[(k + 1) % len(f)]
            (a_side if neg[k] else b_side).append(a)
            if neg[k] != neg[(k + 1) % len(f)]:
                c = cross(a, b)
                a_side.append(c)
                b_side.append(c)
        for poly, isneg in ((a_side, True), (b_side, False)):
            if len(set(poly)) >= 3:
                nf.append(tuple(poly))
                nm.append(m_neg if isneg else (m_pos or m))
                ns.append(sm)
    g.f, g.m, g.s = nf, nm, ns
    return g


def grid_faces(g, rows, m=None, wrap=True, smooth=True):
    """Quads between consecutive rows of vertex indices (rows of equal length)."""
    for a, b in zip(rows, rows[1:]):
        n = len(a)
        for j in range(n if wrap else n - 1):
            k = (j + 1) % n
            g.face((a[j], a[k], b[k], b[j]), m, smooth)


def fan(g, centre, row, m=None, reverse=False, wrap=True, smooth=True):
    n = len(row)
    for j in range(n if wrap else n - 1):
        k = (j + 1) % n
        g.face((centre, row[k], row[j]) if not reverse else (centre, row[j], row[k]), m, smooth)


def loft(rings, m=None, start=None, end=None, cap=True, smooth=True):
    """Join closed rings of equal size. start/end: pole points; else flat caps (if cap). Closed -> outward."""
    g = Geo()
    rows = [[g.vert(p) for p in ring] for ring in rings]
    grid_faces(g, rows, m, True, smooth)
    for pole, row, last in ((start, rows[0], False), (end, rows[-1], True)):
        if pole is not None:
            fan(g, g.vert(pole), row, m, reverse=last, smooth=smooth)
        elif cap:
            g.face(row if last else list(reversed(row)), m, smooth)
    return g.outward()


def ellipsoid(c, r, segs=16, rings=10, R=None, m=None, smooth=True):
    """A UV ellipsoid with its poles on local Y; R rotates it (3x3)."""
    r = (r, r, r) if isinstance(r, (int, float)) else r
    pts = []
    for i in range(1, rings):
        a = math.pi * i / rings
        pts.append([Vector((math.sin(a) * math.cos(TAU * j / segs), math.cos(a), math.sin(a) * math.sin(TAU * j / segs)))
                    for j in range(segs)])
    g = loft(pts, m, start=Vector((0, 1, 0)), end=Vector((0, -1, 0)), smooth=smooth)
    g.scale(r)
    if R is not None:
        g.xf(R)
    return g.move(c)


def superellipsoid(c, r, n=4.0, segs=16, rings=10, R=None, m=None, smooth=True):
    """A rounded box (n=4..6) or a pillowy ball (n=2.5..3)."""
    r = (r, r, r) if isinstance(r, (int, float)) else r
    e = 2.0 / n
    rows = []
    for i in range(1, rings):
        phi = math.pi / 2 - math.pi * i / rings
        cp, s = math.cos(phi), math.sin(phi)
        rows.append([Vector((sp(cp, e) * sp(math.cos(TAU * j / segs), e), sp(s, e),
                             sp(cp, e) * sp(math.sin(TAU * j / segs), e))) for j in range(segs)])
    g = loft(rows, m, start=Vector((0, 1, 0)), end=Vector((0, -1, 0)), smooth=smooth)
    g.scale(r)
    if R is not None:
        g.xf(R)
    return g.move(c)


def lathe(profile, segs=16, c=(0, 0, 0), sx=1.0, sz=1.0, R=None, m=None, mats=None, smooth=True, phase=0.0):
    """Revolve [(radius, y), ...] (bottom to top) around local Y. Ends with radius 0 become poles, others
    get flat caps. mats: optional material per band (len(profile) - 1)."""
    g = Geo()
    rows = []
    for rr, y in profile:
        if rr <= 1e-6:
            rows.append([g.vert((0, y, 0))])
        else:
            rows.append([g.vert((rr * sx * math.cos(TAU * (j + phase) / segs), y,
                                 rr * sz * math.sin(TAU * (j + phase) / segs))) for j in range(segs)])
    for bi, (a, b) in enumerate(zip(rows, rows[1:])):
        mm = mats[bi] if mats else m
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            fan(g, a[0], b, mm, smooth=smooth)
        elif len(b) == 1:
            fan(g, b[0], a, mm, reverse=True, smooth=smooth)
        else:
            grid_faces(g, [a, b], mm, True, smooth)
    if len(rows[0]) > 1:
        g.face(list(reversed(rows[0])), mats[0] if mats else m, smooth)
    if len(rows[-1]) > 1:
        g.face(rows[-1], mats[-1] if mats else m, smooth)
    g.outward()
    if R is not None:
        g.xf(R)
    return g.move(c)


def ptframes(path):
    """Parallel-transport frames (tangent, normal, binormal) along a polyline."""
    pts = [Vector(p) for p in path]
    tans = []
    for i in range(len(pts)):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tans.append((b - a).normalized())
    t0 = tans[0]
    ref = Vector((0, 1, 0)) if abs(t0.y) < 0.9 else Vector((1, 0, 0))
    n = (ref - t0 * ref.dot(t0)).normalized()
    out = []
    for i, t in enumerate(tans):
        if i > 0:
            axis = tans[i - 1].cross(t)
            if axis.length > 1e-8:
                ang = math.acos(max(-1.0, min(1.0, tans[i - 1].dot(t))))
                n = Matrix.Rotation(ang, 3, axis.normalized()) @ n
            n = (n - t * n.dot(t)).normalized()
        out.append((t, n, t.cross(n)))
    return pts, out


def tube(path, radii, sides=8, m=None, caps=True, flatten=1.0, smooth=True, round_caps=0.5, up=None):
    """Sweep a circle (radius per point, or one radius) along a path. Rounded caps by default."""
    pts, frames = ptframes(path)
    radii = radii if isinstance(radii, (list, tuple)) else [radii] * len(pts)
    if up is not None:  # fixed side direction (keeps flat bands from twisting)
        frames = [(t, (Vector(up) - t * Vector(up).dot(t)).normalized(),
                   t.cross((Vector(up) - t * Vector(up).dot(t)).normalized())) for t, _, _ in frames]
    rings = []
    for p, (t, n, b), rr in zip(pts, frames, radii):
        rings.append([p + (n * math.cos(TAU * j / sides) * flatten + b * math.sin(TAU * j / sides)) * rr
                      for j in range(sides)])
    start = end = None
    if caps:
        start = pts[0] - frames[0][0] * radii[0] * round_caps
        end = pts[-1] + frames[-1][0] * radii[-1] * round_caps
    return loft(rings, m, start, end, cap=caps, smooth=smooth)


def bez(points, n):
    """Sample a quadratic/cubic Bezier (3 or 4 control points) at n points."""
    P = [Vector(p) for p in points]
    out = []
    for i in range(n):
        t = i / (n - 1)
        if len(P) == 3:
            out.append(P[0] * (1 - t) ** 2 + P[1] * 2 * t * (1 - t) + P[2] * t * t)
        else:
            out.append(P[0] * (1 - t) ** 3 + P[1] * 3 * t * (1 - t) ** 2 + P[2] * 3 * t * t * (1 - t) + P[3] * t ** 3)
    return out


def torus(c, major, minor, segs=20, sides=8, R=None, m=None, smooth=True, sy=1.0):
    """A ring lying in the XZ plane (axis Y)."""
    rings = []
    for i in range(segs):
        a = TAU * i / segs
        d = Vector((math.cos(a), 0, math.sin(a)))
        rings.append([d * (major + minor * math.cos(TAU * j / sides)) + Vector((0, minor * sy * math.sin(TAU * j / sides), 0))
                      for j in range(sides)])
    g = Geo()
    rows = [[g.vert(p) for p in ring] for ring in rings]
    grid_faces(g, rows + [rows[0]], m, True, smooth)
    g.outward()
    if R is not None:
        g.xf(R)
    return g.move(c)


def ell_project(c, r, p):
    """Radially project p onto the ellipsoid (centre c, radii r). Returns (point, normal)."""
    c = Vector(c)
    d = Vector(p) - c
    k = 1.0 / math.sqrt((d.x / r[0]) ** 2 + (d.y / r[1]) ** 2 + (d.z / r[2]) ** 2)
    q = c + d * k
    n = Vector(((q.x - c.x) / r[0] ** 2, (q.y - c.y) / r[1] ** 2, (q.z - c.z) / r[2] ** 2)).normalized()
    return q, n


def ell_dir(c, r, d):
    """The point and normal of the ellipsoid in direction d from its centre."""
    return ell_project(c, r, Vector(c) + Vector(d).normalized())


def decal(c, r, d, w, h, m, segs=12, rows=2, lift=0.006, dome=0.006, tuck=-0.004, spin=0.0, offset=(0, 0)):
    """A domed elliptical patch hugging an ellipsoid (eyes, cheeks, spots). d: direction of its centre from the
    ellipsoid centre; w, h: half sizes along the surface (right, up); edges tuck slightly under the surface."""
    p0, n0 = ell_dir(c, r, d)
    upv = UP - n0 * UP.dot(n0)
    if upv.length < 1e-4:
        upv = FWD - n0 * FWD.dot(n0)
    upv.normalize()
    right = upv.cross(n0).normalized()
    if spin:
        Rm = Matrix.Rotation(spin, 3, n0)
        upv, right = Rm @ upv, Rm @ right
    p0 = p0 + right * offset[0] + upv * offset[1]
    g = Geo()
    centre_pt, cn = ell_project(c, r, p0)
    ci = g.vert(centre_pt + cn * (lift + dome))
    ring_idx = []
    for k in range(1, rows + 1):
        t = k / rows
        row = []
        for j in range(segs):
            a = TAU * j / segs
            q = p0 + (right * math.cos(a) * w + upv * math.sin(a) * h) * t
            q, qn = ell_project(c, r, q)
            hgt = (lift + dome * (1 - t * t)) if k < rows else tuck
            row.append(g.vert(q + qn * hgt))
        ring_idx.append(row)
    fan(g, ci, ring_idx[0], m)
    grid_faces(g, ring_idx, m)
    cc = Vector(c)
    return g.toward(lambda p: p - cc)


def surface_curve(c, r, d0, pts2d, lift=0.006):
    """Points on an ellipsoid: pts2d are (right, up) offsets in metres around the direction d0."""
    p0, n0 = ell_dir(c, r, d0)
    upv = (UP - n0 * UP.dot(n0)).normalized()
    right = upv.cross(n0).normalized()
    out = []
    for u, v in pts2d:
        q, qn = ell_project(c, r, p0 + right * u + upv * v)
        out.append(q + qn * lift)
    return out


def shard(base, direction, length, radius, sides=5, tip=0.4, m=None, seed=0, twist=0.0, base_tip=0.0, jitter=0.12):
    """A faceted crystal: an n-sided prism with a pointed tip (and an optional point at the base). Flat shaded."""
    rng = random.Random(seed)
    d = Vector(direction).normalized()
    R = frame(d, (0.3, 1, 0.2) if abs(d.y) < 0.95 else (1, 0, 0))
    body = length * (1 - tip)
    rings = []
    for zz, sc in ((0.0, 1.0), (body, 1.0 + 0.08 * rng.uniform(-1, 1))):
        ring = []
        for j in range(sides):
            a = TAU * j / sides + twist
            rr = radius * sc * (1 + jitter * rng.uniform(-1, 1))
            ring.append(Vector((rr * math.cos(a), rr * math.sin(a), zz)))
        rings.append(ring)
    tip_pt = Vector((radius * 0.15 * rng.uniform(-1, 1), radius * 0.15 * rng.uniform(-1, 1), length))
    start = Vector((0, 0, -base_tip * radius)) if base_tip else None
    g = loft(rings, m, start=start, end=tip_pt, cap=True, smooth=False)
    return g.xf(R).move(base)


def facet_blob(c, r, subdiv=1, jitter=0.12, seed=0, m=None, R=None):
    """A faceted, slightly irregular icosphere (flat shaded)."""
    r = (r, r, r) if isinstance(r, (int, float)) else r
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rng = random.Random(seed)
    g = Geo()
    idx = {}
    for v in bm.verts:
        p = v.co.copy()
        p *= 1 + jitter * rng.uniform(-1, 1)
        idx[v.index] = g.vert(p)
    for f in bm.faces:
        g.face([idx[v.index] for v in f.verts], m, False)
    bm.free()
    g.outward().scale(r)
    if R is not None:
        g.xf(R)
    return g.move(c)


def gem(c, radius, height, sides=6, m=None, R=None, top=0.5, waist=0.35):
    """A cut gem: two pyramids around a waist ring (flat shaded)."""
    ring = [Vector((radius * math.cos(TAU * j / sides), 0, radius * math.sin(TAU * j / sides))) for j in range(sides)]
    g = loft([ring], m, start=Vector((0, -height * (1 - top), 0)), end=Vector((0, height * top, 0)), smooth=False)
    if R is not None:
        g.xf(R)
    return g.move(c)


def wing(stations, sides=12, m=None, smooth=True):
    """A lofted fin/fluke/wing. stations: [(centre, chord_dir, thick_dir, chord, thickness)]; elliptical sections.
    The end stations are capped flat, so make them tiny for round tips."""
    rings = []
    for c, cd, td, chord, th in stations:
        c, cd, td = Vector(c), Vector(cd).normalized(), Vector(td).normalized()
        rings.append([c + cd * (math.cos(TAU * j / sides) * chord * 0.5) + td * (math.sin(TAU * j / sides) * th * 0.5)
                      for j in range(sides)])
    return loft(rings, m, cap=True, smooth=smooth)


# ================================================================ building
class Cast:
    """Collects roots and parts, builds Blender objects, exports one GLB, writes its manifest and preview."""

    def __init__(self, file):
        self.file = file
        self.roots = []          # root objects
        self.pivot = {}          # object name -> glTF pivot (world)
        self.geo_tris = {}

    def root(self, name, loc=(0, 0, 0)):
        o = bpy.data.objects.new(name, None)
        o.empty_display_size = 0.5
        bpy.context.scene.collection.objects.link(o)
        o.location = to_b(loc)
        self.pivot[o.name] = Vector(loc)
        self.roots.append(o)
        return o

    def _place(self, o, parent, pivot):
        o.parent = parent
        o.location = to_b(Vector(pivot) - self.pivot[parent.name])
        self.pivot[o.name] = Vector(pivot)

    def part(self, parent, name, geo, pivot=(0, 0, 0), sharp=55):
        """A mesh node `name` (exported without prefix) whose origin is `pivot` (glTF world)."""
        root = parent
        while root.parent is not None:
            root = root.parent
        full = f'{root.name}{SEP}{name}'
        me = build_mesh(full, geo, Vector(pivot), sharp)
        o = bpy.data.objects.new(full, me)
        bpy.context.scene.collection.objects.link(o)
        self._place(o, parent, pivot)
        return o

    def marker(self, parent, name, loc):
        root = parent
        while root.parent is not None:
            root = root.parent
        o = bpy.data.objects.new(f'{root.name}{SEP}{name}', None)
        o.empty_display_size = 0.2
        bpy.context.scene.collection.objects.link(o)
        self._place(o, parent, loc)
        return o

    # ---------------------------------------------------------- reports
    def tree(self, o):
        out = [o]
        for c in o.children:
            out += self.tree(c)
        return out

    def stats(self):
        res = {}
        for r in self.roots:
            tris = 0
            lo = Vector((1e9, 1e9, 1e9))
            hi = -lo
            parts = {}
            for o in self.tree(r):
                short = o.name.split(SEP)[-1]
                entry = {'pivot': [round(x, 3) for x in self.pivot[o.name]]}
                if o.type == 'MESH':
                    o.data.calc_loop_triangles()
                    t = len(o.data.loop_triangles)
                    tris += t
                    entry['tris'] = t
                    for v in o.data.vertices:
                        p = from_b(v.co) + self.pivot[o.name]
                        lo = Vector((min(lo.x, p.x), min(lo.y, p.y), min(lo.z, p.z)))
                        hi = Vector((max(hi.x, p.x), max(hi.y, p.y), max(hi.z, p.z)))
                if o is not r:
                    parts[short] = entry
            res[r.name] = {'tris': tris, 'size': [round(x, 3) for x in (hi - lo)],
                           'min': [round(x, 3) for x in lo], 'max': [round(x, 3) for x in hi], 'parts': parts}
        return res

    def export(self, budgets=None):
        path = os.path.join(MODELS, self.file + '.glb')
        style.export_roots(self.roots, path)
        fix_names(path)
        quantize_normals(path)
        size = os.path.getsize(path)
        st = self.stats()
        print(f'== {self.file}.glb  {size} bytes')
        over = []
        for name, e in st.items():
            lim = (budgets or {}).get(name)
            flag = '' if lim is None or e['tris'] <= lim else f'  OVER BUDGET ({lim})'
            if flag:
                over.append(name)
            print(f'   {name:14s} {e["tris"]:6d} tris  size {e["size"]}{flag}')
            for pn, pe in e['parts'].items():
                print(f'       {pn:12s} {pe.get("tris", "-"):>6} pivot {pe["pivot"]}')
        os.makedirs(MANIFESTS, exist_ok=True)
        manifest = {'file': self.file + '.glb', 'bytes': size,
                    'roots': {n: {'tris': e['tris'], 'size': e['size'], 'min': e['min'], 'max': e['max'],
                                  'parts': e['parts']} for n, e in st.items()}}
        with open(os.path.join(MANIFESTS, self.file + '.json'), 'w', encoding='utf-8') as fh:
            json.dump(manifest, fh, indent=2)
            fh.write('\n')
        if over:
            print('OVER BUDGET:', over)
        return manifest


def build_mesh(name, geo, pivot, sharp=55):
    bm = bmesh.new()
    verts = [bm.verts.new(to_b(p - pivot)) for p in geo.v]
    mats, slot = [], {}
    bad = 0
    for f, m, s in zip(geo.f, geo.m, geo.s):
        if len(set(f)) < 3:
            bad += 1
            continue
        try:
            face = bm.faces.new([verts[i] for i in f])
        except ValueError:
            bad += 1
            continue
        if m is None:
            m = pal('red')
        if m.name not in slot:
            slot[m.name] = len(mats)
            mats.append(m)
        face.material_index = slot[m.name]
        face.smooth = s
    # Weld coincident points (pole fans, seams) so smooth shading is continuous.
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    limit = math.radians(sharp)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            a, b = e.link_faces
            if a.material_index != b.material_index and False:
                e.smooth = False
            elif e.calc_face_angle(0) > limit:
                e.smooth = False
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    if bad:
        print(f'   ({name}: skipped {bad} degenerate/duplicate faces)')
    return me


def fix_names(path):
    """Strip '<root>__' prefixes from node and mesh names inside the GLB JSON chunk."""
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, ver, total = struct.unpack_from('<III', data, 0)
    jlen, jtype = struct.unpack_from('<II', data, 12)
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    rest = data[20 + jlen:]
    for key in ('nodes', 'meshes'):
        for item in doc.get(key, []):
            if SEP in item.get('name', ''):
                item['name'] = item['name'].split(SEP)[-1]
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', magic, ver, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), jtype) + js + rest
    with open(path, 'wb') as fh:
        fh.write(out)


def quantize_normals(path):
    """Store every NORMAL as normalized int8 (KHR_mesh_quantization, which three.js GLTFLoader reads natively).
    Saves 8 bytes per vertex; positions and indices stay as they are. Rebuilds the buffer with one view per accessor."""
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    blen, btype = struct.unpack_from('<II', data, 20 + jlen)
    binc = data[28 + jlen:28 + jlen + blen]
    normals = set()
    for mesh in doc.get('meshes', []):
        for prim in mesh['primitives']:
            if 'NORMAL' in prim['attributes']:
                normals.add(prim['attributes']['NORMAL'])
    size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    out = bytearray()
    views = []

    def add_view(blob, target, stride=None):
        while len(out) % 4:
            out.append(0)
        v = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(blob)}
        if target:
            v['target'] = target
        if stride:
            v['byteStride'] = stride
        out.extend(blob)
        views.append(v)
        return len(views) - 1

    for ai, acc in enumerate(doc['accessors']):
        view = doc['bufferViews'][acc['bufferView']]
        es = size[acc['componentType']] * ncomp[acc['type']]
        stride = view.get('byteStride', es)
        base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        raw = b''.join(binc[base + i * stride: base + i * stride + es] for i in range(acc['count']))
        if ai in normals and acc['componentType'] == 5126 and acc['type'] == 'VEC3':
            fl = struct.unpack('<%df' % (acc['count'] * 3), raw)
            q = bytearray()
            for i in range(acc['count']):
                x, y, z = fl[3 * i:3 * i + 3]
                q += struct.pack('<bbbb', *(max(-127, min(127, int(round(c * 127)))) for c in (x, y, z)), 0)
            acc['bufferView'] = add_view(bytes(q), 34962, 4)
            acc['componentType'] = 5120
            acc['normalized'] = True
            acc.pop('min', None)
            acc.pop('max', None)
        else:
            acc['bufferView'] = add_view(raw, view.get('target'))
        acc.pop('byteOffset', None)
    while len(out) % 4:
        out.append(0)
    doc['bufferViews'] = views
    doc['buffers'] = [{'byteLength': len(out)}]
    for key in ('extensionsUsed', 'extensionsRequired'):
        lst = doc.setdefault(key, [])
        if 'KHR_mesh_quantization' not in lst:
            lst.append('KHR_mesh_quantization')
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    blob = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js + \
        struct.pack('<II', len(out), 0x004E4942) + bytes(out)
    with open(path, 'wb') as fh:
        fh.write(blob)


def read_glb(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + jlen].decode('utf-8'))


# ================================================================ preview
def label(cam, text, at, size, color='#10283C'):
    cu = bpy.data.curves.new('Label', 'FONT')
    cu.body = text
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'TOP'
    cu.materials.append(mat('Preview label', color, 0.6))
    obj = bpy.data.objects.new('Label', cu)
    bpy.context.scene.collection.objects.link(obj)
    rotm = cam.matrix_world.to_3x3()
    obj.location = Vector(at) + rotm @ Vector((0.0, 0.0, 30.0))
    obj.rotation_euler = cam.matrix_world.to_euler()
    obj.visible_shadow = False
    return obj


def camera(target, ortho, elev=45.0, yaw=28.0, distance=80.0, name='Cast camera'):
    """Orthographic, looking at `target` (Blender coords) from the front (-Y), raised by elev, turned by yaw."""
    data = bpy.data.cameras.new(name)
    data.type = 'ORTHO'
    data.ortho_scale = ortho
    data.clip_end = 1000
    cam = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(cam)
    e, a = RAD(elev), RAD(yaw)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    cam.location = Vector(target) + d * distance
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam


def clear_preview():
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA', 'FONT') or o.name.startswith('Preview ground'):
            bpy.data.objects.remove(o, do_unlink=True)


def setup_render(size, ground=None):
    clear_preview()
    style.studio(ground_color=ground, size=size)
    sc = bpy.context.scene
    try:
        sc.eevee.taa_render_samples = 48
    except AttributeError:
        pass
    sc.render.resolution_percentage = 100


def sheet(cast, path, rows=None, gap=None, size=(1800, 900), elev=45.0, yaw=28.0, ground='#7DD957',
          label_size=None, ortho=None, extra=None, hide=(), row_gap=None):
    """Lay the roots out in rows (front row nearest the camera) and render them, labelled, to art/previews/<path>."""
    st = cast.stats()
    objs = {r.name: r for r in cast.roots}
    rows = rows or [[r.name for r in cast.roots]]
    keep = {n: o.location.copy() for n, o in objs.items()}
    placed = []
    z_row, max_w, z_back = 0.0, 0.0, 0.0
    for row in rows:
        widths = [st[n]['size'][0] for n in row]
        g = gap if gap is not None else max(widths) * 0.4
        total = sum(widths) + g * (len(row) - 1)
        max_w = max(max_w, total)
        depth = max(st[n]['size'][2] for n in row)
        x = -total / 2
        for n, w in zip(row, widths):
            mn, mx = st[n]['min'], st[n]['max']
            cx = x + w / 2
            objs[n].location = to_b((cx - (mn[0] + mx[0]) / 2, 0, z_row - (mn[2] + mx[2]) / 2))
            placed.append((n, cx, z_row + depth / 2 + 0.05 * depth))
            x += w + g
        z_back = z_row - depth / 2
        z_row -= depth + (row_gap if row_gap is not None else (g if gap is not None else depth * 0.5))
    for n, o in objs.items():
        for c in cast.tree(o):
            c.hide_render = n in hide
    setup_render(size, ground)
    hi = max(st[n]['max'][1] for n in sum(rows, []))
    lo = min(st[n]['min'][1] for n in sum(rows, []))
    z_front = max(p[2] for p in placed)
    z_mid = (z_front + z_back) / 2
    target = to_b((0, (hi + lo) / 2, z_mid))
    span_z = z_front - z_back
    o_scale = ortho or max(max_w * 1.1, (span_z * 0.75 + (hi - lo) * 0.75) * size[0] / size[1])
    cam = camera(target, o_scale, elev, yaw)
    bpy.context.view_layer.update()
    ls = label_size or o_scale * 0.02
    for n, cx, zf in placed:
        label(cam, n, to_b((cx, lo, zf)), ls)
    if extra:
        extra(cam)
    out = os.path.join(PREVIEWS, path)
    style.render(out)
    for n, loc in keep.items():
        objs[n].location = loc
    print('preview', out)
    return out
