"""World-kit helpers for the Cloudback trees, props, nature and fish generators.

style.py (shared with the character artist) is read-only; everything extra lives here:

- Geo / Piece: plain vertex + face lists with a per-face tag, accumulated into one named mesh with
  exact triangle counts (every face is triangulated and sorted, so output is deterministic).
- Primitives that read well from the 42 degree game camera: lathe, tube, soft blobs and canopies
  (buried faces dropped), rounded boxes, puffy slabs, leaves, discs, low icospheres.
- export(): style.export_roots plus a pass over the GLB JSON that strips Blender's ".001" name
  suffixes, so repeated child names (`fruits`, `tail`) are exact in the file.
- write_manifest(), check_glb() and contact_sheet() (labelled preview under style.studio light).

Blender is Z up with -Y as the front. glTF is Y up with +Z as the front: (x, y, z) -> (x, z, -y).
"""
import bpy
import bmesh
import json
import math
import os
import random
import re
import struct
import sys
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import style  # noqa: E402
from style import PALETTE, glow, mat, pal  # noqa: E402,F401

REPO = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
MODELS = os.path.join(REPO, 'public', 'assets', 'models')
MANIFESTS = os.path.join(REPO, 'art', 'manifests')
PREVIEWS = os.path.join(REPO, 'art', 'previews')

TAU = math.tau
RAD = math.radians
UP = Vector((0, 0, 1))
# The game camera sits at (0, 23, 23) in three.js: from -Y in Blender, about 42-45 degrees down.
TO_CAMERA = Vector((0, -0.74, 0.67)).normalized()


def args():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


# ================================================================ materials
def M(name, rough=0.55):
    """pal_<name> from the shared palette."""
    return pal(name, rough)


def G(name, color=None, strength=2.0):
    """glow_<name>, emissive. Colour defaults to the palette entry of the same name."""
    return glow(name, PALETTE.get(color or name, color or name), strength)


def gloom_crystal():
    return style.gloom_crystal()


# ================================================================= geometry
class Geo:
    """Vertex and face lists with a per-face tag (a material, or a key into a dict of materials)."""

    def __init__(self, verts=(), faces=(), tags=None):
        self.verts = [Vector(v) for v in verts]
        self.faces = [tuple(f) for f in faces]
        self.tags = list(tags) if tags is not None else [0] * len(self.faces)

    def copy(self):
        return Geo(self.verts, self.faces, self.tags)

    def transformed(self, m):
        return Geo([m @ v for v in self.verts], self.faces, self.tags)

    def deform(self, fn):
        self.verts = [Vector(fn(v)) for v in self.verts]
        return self

    def keep(self, predicate):
        pairs = [(f, t) for f, t in zip(self.faces, self.tags) if predicate(f, self)]
        return Geo(self.verts, [p[0] for p in pairs], [p[1] for p in pairs])

    def retag(self, fn):
        """fn(face_centre, face_normal, old_tag) -> new tag."""
        out = []
        for f, t in zip(self.faces, self.tags):
            vs = [self.verts[i] for i in f]
            c = sum(vs, Vector()) / len(vs)
            n = (vs[1] - vs[0]).cross(vs[2] - vs[0])
            n = n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))
            out.append(fn(c, n, t))
        self.tags = out
        return self

    def signed_volume(self):
        vol = 0.0
        for f in self.faces:
            a = self.verts[f[0]]
            for i in range(1, len(f) - 1):
                vol += a.dot(self.verts[f[i]].cross(self.verts[f[i + 1]]))
        return vol / 6.0

    def outward(self):
        if self.signed_volume() < 0:
            self.faces = [tuple(reversed(f)) for f in self.faces]
        return self

    def flipped(self):
        return Geo(self.verts, [tuple(reversed(f)) for f in self.faces], self.tags)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)


def merge(*geos):
    out = Geo()
    for g in geos:
        base = len(out.verts)
        out.verts += [v.copy() for v in g.verts]
        out.faces += [tuple(base + i for i in f) for f in g.faces]
        out.tags += list(g.tags)
    return out


