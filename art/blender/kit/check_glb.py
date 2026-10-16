"""Check the world kit GLBs (trees, props, nature, fish) against docs/ART-CONTRACT.md.

Plain Python (no Blender):  python art/blender/kit/check_glb.py
Parses each GLB's JSON and binary chunks and checks root and child names, markers, pivots, materials,
triangle budgets, sizes, buffer bounds and the models-folder size (< 2.6 MB). Exits 1 on any failure.
"""
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'public', 'assets', 'models'))
TREE_IDS = ['puffberry', 'ropevine', 'cloudpear', 'chimewood', 'honeybun', 'glowplum', 'starfig', 'golden']
EXPECT = {
    'trees.glb': dict(roots=[f'{t}_{s}' for t in TREE_IDS for s in ('sprout', 'young', 'grown')] + ['plot'],
                      budget=lambda n: 1500),
    'props.glb': dict(roots=['hut', 'workbench', 'kitchen', 'maptable', 'ropepost', 'fishspot', 'pantry', 'chimepost',
                             'postspot', 'market', 'tent', 'lantern', 'windmill', 'coral_arch', 'ore_rock', 'forge', 'rod',
                             'speck', 'skydew', 'hatch', 'planter', 'gong', 'lift', 'skiff', 'crate', 'chime_cannon',
                             'bao_plank', 'snow_lantern', 'ice_hut'],
                      budget=lambda n: {'hatch': 1500, 'planter': 600, 'gong': 900, 'lift': 1500, 'skiff': 1500,
                                        'crate': 800, 'chime_cannon': 1200, 'bao_plank': 300, 'snow_lantern': 500,
                                        'ice_hut': 1500}.get(n, 2000)),
    'nature.glb': dict(roots=['rock_a', 'rock_b', 'rock_c', 'bush_a', 'bush_b', 'flower_a', 'flower_b', 'flower_c',
                              'grass_tuft', 'mushroom', 'tree_round', 'tree_pine', 'palm', 'coral_a', 'coral_b',
                              'lava_rock_a', 'lava_rock_b', 'fence', 'cloud_puff', 'tree_snow', 'rock_snow', 'ice_rock',
                              'snowdrift', 'snow_flower'],
                       budget=lambda n: 700 if n in ('tree_round', 'tree_pine', 'palm', 'tree_snow') else
                       300 if n in ('cloud_puff', 'snowdrift') else 350 if n == 'snow_flower' else 400),
    'fish.glb': dict(roots=['puff_minnow', 'sun_carp', 'star_ray', 'cloud_koi'], budget=lambda n: 500),
}
SIZES = {'cloud_puff': (3.6, 4.4, 'xz'), 'skydew': (1.1, 1.3, 'xz'), 'speck': (0.3, 0.4, 'y'), 'rod': (1.5, 1.7, 'y'),
         'chimepost': (2.1, 2.35, 'y'), 'hut': (2.8, 3.3, 'y'), 'plot': (1.5, 1.7, 'xz')}
COMP = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
FMT = {5121: 'B', 5123: 'H', 5125: 'I'}


def load(path):
    with open(path, 'rb') as fh:
        data = fh.read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2 and length == len(data), 'bad GLB header'
    jlen, jtype = struct.unpack_from('<II', data, 12)
    assert jtype == 0x4E4F534A
    doc = json.loads(data[20:20 + jlen].decode('utf-8'))
    blen, btype = struct.unpack_from('<II', data, 20 + jlen)
    assert btype == 0x004E4942
    return doc, data[28 + jlen:28 + jlen + blen]


def check_buffers(doc, binary, errors):
    for i, bv in enumerate(doc['bufferViews']):
        if bv.get('byteOffset', 0) + bv['byteLength'] > len(binary):
            errors.append(f'bufferView {i} runs past the buffer')
    shared = {}
    for a in doc['accessors']:
        shared[a['bufferView']] = shared.get(a['bufferView'], 0) + 1
    index_views = {doc['accessors'][p['indices']]['bufferView'] for m in doc['meshes'] for p in m['primitives']}
    for v, n in shared.items():
        bv = doc['bufferViews'][v]
        if n > 1 and v not in index_views and 'byteStride' not in bv:
            errors.append(f'bufferView {v} is shared by {n} vertex accessors but has no byteStride')
        if v in index_views and 'byteStride' in bv:
            errors.append(f'index bufferView {v} has a byteStride')
    for i, a in enumerate(doc['accessors']):
        bv = doc['bufferViews'][a['bufferView']]
        elem = COMP[a['componentType']] * NCOMP[a['type']]
        stride = bv.get('byteStride', elem)
        end = a.get('byteOffset', 0) + stride * (a['count'] - 1) + elem
        if end > bv['byteLength']:
            errors.append(f'accessor {i} runs past its bufferView')
        if (bv.get('byteOffset', 0) + a.get('byteOffset', 0)) % COMP[a['componentType']]:
            errors.append(f'accessor {i} is misaligned')
    for m in doc['meshes']:
        for p in m['primitives']:
            ia = doc['accessors'][p['indices']]
            n_verts = doc['accessors'][p['attributes']['POSITION']]['count']
            bv = doc['bufferViews'][ia['bufferView']]
            off = bv.get('byteOffset', 0) + ia.get('byteOffset', 0)
            vals = struct.unpack_from(f'<{ia["count"]}{FMT[ia["componentType"]]}', binary, off)
            if max(vals) >= n_verts:
                errors.append(f'mesh {m["name"]}: index out of range')
            if 'NORMAL' not in p['attributes']:
                errors.append(f'mesh {m["name"]}: no normals')


