"""Check the cast GLBs (whale, keeper, crew, gloom, hives) against docs/ART-CONTRACT.md, then re-import them in
Blender, ray-cast Bao's deck and render a pose check (art/previews/cast-pose-check.png) that swings every pivot.

    blender -b --factory-startup --python art/blender/kit/verify_cast.py -- [--render]

Exits 1 on any failure. JSON checks: root and child names, parents, node transforms (translation only), pivots,
material names (pal_* / glow_* / gloom_crystal*), triangle budgets, sizes, total bytes.
"""
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import style  # noqa: E402
from kit_cast import MODELS, PREVIEWS, args, camera, label, setup_render  # noqa: E402

PERSON = ['body', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r']
CREW = ['nana', 'pip', 'olla', 'kai', 'mina', 'coal', 'tam', 'ria', 'juno', 'bram']
FOLK = ['folk_a', 'folk_b']
EXPECT = {
    'whale.glb': {'whale': (14000, {'body': None, 'tail': None, 'fin_l': None, 'fin_r': None, 'eye_l': None,
                                    'eye_r': None, 'mouth': None, 'blowhole': None, 'tailtip': 'tail'})},
    'keeper.glb': {'keeper': (3000, dict({p: None for p in PERSON}, mallet='arm_r'))},
    'crew.glb': dict({n: (2500, {p: None for p in PERSON}) for n in CREW}, **{n: (2000, {p: None for p in PERSON}) for n in FOLK}),
    'gloom.glb': dict(
        {n: (1500, {'shell': None, 'eye': None}) for n in ('gloomling', 'spitter', 'brute')},
        flyer=(1500, {'shell': None, 'eye': None, 'wing_l': None, 'wing_r': None}),
        spire=(1200, {'shell': None, 'eye': None}),
        puffbun=(1500, {'body': None}), hopfrog=(1500, {'body': None}), rockgoat=(1500, {'body': None}),
        skylark=(1500, {'body': None, 'wing_l': None, 'wing_r': None}),
        cage=(900, {'shell': None}),
        plank=(300, {'body': None}),
        shellback=(1500, {'shell': None, 'eye': None}),
        puffcap=(1200, {'shell': None, 'cap': None, 'eye': None}),
        pebbleturtle=(1500, {'body': None}), mushpup=(1500, {'body': None}),
        gloom_beast=(7000, {'crust': None, 'body': None, 'eye_l': None, 'eye_r': None, 'tail': None, 'fin_l': None, 'fin_r': None}),
        gloom_raider=(3000, {'crust': None, 'body': None, 'eye': None, 'fin_l': None, 'fin_r': None, 'tail': None})),
    'hives.glb': dict(
        thornhive=(6000, {'shell': None, 'eye': None}),
        clamhive=(6000, {'shell_top': None, 'shell_bottom': None, 'pearl': None}),
        forgehive=(6000, {'body': None, 'head': None, 'arm_l': None, 'arm_r': None}),
        greyheart=(6000, dict({'core': None, 'shell': None}, **{f'shard_{i}': None for i in range(6)})),
        note=(6000, {}),
        hushbell=(5000, {'arch': None, 'ice': None, 'bell': None, 'clapper': 'bell'}),
        echo_bell=(600, {'post': None, 'bell': None}),
        captain_barnacle=(5000, {'body': None, 'eye': None, 'hat': None, 'claw_l': None, 'claw_r': None,
                                 'anchor': 'claw_r'}),
        coilwyrm=(5000, {'coil': None, 'head': None, 'knot_0': None, 'knot_1': None, 'knot_2': None})),
}
SIZE = {  # root: (axis index, lo, hi) in glTF metres
    'whale': [(2, 21.0, 23.5), (0, 8.8, 16.0)], 'keeper': [(1, 1.05, 1.2)],
    'gloomling': [(0, 0.7, 0.9)], 'spitter': [(0, 0.8, 1.0)], 'brute': [(1, 1.5, 1.8), (2, 1.9, 2.5)],
    'flyer': [(0, 1.3, 1.6)], 'spire': [(1, 3.4, 3.6)], 'puffbun': [(0, 0.45, 0.6)], 'hopfrog': [(0, 0.4, 0.62)],
    'rockgoat': [(1, 0.85, 1.0)], 'skylark': [(2, 0.35, 0.55)], 'cage': [(1, 1.95, 2.05), (0, 1.35, 1.5)],
    'thornhive': [(1, 4.8, 5.3)], 'clamhive': [(0, 4.8, 5.3)], 'forgehive': [(1, 4.8, 5.2)],
    'greyheart': [(1, 5.4, 6.4)], 'note': [(1, 0.55, 0.65)],
    'plank': [(2, 3.2, 3.5), (0, 0.78, 1.05)],
    'shellback': [(2, 1.0, 1.45)], 'puffcap': [(1, 0.85, 1.05)], 'pebbleturtle': [(0, 0.4, 0.7)],
    'mushpup': [(1, 0.5, 0.7)], 'gloom_beast': [(2, 28.0, 36.0)], 'gloom_raider': [(2, 6.8, 8.2)],
    'hushbell': [(1, 6.5, 7.5)], 'echo_bell': [(1, 1.55, 1.7)], 'captain_barnacle': [(1, 2.6, 3.2)],
    'coilwyrm': [(1, 3.2, 3.9), (0, 3.8, 4.8)], 'folk_a': [(1, 1.0, 1.2)], 'folk_b': [(1, 0.7, 0.8)],
}
for n in CREW:
    SIZE[n] = [(1, 0.95, 1.2)]
TOTAL_LIMIT = 1_900_000
FAIL = []


def fail(msg):
    FAIL.append(msg)
    print('  FAIL', msg)


def load(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    blen = struct.unpack_from('<I', data, 20 + jlen)[0]
    return doc, data[28 + jlen:28 + jlen + blen]


def positions(doc, binc, acc_i):
    acc = doc['accessors'][acc_i]
    view = doc['bufferViews'][acc['bufferView']]
    base = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = view.get('byteStride', 12)
    return [struct.unpack_from('<3f', binc, base + i * stride) for i in range(acc['count'])]


def check_file(fname):
    path = os.path.join(MODELS, fname)
    doc, binc = load(path)
    nodes = doc['nodes']
    parent = {}
    for i, nd in enumerate(nodes):
        for c in nd.get('children', []):
            parent[c] = i
        for key in ('rotation', 'scale', 'matrix'):
            if key in nd and key != 'scale':
                if key == 'rotation' and max(abs(a - b) for a, b in zip(nd[key], (0, 0, 0, 1))) > 1e-5:
                    fail(f'{fname}: node {nd.get("name")} has a rotation')
            if key == 'scale' and key in nd and max(abs(a - 1) for a in nd[key]) > 1e-5:
                fail(f'{fname}: node {nd.get("name")} has a scale')
    roots = [doc['scenes'][0]['nodes']][0]
    by_root = {}
    for r in roots:
        by_root[nodes[r]['name']] = r
    exp = EXPECT[fname]
    if set(by_root) != set(exp):
        fail(f'{fname}: roots {sorted(by_root)} != {sorted(exp)}')
    mats = [m.get('name', '') for m in doc.get('materials', [])]
    for m in mats:
        if not (m.startswith('pal_') or m.startswith('glow_') or m in ('gloom_crystal', 'gloom_crystal_clear')):
            fail(f'{fname}: material {m!r} is not a palette/glow/gloom name')
    print(f'== {fname}  {os.path.getsize(path)} bytes  materials: {", ".join(sorted(mats))}')

    def world(i):
        t = Vector(nodes[i].get('translation', (0, 0, 0)))
        return t + world(parent[i]) if i in parent else t

    def subtree(i):
        out = [i]
        for c in nodes[i].get('children', []):
            out += subtree(c)
        return out
    report = {}
    for rname, (budget, kids) in exp.items():
        if rname not in by_root:
            continue
        ri = by_root[rname]
        tree = subtree(ri)
        names = {nodes[i].get('name'): i for i in tree if i != ri}
        for k, par in kids.items():
            if k not in names:
                fail(f'{fname}: {rname} has no child {k}')
                continue
            want = by_root[rname] if par is None else names.get(par)
            if parent.get(names[k]) != want:
                fail(f'{fname}: {rname}/{k} parent is {nodes[parent.get(names[k], ri)].get("name")}, want {par or rname}')
        tris = 0
        lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
        for i in tree:
            if 'mesh' in nodes[i]:
                w = world(i)
                for prim in doc['meshes'][nodes[i]['mesh']]['primitives']:
                    tris += doc['accessors'][prim['indices']]['count'] // 3
                    acc = doc['accessors'][prim['attributes']['POSITION']]
                    lo = Vector([min(a, b + c) for a, b, c in zip(lo, acc['min'], w)])
                    hi = Vector([max(a, b + c) for a, b, c in zip(hi, acc['max'], w)])
        size = hi - lo
        ok = tris <= budget
        if not ok:
            fail(f'{fname}: {rname} has {tris} tris > {budget}')
        for axis, a, b in SIZE.get(rname, []):
            if not a <= size[axis] <= b:
                fail(f'{fname}: {rname} size[{"xyz"[axis]}] = {size[axis]:.2f} outside {a}..{b}')
        piv = {nodes[i]['name']: [round(x, 3) for x in world(i)] for i in tree if i != ri}
        report[rname] = dict(tris=tris, size=[round(x, 3) for x in size], pivots=piv)
        print(f'   {rname:12s} {tris:5d}/{budget} tris  size {[round(x, 2) for x in size]}')
        for n, p in piv.items():
            print(f'       {n:12s} {p}')
    return os.path.getsize(path), report, doc, binc


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def find(objs, root, name):
    r = next(o for o in objs if o.name.split('.')[0] == root and o.parent is None)

    def walk(o):
        for c in o.children:
            if c.name.split('.')[0] == name:
                return c
            hit = walk(c)
            if hit is not None:
                return hit
        return None
    return walk(r) if name != root else r


def deck_check(objs):
    body = find(objs, 'whale', 'body')
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    lo, hi, n = 1e9, -1e9, 0
    inv = body.matrix_world.inverted()
    for i in range(-22, 23):
        for j in range(-40, 41):
            x, z = 4.4 * i / 22, 8.0 * j / 40
            if (x / 4.4) ** 2 + (z / 8.0) ** 2 > 1:
                continue
            o = inv @ Vector((x, -z, 30.0))           # glTF (x, ., z) -> Blender (x, -z, .)
            d = (inv.to_3x3() @ Vector((0, 0, -1))).normalized()
            ok, loc, _, _ = body.ray_cast(o, d)
            if ok:
                y = (body.matrix_world @ loc).z
                lo, hi, n = min(lo, y), max(hi, y), n + 1
    print(f'== whale deck (re-imported GLB): {n} rays inside the walk ellipse, top y min {lo:.3f} max {hi:.3f}')
    if n < 2000 or lo < -0.15 or hi > 0.15:
        fail(f'whale deck outside y = 0 +- 0.15 (min {lo:.3f}, max {hi:.3f}, {n} hits)')


def top_check(objs, root, part, xs, zs, want=0.0, tol=0.012):
    """Ray-cast a node from above at glTF (x, z) points; its top must sit at y = want."""
    o = find(objs, root, part)
    bpy.context.view_layer.update()
    inv = o.matrix_world.inverted()
    ys = []
    for x in xs:
        for z in zs:
            ok, loc, _, _ = o.ray_cast(inv @ Vector((x, -z, 30.0)), (inv.to_3x3() @ Vector((0, 0, -1))).normalized())
            if ok:
                ys.append((o.matrix_world @ loc).z)
    lo, hi = (min(ys), max(ys)) if ys else (None, None)
    print(f'== {root}/{part} top over {len(ys)} rays: min {lo} max {hi} (want {want})')
    if not ys or abs(lo - want) > tol or abs(hi - want) > tol:
        fail(f'{root}/{part} top is not at y = {want}: {lo}..{hi}')


def rail_gaps(objs):
    """The galleon's side rails: present at z = -3 and 3, open in the 2 m gaps at z = -6, 0 and 6 (both sides)."""
    o = find(objs, 'gloom_beast', 'body')
    inv = o.matrix_world.inverted()
    for deg, rail in ((40, False), (90, False), (140, False), (-40, False), (-90, False), (-140, False),
                      (0, True), (180, True), (65, True), (-65, True), (115, True), (-115, True)):
        a = math.radians(deg)
        for side in (1,):
            x, z = 6.65 * math.sin(a), 9.85 * math.cos(a)
            y = None
            for da in (-0.06, -0.03, 0.0, 0.03, 0.06):   # the rope is thin: probe a short stretch of the rail line
                xx, zz = 6.65 * math.sin(a + da), 9.85 * math.cos(a + da)
                for dr in (-0.05, 0.0, 0.05):
                    ok, loc, _, _ = o.ray_cast(inv @ Vector((xx * (1 + dr / 6.65), -zz * (1 + dr / 9.85), 30.0)),
                                               (inv.to_3x3() @ Vector((0, 0, -1))).normalized())
                    if ok:
                        yy = (o.matrix_world @ loc).z
                        y = yy if y is None else max(y, yy)
            got = y is not None and y > 0.3
            print(f'   rail at {deg:+d} deg: top {y:.3f} -> {"rail" if got else "open"}')
            if y is None or got != rail:
                fail(f'gloom_beast rail check at z {z}, side {side}: top {y}, want {"rail" if rail else "gap"}')


def pose(o, rx=0.0, ry=0.0, rz=0.0, sy=None):
    """Rotate a node by glTF Euler angles (glTF X = Blender X, glTF Y = Blender Z, glTF Z = Blender -Y)."""
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (rx, -rz, ry)
    if sy is not None:
        o.scale = (1, 1, sy)


def pose_render(imported):
    """Swing every hinge: the tail up, fins flapped, an eye blinking, the keeper mid-swing, the clam open."""
    for o in bpy.data.objects:
        o.hide_render = True
    shown = []

    def show(objs, root, at):
        r = find(objs, root, root)
        r.location = at
        stack = [r]
        while stack:
            o = stack.pop()
            o.hide_render = False
            stack += list(o.children)
        shown.append((root, at))
        return r
    w = imported['whale.glb']
    show(w, 'whale', (0, 0, 0))
    pose(find(w, 'whale', 'tail'), rx=-0.35)
    pose(find(w, 'whale', 'fin_l'), rz=0.45)
    pose(find(w, 'whale', 'fin_r'), rz=-0.2)
    pose(find(w, 'whale', 'eye_r'), sy=0.15)
    k = imported['keeper.glb']
    show(k, 'keeper', (1.5, -2.0, 0.0))
    pose(find(k, 'keeper', 'arm_r'), rx=-1.4)
    pose(find(k, 'keeper', 'arm_l'), rx=0.5)
    pose(find(k, 'keeper', 'leg_l'), rx=-0.5)
    pose(find(k, 'keeper', 'leg_r'), rx=0.4)
    pose(find(k, 'keeper', 'head'), ry=0.4)
    c = imported['crew.glb']
    show(c, 'nana', (-1.2, -1.0, 0.0))
    pose(find(c, 'nana', 'head'), rz=0.2)
    show(c, 'pip', (-2.6, -3.0, 0.0))
    pose(find(c, 'pip', 'arm_l'), rz=2.4)
    h = imported['hives.glb']
    show(h, 'clamhive', (11.0, 6.0, 0.0))
    pose(find(h, 'clamhive', 'shell_top'), rx=-0.75)
    g = imported['gloom.glb']
    show(g, 'flyer', (-9.0, 4.0, 0.0))
    pose(find(g, 'flyer', 'wing_l'), rz=0.6)
    pose(find(g, 'flyer', 'wing_r'), rz=-0.6)
    show(g, 'skylark', (-7.5, 4.5, 0.0))
    pose(find(g, 'skylark', 'wing_l'), rz=0.7)
    pose(find(g, 'skylark', 'wing_r'), rz=-0.7)
    setup_render((1800, 1100), None)
    cam = camera((1.0, 2.0, -1.5), 31, 38, 30)
    bpy.context.view_layer.update()
    out = os.path.join(PREVIEWS, 'cast-pose-check.png')
    style.render(out)
    print('preview', out)


def main():
    total = 0
    reports = {}
    for f in EXPECT:
        size, rep, _, _ = check_file(f)
        total += size
        reports[f] = rep
    print(f'== total {total} bytes (limit {TOTAL_LIMIT})')
    if total > TOTAL_LIMIT:
        fail(f'total {total} bytes > {TOTAL_LIMIT}')
    style.reset_scene()
    imported = {}
    for f in EXPECT:
        objs = import_glb(os.path.join(MODELS, f))
        imported[f] = objs
        print(f'   imported {f}: {len(objs)} objects')
    deck_check(imported['whale.glb'])
    top_check(imported['gloom.glb'], 'gloom_raider', 'body', (-1.2, -0.3, 0.6), (-1.5, 0.2, 1.4), tol=0.02)
    top_check(imported['gloom.glb'], 'plank', 'body', (-0.3, -0.05, 0.2), (0.6, 1.6, 2.4))
    top_check(imported['gloom.glb'], 'gloom_beast', 'body', (-4.1, -2.4, -0.9, 0.6, 2.1, 3.6), (-7.0, -5.5, -3.0, -0.5, 1.0, 3.0, 7.0),
              tol=0.035)   # the plank seams are 1.5 cm deep
    rail_gaps(imported['gloom.glb'])
    if '--render' in args():
        pose_render(imported)
    print('RESULT', 'FAIL' if FAIL else 'OK', len(FAIL))
    if FAIL:
        sys.exit(1)


if __name__ == '__main__':
    main()