class Piece:
    """Collects parts (geometry + material) into one named mesh object."""

    def __init__(self, name):
        self.name = name
        self.verts, self.faces, self.mats, self.smooth, self.materials = [], [], [], [], []

    def slot(self, material):
        if material not in self.materials:
            self.materials.append(material)
        return self.materials.index(material)

    def add(self, geo, material=None, xform=None, smooth=True):
        """material: a material, a dict tag -> material, or None when the tags are materials."""
        g = geo if xform is None else geo.transformed(xform)
        base = len(self.verts)
        self.verts.extend(v.copy() for v in g.verts)
        for f, t in zip(g.faces, g.tags):
            if isinstance(material, dict):
                m = material[t]
            elif material is None:
                m = t
            else:
                m = material
            self.faces.append(tuple(base + i for i in f))
            self.mats.append(self.slot(m))
            self.smooth.append(smooth)
        return self

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def deform(self, fn):
        self.verts = [Vector(fn(v)) for v in self.verts]
        return self

    def bounds(self):
        lo = Vector([min(v[i] for v in self.verts) for i in range(3)])
        hi = Vector([max(v[i] for v in self.verts) for i in range(3)])
        return lo, hi

    def build(self, sharp=50, pivot=None, name=None):
        """Make the mesh object. pivot (world point) becomes the object's origin and location."""
        off = Vector(pivot) if pivot is not None else Vector()
        nm = name or self.name
        me = bpy.data.meshes.new(nm)
        me.from_pydata([tuple(v - off) for v in self.verts], [], self.faces)
        for m in self.materials:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.mats)
        me.polygons.foreach_set('use_smooth', self.smooth)
        me.update()
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        degenerate = [f for f in bm.faces if f.calc_area() < 1e-10]
        if degenerate:
            bmesh.ops.delete(bm, geom=degenerate, context='FACES_ONLY')
        res = bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3],
                                    quad_method='FIXED', ngon_method='EAR_CLIP')
        for e in res['edges']:
            e.smooth = True
        if sharp:
            limit = RAD(sharp)
            for edge in bm.edges:
                if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > limit:
                    edge.smooth = False
        # Different materials always get split normals at their border anyway; keep faces sorted
        # so the export is byte-stable between runs.
        bm.verts.index_update()
        bm.faces.index_update()

        def key(face):
            c = face.calc_center_median()
            return (face.material_index, round(c.x, 4), round(c.y, 4), round(c.z, 4))
        rank = {f.index: n for n, f in enumerate(sorted(bm.faces, key=key))}
        bm.faces.sort(key=lambda f: rank[f.index])
        bm.faces.index_update()
        bm.to_mesh(me)
        bm.free()
        me.validate()
        obj = bpy.data.objects.new(nm, me)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = off
        return obj


def attach(child, parent):
    """Parent with the child's location kept relative to a parent at the origin."""
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    return child


def marker(name, loc, parent):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    bpy.context.scene.collection.objects.link(e)
    e.location = loc
    return attach(e, parent)


def group(name):
    """An empty root node."""
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    return e


# =================================================================== frames
def xf(loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    s = scale if isinstance(scale, (tuple, list, Vector)) else (scale, scale, scale)
    return Matrix.LocRotScale(Vector(loc), Euler(rot), Vector(s))


def facing(loc, normal, up=(0, 0, 1), spin=0.0):
    """Local +Z along `normal`, local +Y as close to `up` as possible."""
    z = Vector(normal).normalized()
    x = Vector(up).cross(z)
    if x.length < 1e-6:
        x = Vector((1, 0, 0))
    x.normalize()
    y = z.cross(x)
    if spin:
        q = Quaternion(z, spin)
        x, y = q @ x, q @ y
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def leaf_frame(base, yaw, pitch, roll=0.0):
    """Local +Y along a direction (yaw around Z, pitch above horizontal); local +Z the upper surface."""
    fwd = Vector((math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch)))
    side = Vector((math.sin(yaw), -math.cos(yaw), 0.0))
    nrm = side.cross(fwd).normalized()
    if roll:
        q = Quaternion(fwd, roll)
        side, nrm = q @ side, q @ nrm
    m = Matrix((side, fwd, nrm)).transposed().to_4x4()
    m.translation = Vector(base)
    return m


def bez(points, n):
    pts = [Vector(p) for p in points]
    out = []
    for i in range(n):
        t = i / (n - 1)
        if len(pts) == 2:
            out.append(pts[0].lerp(pts[1], t))
        elif len(pts) == 3:
            out.append((1 - t) ** 2 * pts[0] + 2 * (1 - t) * t * pts[1] + t * t * pts[2])
        else:
            out.append((1 - t) ** 3 * pts[0] + 3 * (1 - t) ** 2 * t * pts[1] + 3 * (1 - t) * t * t * pts[2]
                       + t ** 3 * pts[3])
    return out


def polar(r, deg, z=0.0):
    a = RAD(deg)
    return Vector((r * math.cos(a), r * math.sin(a), z))