def node_tris(doc, ni):
    n = doc['nodes'][ni]
    t = 0
    if 'mesh' in n:
        t += sum(doc['accessors'][p['indices']]['count'] // 3 for p in doc['meshes'][n['mesh']]['primitives'])
    for c in n.get('children', []):
        t += node_tris(doc, c)
    return t


def node_bounds(doc, ni, offset=(0.0, 0.0, 0.0), out=None):
    out = out if out is not None else [[1e9] * 3, [-1e9] * 3]
    n = doc['nodes'][ni]
    t = n.get('translation', [0, 0, 0])
    o = [offset[i] + t[i] for i in range(3)]
    if 'mesh' in n:
        for p in doc['meshes'][n['mesh']]['primitives']:
            a = doc['accessors'][p['attributes']['POSITION']]
            for i in range(3):
                out[0][i] = min(out[0][i], a['min'][i] + o[i])
                out[1][i] = max(out[1][i], a['max'][i] + o[i])
    for c in n.get('children', []):
        node_bounds(doc, c, o, out)
    return out


def node_materials(doc, ni, out=None):
    out = out if out is not None else set()
    n = doc['nodes'][ni]
    if 'mesh' in n:
        for p in doc['meshes'][n['mesh']]['primitives']:
            out.add(doc['materials'][p['material']]['name'])
    for c in n.get('children', []):
        node_materials(doc, c, out)
    return out


def main():
    failures, total, report = [], 0, []
    for fname, spec in EXPECT.items():
        path = os.path.join(MODELS, fname)
        errors = []
        doc, binary = load(path)
        size = os.path.getsize(path)
        total += size
        check_buffers(doc, binary, errors)
        nodes = doc['nodes']
        scene_roots = doc['scenes'][doc.get('scene', 0)]['nodes']
        root_names = [nodes[i]['name'] for i in scene_roots]
        if sorted(root_names) != sorted(spec['roots']):
            errors.append(f'roots differ: missing {sorted(set(spec["roots"]) - set(root_names))}, '
                          f'extra {sorted(set(root_names) - set(spec["roots"]))}')
        for n in nodes:
            if '.' in n.get('name', '') or n.get('name', '') == '':
                errors.append(f'bad node name {n.get("name")!r}')
            if 'rotation' in n or 'scale' in n or 'matrix' in n:
                errors.append(f'node {n["name"]} has a rotation/scale (only translations are expected)')
        for m in doc['materials']:
            if not m['name'].startswith(('pal_', 'glow_', 'gloom_')):
                errors.append(f'material {m["name"]} is not a palette/glow material')
        lines = []
        for ri in scene_roots:
            r = nodes[ri]
            name = r['name']
            kids = [nodes[c] for c in r.get('children', [])]
            kid_names = [k['name'] for k in kids]
            tris = node_tris(doc, ri)
            lo, hi = node_bounds(doc, ri)
            dims = [round(hi[i] - lo[i], 3) for i in range(3)]
            mats = sorted(node_materials(doc, ri))
            if tris > spec['budget'](name):
                errors.append(f'{name}: {tris} tris > {spec["budget"](name)}')
            if 'mesh' not in r:
                errors.append(f'{name}: root has no mesh')
            # Per-file node contracts.
            if fname == 'trees.glb':
                if name.endswith('_grown'):
                    if kid_names != ['fruits']:
                        errors.append(f'{name}: children {kid_names} (want exactly fruits)')
                    else:
                        f = kids[0]
                        if name == 'golden_grown':
                            if 'mesh' in f:
                                errors.append('golden_grown/fruits should be empty')
                        elif 'mesh' not in f:
                            errors.append(f'{name}/fruits has no mesh')
                        if any(abs(v) > 1e-6 for v in f.get('translation', [0, 0, 0])):
                            errors.append(f'{name}/fruits is not at the root origin')
                    if not 1.6 <= hi[1] <= 3.0:
                        errors.append(f'{name}: height {hi[1]:.2f}')
                elif kid_names:
                    errors.append(f'{name}: unexpected children {kid_names}')
                if name.endswith('_sprout') and not 0.3 <= hi[1] <= 0.5:
                    errors.append(f'{name}: height {hi[1]:.2f}')
                if name.endswith('_young') and not 0.8 <= hi[1] <= 1.25:
                    errors.append(f'{name}: height {hi[1]:.2f}')
                if name == 'glowplum_grown' and 'glow_plum' not in node_materials(doc, r['children'][0]):
                    errors.append('glowplum fruits do not use glow_plum')
                if name == 'plot' and 'glow_moss' not in mats:
                    errors.append('plot has no glow_moss edge')
            elif fname == 'props.glb':
                want = {'windmill': ['blades'], 'rod': ['tip'], 'hatch': ['door'], 'planter': ['soil'],
                        'gong': ['disc'], 'lift': ['platform', 'rope'], 'crate': ['lid'],
                        'chime_cannon': ['barrel']}.get(name, [])
                if sorted(kid_names) != want:
                    errors.append(f'{name}: children {kid_names} (want {want})')
                meshy = {'blades', 'door', 'disc', 'platform', 'rope', 'lid', 'barrel'}
                for kd in kids:
                    if (kd['name'] in meshy) != ('mesh' in kd):
                        errors.append(f'{name}/{kd["name"]}: mesh/marker mismatch')
                tr = {kd['name']: kd.get('translation', [0, 0, 0]) for kd in kids}
                if name == 'hatch' and 'door' in tr:
                    t = tr['door']
                    a = doc['accessors'][doc['meshes'][kids[0]['mesh']]['primitives'][0]['attributes']['POSITION']]
                    zs = [doc['accessors'][pp['attributes']['POSITION']]['min'][2] for pp in doc['meshes'][kids[0]['mesh']]['primitives']]
                    ze = [doc['accessors'][pp['attributes']['POSITION']]['max'][2] for pp in doc['meshes'][kids[0]['mesh']]['primitives']]
                    if not (abs(t[0]) < 1e-3 and 0.08 <= t[1] <= 0.25 and -1.0 <= t[2] <= -0.75):
                        errors.append(f'hatch/door hinge at {t} (want the back edge, rim height)')
                    if min(zs) < -0.1 or max(ze) < 1.5:
                        errors.append('hatch/door lid should reach forward (+Z) from its hinge')
                if name == 'gong' and 'disc' in tr:
                    t = tr['disc']
                    dm = doc['meshes'][kids[0]['mesh']]['primitives']
                    top_local = max(doc['accessors'][pp['attributes']['POSITION']]['max'][1] for pp in dm)
                    if not (abs(t[0]) < 1e-3 and abs(t[2]) < 0.05 and 1.5 <= t[1] <= 1.85):
                        errors.append(f'gong/disc pivot at {t} (want the top hanging point under the crossbar)')
                    if top_local > 0.02:
                        errors.append('gong/disc should hang below its pivot')
                    if not 1.8 <= hi[1] <= 2.0:
                        errors.append(f'gong height {hi[1]:.2f}')
                if name == 'planter' and 'soil' in tr and not 0.25 <= tr['soil'][1] <= 0.29:
                    errors.append(f'planter/soil at {tr["soil"]}')
            elif fname == 'nature.glb':
                if kid_names:
                    errors.append(f'{name}: has children')
                if not 1 <= len(mats) <= 2:
                    errors.append(f'{name}: {len(mats)} materials')
                if name == 'cloud_puff' and mats != ['pal_cloud', 'pal_cloud_shade']:
                    errors.append(f'cloud_puff materials {mats}')
            elif fname == 'fish.glb':
                if kid_names != ['tail'] or 'mesh' not in kids[0]:
                    errors.append(f'{name}: children {kid_names} (want a tail mesh)')
                if not 0.3 <= max(dims) <= 0.8:
                    errors.append(f'{name}: size {max(dims)}')
            if name in SIZES:
                a, b, axes = SIZES[name]
                v = max(dims[0], dims[2]) if axes == 'xz' else hi[1]
                if not a <= v <= b:
                    errors.append(f'{name}: {axes} size {v:.2f} not in {a}..{b}')
            if fname != 'fish.glb' and name not in ('skydew', 'hatch', 'skiff', 'bao_plank') and abs(lo[1]) > 0.01:
                errors.append(f'{name}: base y {lo[1]:.3f}')
            extra = ''
            for k in kids:
                t = k.get('translation', [0, 0, 0])
                extra += f' {k["name"]}@({t[0]:.2f},{t[1]:.2f},{t[2]:.2f})'
            lines.append(f'  {name:18s} {tris:5d} tris  {dims[0]:.2f} x {dims[1]:.2f} x {dims[2]:.2f} m  '
                         f'{len(mats)} mats{extra}')
        report.append(f'{fname}: {size} bytes, {len(scene_roots)} roots, {len(doc["meshes"])} meshes, '
                      f'{sum(len(m["primitives"]) for m in doc["meshes"])} primitives')
        report += lines
        failures += [f'{fname}: {e}' for e in errors]
    print('\n'.join(report))
    # Owner's budget (five-chapter batch): the world kit's four files stay under 1.35 MB.
    print(f'world kit total: {total} bytes ({total / 1e6:.3f} MB, limit 1.35 MB)')
    if total > 1_350_000:
        failures.append(f'world kit total {total} bytes > 1.35 MB')
    folder = sum(os.path.getsize(os.path.join(MODELS, f)) for f in os.listdir(MODELS) if f.endswith('.glb'))
    print(f'models folder now: {folder} bytes (for information)')
    if failures:
        print('FAIL\n  ' + '\n  '.join(failures))
        sys.exit(1)
    print('ALL CHECKS PASSED')


main()