# =============================================================== primitives
def lathe(profile, segs, mod=None, phase=0.0, cap_bottom=False, cap_top=False, tag=None):
    """Revolve [(r, z), ...] (bottom to top) around Z. r = 0 makes a pole.
    mod(theta, ring_index) scales the radius; tag(band, seg) labels faces (band -1 / len = caps)."""
    verts, rings = [], []
    for i, (r, z) in enumerate(profile):
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
            continue
        ring = []
        for s in range(segs):
            th = phase + TAU * s / segs
            rr = r * (mod(th, i) if mod else 1.0)
            ring.append(len(verts))
            verts.append((rr * math.cos(th), rr * math.sin(th), z))
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        if len(lo) == 1 and len(up) == 1:
            continue
        for s in range(segs):
            t = tag(b, s) if tag else 0
            if len(lo) == 1:
                faces.append((lo[0], up[(s + 1) % segs], up[s]))
            elif len(up) == 1:
                faces.append((lo[s], lo[(s + 1) % segs], up[0]))
            else:
                faces.append((lo[s], lo[(s + 1) % segs], up[(s + 1) % segs], up[s]))
            tags.append(t)
    if cap_bottom and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
        tags.append(tag(-1, 0) if tag else 0)
    if cap_top and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
        tags.append(tag(len(rings), 0) if tag else 0)
    return Geo(verts, faces, tags)


def tube(path, radius, sides=6, flatten=1.0, ang0=0.0, cap_start=False, cap_end=False, tag=None):
    """Sweep a circle along a polyline. radius may be a list; 0 makes a point."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    radii = list(radius) if isinstance(radius, (list, tuple)) else [radius] * n
    tangents = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    ref = UP if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = (ref - tangents[0] * ref.dot(tangents[0])).normalized()
    frames = []
    for i in range(n):
        if i:
            nrm = tangents[i - 1].rotation_difference(tangents[i]) @ nrm
            nrm = (nrm - tangents[i] * nrm.dot(tangents[i])).normalized()
        frames.append((nrm, tangents[i].cross(nrm)))
    verts, rings = [], []
    for i in range(n):
        r = radii[i]
        if r <= 1e-6:
            rings.append([len(verts)])
            verts.append(pts[i])
            continue
        nv, bv = frames[i]
        ring = []
        for s in range(sides):
            a = ang0 + TAU * s / sides
            ring.append(len(verts))
            verts.append(pts[i] + nv * math.cos(a) * r + bv * math.sin(a) * r * flatten)
        rings.append(ring)
    faces, tags = [], []
    for b, (lo, up) in enumerate(zip(rings, rings[1:])):
        t = tag(b) if tag else 0
        for s in range(sides):
            if len(lo) == 1:
                faces.append((lo[0], up[(s + 1) % sides], up[s]))
            elif len(up) == 1:
                faces.append((lo[s], lo[(s + 1) % sides], up[0]))
            else:
                faces.append((lo[s], lo[(s + 1) % sides], up[(s + 1) % sides], up[s]))
            tags.append(t)
    if cap_start and len(rings[0]) > 1:
        faces.append(tuple(reversed(rings[0])))
        tags.append(tag(0) if tag else 0)
    if cap_end and len(rings[-1]) > 1:
        faces.append(tuple(rings[-1]))
        tags.append(tag(max(0, len(rings) - 2)) if tag else 0)
    return Geo(verts, faces, tags)


LATS = (-55, -20, 15, 50)
LATS_LO = (-40, 5, 45)
LATS_MIN = (-30, 30)
LATS5 = (-62, -32, -3, 27, 57)
LATS6 = (-66, -42, -17, 8, 34, 61)


def blob(c, r, segs=12, lats=LATS, wobble=0.0, seed=0, phase=0.0, tag=None):
    """A soft ellipsoid as a lathe with chosen latitude rings (few triangles, round outline)."""
    prof = [(0.0, -1.0)] + [(math.cos(RAD(a)), math.sin(RAD(a))) for a in lats] + [(0.0, 1.0)]
    g = lathe(prof, segs, phase=phase, tag=tag)
    rng = random.Random(seed)
    ph = [rng.uniform(0, TAU) for _ in range(3)]
    c = Vector(c)
    rr = r if isinstance(r, (tuple, list)) else (r, r, r)
    for v in g.verts:
        k = 1 + wobble * math.sin(2.3 * v.x + ph[0]) * math.sin(2.9 * v.y + ph[1]) * math.cos(2.1 * v.z + ph[2])
        v.x, v.y, v.z = c.x + v.x * rr[0] * k, c.y + v.y * rr[1] * k, c.z + v.z * rr[2] * k
    return g.outward()


def _inside(p, b, margin=0.985):
    c, r = b['c'], b['r']
    return ((p[0] - c[0]) / r[0]) ** 2 + ((p[1] - c[1]) / r[1]) ** 2 + ((p[2] - c[2]) / r[2]) ** 2 < margin * margin


def canopy(piece, blobs, wobble=0.04, floor=None, seed=7, keep_floor=False, material=None):
    """Overlapping soft blobs as one surface: faces buried inside other blobs are dropped.
    Each blob: dict(c, r=(rx, ry, rz), segs, m, lats?, phase?, top?, split?) where `top` is a second
    material for latitude bands >= split (a lighter sunlit cap)."""
    for b in blobs:
        b['r'] = tuple(b['r']) if isinstance(b['r'], (tuple, list)) else (b['r'],) * 3
    for i, b in enumerate(blobs):
        lats = b.get('lats', LATS)
        split = b.get('split', len(lats) - 1)
        g = blob(b['c'], b['r'], b.get('segs', 12), lats, wobble, seed + i, b.get('phase', 0.0),
                 tag=lambda band, s, split=split: 1 if band >= split else 0)
        if floor is not None:
            for v in g.verts:
                v.z = max(v.z, floor)
        others = [o for j, o in enumerate(blobs) if j != i]

        def visible(f, g, others=others):
            vs = [g.verts[k] for k in f]
            if floor is not None and not keep_floor and all(v.z <= floor + 1e-4 for v in vs):
                return False
            if any(all(_inside(v, o) for v in vs) for o in others):
                return False
            centre = sum(vs, Vector()) / len(vs)
            return not all(any(_inside(v, o, 0.93) for o in others) for v in vs + [centre])
        kept = g.keep(visible)
        if material is not None:  # material(face_centre, face_normal) -> material, e.g. a shaded underside
            kept.retag(lambda c, n, t: material(c, n))
            piece.add(kept, None)
        else:
            piece.add(kept, {0: b['m'], 1: b.get('top', b['m'])})
    return blobs


def surface_point(b, direction, lift=0.0):
    d = Vector(direction).normalized()
    c, r = Vector(b['c']), b['r'] if isinstance(b['r'], (tuple, list)) else (b['r'],) * 3
    k = 1 / math.sqrt((d.x / r[0]) ** 2 + (d.y / r[1]) ** 2 + (d.z / r[2]) ** 2)
    p = c + d * k
    n = Vector(((p.x - c.x) / r[0] ** 2, (p.y - c.y) / r[1] ** 2, (p.z - c.z) / r[2] ** 2)).normalized()
    return p + n * lift, n


def ico0(radius, center=(0, 0, 0), squash=1.0):
    """20-triangle icosahedron: berries, pebbles, sparkles."""
    t = (1 + 5 ** 0.5) / 2
    raw = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
           (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
             (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5),
             (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    c = Vector(center)
    verts = []
    for v in raw:
        n = Vector(v).normalized() * radius
        verts.append(c + Vector((n.x, n.y, n.z * squash)))
    return Geo(verts, faces).outward()


def ico(radius, center=(0, 0, 0), subdiv=1, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    verts = [Vector((v.co.x * radius * scale[0], v.co.y * radius * scale[1], v.co.z * radius * scale[2])) + Vector(center)
             for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return Geo(verts, faces).outward()


def octa(radius, center=(0, 0, 0), squash=1.0):
    c = Vector(center)
    verts = [c + Vector(v) * radius for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, squash),
                                              (0, 0, -squash))]
    faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    return Geo(verts, faces).outward()


def rbox(size, r=0.05, m=1, center=(0, 0, 0)):
    """A rounded box: flat faces with 2*m-segment rounded edges and corners (m=1: 108 triangles)."""
    h = [size[0] / 2, size[1] / 2, size[2] / 2]
    r = min(r, min(h) * 0.95)

    def coords(hh):
        e = r / hh
        inner = 1 - e
        pts = [-1.0] + [-1 + e * j / m for j in range(1, m)] + [-inner, inner] + \
              [inner + e * j / m for j in range(1, m)] + [1.0]
        return pts
    verts, index, faces = [], {}, []

    def vid(cpt):
        key = tuple(round(x, 6) for x in cpt)
        if key not in index:
            w = [cpt[i] * h[i] for i in range(3)]
            q = [max(-(h[i] - r), min(h[i] - r, w[i])) for i in range(3)]
            d = Vector([w[i] - q[i] for i in range(3)])
            p = Vector(q) + d.normalized() * r if d.length > 1e-9 else Vector(w)
            index[key] = len(verts)
            verts.append(p + Vector(center))
        return index[key]
    for a in range(3):
        u, w = (a + 1) % 3, (a + 2) % 3
        cu, cw = coords(h[u]), coords(h[w])
        for sign in (-1, 1):
            grid = []
            for gu in cu:
                row = []
                for gw in cw:
                    p = [0.0, 0.0, 0.0]
                    p[a], p[u], p[w] = float(sign), gu, gw
                    row.append(vid(p))
                grid.append(row)
            for i in range(len(cu) - 1):
                for j in range(len(cw) - 1):
                    q = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])
                    faces.append(q if sign > 0 else tuple(reversed(q)))
    return Geo(verts, faces)


def rcyl(r, h, bev=0.03, segs=12, z0=0.0, r_top=None, arc=2, cap_bottom=True):
    """A cylinder (or cone frustum) with rounded rims, base at z0."""
    rt = r if r_top is None else r_top
    b = min(bev, h * 0.45, r * 0.45, rt * 0.45)
    prof = [(0.0, z0)] if cap_bottom else []
    for k in range(arc + 1):
        a = RAD(90) * k / arc
        prof.append((r - b + b * math.sin(a), z0 + b - b * math.cos(a)))
    for k in range(arc + 1):
        a = RAD(90) * k / arc
        prof.append((rt - b + b * math.cos(a), z0 + h - b + b * math.sin(a)))
    prof.append((0.0, z0 + h))
    return lathe(prof, segs)


def leaf(length, width, segs=3, shape='leaf', fold=0.3, bend=0.0):
    """A leaf sheet from the origin along +Y, upper surface +Z (double-sided material)."""
    shapes = {
        'leaf': lambda t: math.sin(math.pi * t ** 0.8) ** 0.85,
        'round': lambda t: math.sin(math.pi * t ** 0.9) ** 0.45,
        'heart': lambda t: math.sin(math.pi * t ** 0.65) ** 0.5,
        'blade': lambda t: (1 - t) ** 0.7,
        'frond': lambda t: math.sin(math.pi * t ** 0.7) ** 0.6,
    }
    fn = shapes[shape] if isinstance(shape, str) else shape
    verts, rows = [], []
    for i in range(segs + 1):
        t = i / segs
        y = t * length
        wd = 0.5 * width * fn(t)
        z = bend * length * t * t
        if wd < 1e-4:
            rows.append([len(verts)])
            verts.append((0.0, y, z))
        else:
            e = z + fold * wd
            rows.append([len(verts), len(verts) + 1, len(verts) + 2])
            verts += [(-wd, y, e), (0.0, y, z), (wd, y, e)]
    faces = []
    for ra, rb in zip(rows, rows[1:]):
        if len(ra) == 1 and len(rb) == 3:
            faces += [(ra[0], rb[1], rb[0]), (ra[0], rb[2], rb[1])]
        elif len(ra) == 3 and len(rb) == 3:
            faces += [(ra[0], ra[1], rb[1], rb[0]), (ra[1], ra[2], rb[2], rb[1])]
        elif len(ra) == 3 and len(rb) == 1:
            faces += [(ra[0], ra[1], rb[0]), (ra[1], ra[2], rb[0])]
    # Faces wind so the normal points to +Z (top).
    g = Geo(verts, faces)
    fixed = []
    for f in g.faces:
        a, b, c = (g.verts[i] for i in f[:3])
        fixed.append(f if (b - a).cross(c - a).z >= 0 else tuple(reversed(f)))
    g.faces = fixed
    return g


def disc(outline, dome=0.0, back=None, rings=1):
    """A fan over a CCW outline in XY, domed toward +Z; back adds an underside point at -back."""
    n = len(outline)
    cx, cy = sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n
    verts = [(cx, cy, dome)]
    ids = [[0]]
    for k in range(1, rings + 1):
        f = k / rings
        row = []
        for x, y in outline:
            row.append(len(verts))
            verts.append((cx + (x - cx) * f, cy + (y - cy) * f, dome * (1 - f * f)))
        ids.append(row)
    faces = [(0, ids[1][i], ids[1][(i + 1) % n]) for i in range(n)]
    for k in range(1, rings):
        a, b = ids[k], ids[k + 1]
        faces += [(a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]) for i in range(n)]
    if back is not None:
        cb = len(verts)
        verts.append((cx, cy, -back))
        faces += [(cb, ids[-1][(i + 1) % n], ids[-1][i]) for i in range(n)]
    return Geo(verts, faces)


def slab(outline, layers, z_back=None, z_front=None):
    """A puffy slab: outline rings [(scale, z), ...] bottom to top, closed by centre fans."""
    n = len(outline)
    cx, cy = sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n
    verts, rings = [], []
    for s, z in layers:
        row = []
        for x, y in outline:
            row.append(len(verts))
            verts.append((cx + (x - cx) * s, cy + (y - cy) * s, z))
        rings.append(row)
    zb = layers[0][1] if z_back is None else z_back
    zf = layers[-1][1] if z_front is None else z_front
    cb, cf = len(verts), len(verts) + 1
    verts += [(cx, cy, zb), (cx, cy, zf)]
    faces = [(cb, rings[0][(i + 1) % n], rings[0][i]) for i in range(n)]
    for lo, up in zip(rings, rings[1:]):
        faces += [(lo[i], lo[(i + 1) % n], up[(i + 1) % n], up[i]) for i in range(n)]
    faces += [(rings[-1][i], rings[-1][(i + 1) % n], cf) for i in range(n)]
    return Geo(verts, faces).outward()


def circle(n, r, phase=0.0, sx=1.0, sy=1.0):
    return [(r * sx * math.cos(phase + TAU * i / n), r * sy * math.sin(phase + TAU * i / n)) for i in range(n)]


def lobed(lobes, per, r_in, r_out, power=0.7, phase=0.0):
    pts = []
    for i in range(lobes * per):
        th = phase + TAU * i / (lobes * per)
        k = abs(math.cos(lobes * (th - phase) / 2)) ** power
        r = r_in + (r_out - r_in) * k
        pts.append((r * math.cos(th), r * math.sin(th)))
    return pts


def star_outline(points, outer, inner, phase=math.pi / 2, round_tips=0):
    pts = []
    for i in range(points * 2):
        r = outer if i % 2 == 0 else inner
        th = phase + math.pi * i / points
        pts.append((r * math.cos(th), r * math.sin(th)))
    return pts


def crystal(base, height, radius, tilt=(0.0, 0.0), sides=5, spin=0.0, tip=0.35):
    """A faceted crystal prism with a pointed top."""
    prof = [(radius * 0.8, 0.0), (radius, height * 0.12), (radius * 0.92, height * (1 - tip)), (0.0, height)]
    g = lathe(prof, sides, phase=spin, cap_bottom=True)
    return g.transformed(Matrix.Translation(Vector(base)) @ Euler((tilt[0], tilt[1], 0)).to_matrix().to_4x4())


# ===================================================================== stats
def gltf_vec(v):
    return [v[0], v[2], -v[1]]


def subtree(obj):
    out = [obj]
    for c in obj.children:
        out += subtree(c)
    return out


def root_stats(root):
    tris, pts, mats, children = 0, [], [], []
    for o in subtree(root):
        if o is not root:
            children.append(re.sub(r'\.\d{3}$', '', o.name))
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        mw = o.matrix_world
        pts += [mw @ v.co for v in me.vertices]
        for m in me.materials:
            if m and m.name not in mats:
                mats.append(m.name)
    if pts:
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
    else:
        lo = hi = [0, 0, 0]
    size = [round(hi[0] - lo[0], 3), round(hi[2] - lo[2], 3), round(hi[1] - lo[1], 3)]
    return dict(tris=tris, size=size, materials=sorted(mats), children=children,
                min_y=round(lo[2], 3), max_y=round(hi[2], 3))


def report(stats):
    for name, s in stats.items():
        print(f"  {name:22s} {s['tris']:5d} tris  size x{s['size'][0]:.2f} y{s['size'][1]:.2f} z{s['size'][2]:.2f}"
              f"  y {s['min_y']:.2f}..{s['max_y']:.2f}  {s['materials']}  {s['children']}")


# ==================================================================== export
def fix_glb_names(path):
    """Strip Blender's .001 suffixes from node and mesh names in the GLB JSON chunk."""
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, version, _ = struct.unpack_from('<III', data, 0)
    jlen, jtype = struct.unpack_from('<II', data, 12)
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    rest = data[20 + jlen:]
    for key in ('nodes', 'meshes'):
        for item in doc.get(key, []):
            if 'name' in item:
                item['name'] = re.sub(r'\.\d{3}$', '', item['name'])
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', magic, version, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), jtype) + js + rest
    with open(path, 'wb') as fh:
        fh.write(out)
    return len(out)


def repack_glb(path):
    """Lossless: gather every vertex attribute into one ARRAY_BUFFER view and every index list into one
    ELEMENT_ARRAY_BUFFER view (the exporter writes one view per accessor, about 65 bytes of JSON each)."""
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, version, _ = struct.unpack_from('<III', data, 0)
    jlen, jtype = struct.unpack_from('<II', data, 12)
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    blen = struct.unpack_from('<I', data, 20 + jlen)[0]
    binary = data[28 + jlen:28 + jlen + blen]
    if len(doc.get('bufferViews', [])) <= 2 or any(a.get('sparse') for a in doc['accessors']):
        return len(data)
    index_ids = {p['indices'] for m in doc['meshes'] for p in m['primitives'] if 'indices' in p}
    sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    parts = {False: bytearray(), True: bytearray()}
    for i, acc in enumerate(doc['accessors']):
        bv = doc['bufferViews'][acc['bufferView']]
        elem = sizes[acc['componentType']] * comps[acc['type']]
        if bv.get('byteStride') not in (None, elem) or (i not in index_ids and elem != 12):
            return len(data)  # interleaved or mixed-size vertex data: leave the file as it is
        start = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
        n = sizes[acc['componentType']] * comps[acc['type']] * acc['count']
        buf = parts[i in index_ids]
        buf.extend(b'\0' * ((4 - len(buf) % 4) % 4))
        acc['byteOffset'] = len(buf)
        acc['bufferView'] = 0 if i not in index_ids else 1
        buf.extend(binary[start:start + n])
    vert, idx = parts[False], parts[True]
    vert.extend(b'\0' * ((4 - len(vert) % 4) % 4))
    doc['bufferViews'] = [dict(buffer=0, byteOffset=0, byteLength=len(vert), byteStride=12, target=34962),
                          dict(buffer=0, byteOffset=len(vert), byteLength=len(idx), target=34963)]
    for acc in doc['accessors']:
        if acc['byteOffset'] == 0:
            del acc['byteOffset']
    new_bin = bytes(vert + idx)
    new_bin += b'\0' * ((4 - len(new_bin) % 4) % 4)
    doc['buffers'] = [dict(byteLength=len(new_bin))]
    js = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(new_bin)
    out = (struct.pack('<III', magic, version, total) + struct.pack('<II', len(js), jtype) + js
           + struct.pack('<II', len(new_bin), 0x004E4942) + new_bin)
    with open(path, 'wb') as fh:
        fh.write(out)
    return len(out)


def export(roots, filename):
    path = os.path.join(MODELS, filename)
    style.export_roots(roots, path)
    fix_glb_names(path)
    return path, repack_glb(path)


def read_glb(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + jlen].decode('utf-8'))


def write_manifest(filename, size, stats, extra=None):
    os.makedirs(MANIFESTS, exist_ok=True)
    doc = dict(file=filename, bytes=size, roots={n: dict(tris=s['tris'], size=s['size'], materials=s['materials'],
                                                         children=s['children']) for n, s in stats.items()})
    if extra:
        doc.update(extra)
    path = os.path.join(MANIFESTS, os.path.splitext(filename)[0] + '.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as fh:
        json.dump(doc, fh, indent=2)
        fh.write('\n')
    return path


# =================================================================== preview
def _eevee(samples=32):  # noqa: E302
    ee = bpy.context.scene.eevee
    for attr, value in (('taa_render_samples', samples), ('use_gtao', True), ('gtao_distance', 0.5),
                        ('use_shadows', True)):
        try:
            setattr(ee, attr, value)
        except (AttributeError, TypeError):
            pass


def label(text, loc, size=0.28, color='#1A2340'):
    cu = bpy.data.curves.new('Label', 'FONT')
    cu.body = text
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.size = size
    obj = bpy.data.objects.new('Label', cu)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat('Label ink', color, 0.9))
    obj.location = loc
    obj.rotation_euler = (RAD(90 - 42.16), 0, 0)
    return obj


def view_axes():
    el = RAD(42.16)
    return Vector((1, 0, 0)), Vector((0, math.sin(el), math.cos(el)))


def frame(objs, width_px=2000, margin=0.35, aspect=(0.3, 1.0)):
    """Fit the scene's game camera (style.game_camera offset, orthographic) around objects."""
    bpy.context.view_layer.update()
    right, up = view_axes()
    us, vs = [], []
    for o in objs:
        if o.type == 'MESH':
            pts = [o.matrix_world @ v.co for v in o.data.vertices]
        elif o.type == 'FONT':
            half_w = o.data.size * 0.3 * max(len(line) for line in o.data.body.splitlines())
            half_h = o.data.size * 0.8
            pts = [o.location + Vector((sx * half_w, 0, 0)) + up * (sy * half_h) for sx in (-1, 1) for sy in (-1, 1)]
        else:
            pts = [o.matrix_world.translation]
        us += [p.dot(right) for p in pts]
        vs += [p.dot(up) for p in pts]
    u0, u1, v0, v1 = min(us) - margin, max(us) + margin, min(vs) - margin, max(vs) + margin
    w, h = u1 - u0, v1 - v0
    a = max(aspect[0], min(aspect[1], h / w))
    res = (width_px, int(round(width_px * a / 2)) * 2)
    ortho = max(w, h / a)
    cam = bpy.context.scene.camera
    cam.data.ortho_scale = ortho
    cam.location = Vector((0, -25.4, 23.0)) + right * ((u0 + u1) / 2) + up * ((v0 + v1) / 2)
    bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = res
    return cam


def preview_light(ground='#5FCB45', res=(2000, 1200), exposure=-0.55, world=0.6):
    """style.studio() light, toned down: the game lights with a hemisphere + sun and a toon ramp,
    so a dimmer world and lower exposure read closer to the browser than the raw studio."""
    style.studio(ground_color=ground, size=res)
    scene = bpy.context.scene
    scene.view_settings.exposure = exposure
    bg = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Strength'].default_value = world
    _eevee(32)
    if scene.camera is None:
        style.game_camera()


def contact_sheet(cells, path, cols, pitch=(3.0, 3.0), width_px=2400, label_size=0.24, label_dy=None,
                  ground='#5FCB45', below=None):
    """Lay roots out on a grid (row 0 at the back / top of the image) with a label in front of each,
    render through the game camera under style.studio() light. Returns the placed objects."""
    rows = math.ceil(len(cells) / cols)
    px, py = pitch
    ldy = label_dy if label_dy is not None else py * 0.42
    placed = []
    for i, cell in enumerate(cells):
        if cell is None:
            continue
        obj, text = cell
        c, r = i % cols, i // cols
        x = (c - (cols - 1) / 2) * px
        y = ((rows - 1) / 2 - r) * py
        obj.location = (x, y, 0)
        placed += [o for o in subtree(obj)]
        placed.append(label(text, (x, y - ldy, label_size * 0.9), label_size))
    # Big roots (below=[(obj, text, depth)]) go in their own rows under the grid, centred.
    y_edge = ((rows - 1) / 2 - (rows - 1)) * py - py * 0.5
    for obj, text, depth in (below or []):
        y = y_edge - depth / 2 - 0.6
        obj.location = (0, y, 0)
        placed += [o for o in subtree(obj)]
        placed.append(label(text, (0, y - depth / 2 - 0.5, label_size * 0.9), label_size))
        y_edge = y - depth / 2 - 1.4
    preview_light(ground)
    frame(placed, width_px, margin=0.6)
    style.render(path)
    return placed


def place_copy(obj, loc, rz=0.0, scale=1.0):
    """A linked duplicate of a root (and its children) for scene previews."""
    def dup(o, parent):
        n = o.copy()
        bpy.context.scene.collection.objects.link(n)
        if parent is not None:
            n.parent = parent
        for c in o.children:
            dup(c, n)
        return n
    n = dup(obj, None)
    n.location = loc
    n.rotation_euler = (0, 0, rz)
    n.scale = (scale, scale, scale)
    return n


def aim(target, ortho, res=None):
    """Point the scene's game camera at `target` (same offset as style.game_camera)."""
    cam = bpy.context.scene.camera
    tx, ty, tz = target
    cam.location = (tx, ty - 25.4, tz + 23.0)
    cam.data.ortho_scale = ortho
    if res:
        bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = res
    return cam


def cbox(size, r=0.03, center=(0, 0, 0)):
    """A chamfered box (one bevel segment on every edge): 44 triangles, soft under smooth shading."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    r = min(r, min(size) * 0.45)
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=r, offset_type='OFFSET', segments=1,
                    profile=0.5, affect='EDGES', clamp_overlap=True)
    bm.verts.index_update()
    verts = [v.co.copy() + Vector(center) for v in bm.verts]
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return Geo(verts, faces).outward()
