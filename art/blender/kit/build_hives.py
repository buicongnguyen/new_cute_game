"""The Hives (bosses) and the Notes -> public/assets/models/hives.glb (see docs/ART-CONTRACT.md).

    thornhive  5 m faceted crystal tower; shell, eye, and three thorn crowns crown_0..crown_2 (pivots on the
               tower axis, so the code can spin or pulse each ring)
    clamhive   5 m wide crusted clam; shell_top (pivot at the back hinge; rotate X negative to open),
               shell_bottom, pearl (glowing)
    forgehive  5 m crusted lava-rock golem; body, head (with its glowing eye), arm_l, arm_r (pivots at shoulders)
    greyheart  6 m faceted crystal heart; shell, core (glow), shard_0..shard_5 floating around it
    note       0.6 m golden glowing crystal music note (glow_gold)
    hushbell   the Frostfall boss: a cracked bronze bell (3.5 m) frozen in Gloom crystal and frost under a crystal
               arch; arch, ice (the frozen block, so the code can shatter it), bell (pivot at its top) with its
               child clapper (pivot at the clapper's top)
    echo_bell  a small bronze bell on a short frosty post (1.6 m); post, bell (pivot at its top)
    captain_barnacle  a crusted crab pirate captain (about 3 m): body, eye, hat (crystal tricorn), claw_l, claw_r
               (pivots at the shoulders), anchor (child of claw_r, pivot at the claw's grip)
    coilwyrm   a crystal serpent lying coiled on the deck (two low loops, 1.3 m high, 4.5 m across, an empty
               middle) with its neck and head rearing to about 3.5 m: coil, head (pivot at the neck base, so it can
               rear and strike), knot_0..knot_2 (glowing crystal knots on the loops, low enough to ring from the deck)

    blender -b --factory-startup --python art/blender/kit/build_hives.py -- [--render]
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit_cast import FWD, lathe, lean_shard, smoothstep, torus  # noqa: E402
from kit_cast import (UP, Cast, Geo, Matrix, Vector, args, ellipsoid, facet_blob, frame, gem, glow, gloom_crystal,  # noqa: E402
                      loft, pal, sheet, shard, style, tube)
from build_gloom import chain, gloom_eye, plate, socket, spikes  # noqa: E402

FILE = 'hives'
BUDGET = 6000
ORDER = ['note', 'thornhive', 'clamhive', 'forgehive', 'greyheart']
def spikes_lean(g, m, specs, seed=0):
    return spikes(g, m, specs, seed, lean=True)


LATE = ['hushbell', 'echo_bell', 'captain_barnacle', 'coilwyrm']
BUDGETS = dict({n: BUDGET for n in ORDER}, hushbell=5000, echo_bell=600, captain_barnacle=5000, coilwyrm=5000)


def materials():
    return dict(crystal=gloom_crystal(), dark=pal('gloom_dark', 0.35), eye=glow('gloom', '#B26BFF', 1.1),
                night=pal('night', 0.2), white=pal('white', 0.25), gold=glow('gold', style.PALETTE['gold'], 2.0),
                lava=glow('lava', style.PALETTE['lava'], 2.2), rock=pal('soil', 0.8), rock2=pal('bark', 0.8),
                nacre=pal('blossom_dark', 0.35))


def ring(c, r, n, phase=0.0, y=0.0, sy=None):
    return [Vector(c) + Vector((math.cos(math.tau * k / n + phase) * r, y, math.sin(math.tau * k / n + phase) * r))
            for k in range(n)]


# ------------------------------------------------------------------ thornhive
def thornhive(cast, m):
    root = cast.root('thornhive')
    sh = Geo()
    sh.add(facet_blob((0, 0.2, 0), (1.9, 0.55, 1.8), 1, 0.15, 3, m['dark']))
    for k in range(6):
        a = math.tau * k / 6 + 0.3
        sh.add(facet_blob((math.cos(a) * 1.35, 0.35, math.sin(a) * 1.35), (0.55, 0.45, 0.5), 1, 0.15, 10 + k, m['crystal']))
    rings = []
    for y, r, tw in ((0.2, 1.25, 0.0), (1.2, 1.15, 0.12), (2.2, 0.95, 0.25), (3.2, 0.72, 0.4), (4.0, 0.5, 0.55)):
        rings.append(ring((0, y, 0), r, 6, tw))
    sh.add(loft(rings, m['crystal'], end=Vector((0.05, 5.0, 0.0)), smooth=False))
    ec, ef = Vector((0, 2.05, 1.05)), Vector((0, 0.1, 1))
    sh.add(socket(ec, ef, 0.42, m, 7))
    cast.part(root, 'shell', sh, (0, 0, 0))
    cast.part(root, 'eye', gloom_eye(ec, ef, 0.42, m), ec)
    for i, (y, r, n, ln) in enumerate(((1.1, 1.18, 9, 0.85), (2.75, 0.85, 8, 0.75), (3.75, 0.6, 7, 0.6))):
        cr = Geo()
        for k in range(n):
            a = math.tau * k / n + i * 0.4
            base = Vector((math.cos(a) * r, y, math.sin(a) * r))
            d = Vector((math.cos(a), 0.55, math.sin(a)))
            cr.add(shard(base, d, ln, 0.13, 4, 0.6, m['crystal'], 100 * i + k))
            cr.add(shard(base + Vector((0, -0.05, 0)), Vector((math.cos(a + 0.35), -0.35, math.sin(a + 0.35))), ln * 0.55,
                         0.09, 4, 0.6, m['crystal'], 100 * i + k + 50))
        cast.part(root, f'crown_{i}', cr, (0, y, 0))


# ------------------------------------------------------------------ clamhive
CLAM_Y = 1.05            # where the two halves meet
HINGE_Z = -2.05


def clam_rim(a, R=(3.05, 2.35)):
    """The clam's outline around its centre: a rounded fan, narrow at the hinge (back, -Z)."""
    x, z = math.cos(a) * R[0], math.sin(a) * R[1]
    w = 0.42 + 0.58 * min(1.0, max(0.0, (z - HINGE_Z) / (R[1] - HINGE_Z))) ** 0.55
    return Vector((x * w, 0.0, z * 0.92 + 0.05))


def clam_half(m_out, m_in, up, depth, ribs=10, n=40, rows=5, thick=0.2):
    """One thick shell half. Rings run from the hinge out to the scalloped rim, so the ribs radiate from the hinge
    like a real clam's; then a lip and the nacre inside back to the hinge. Flat shaded (crystal crust)."""
    sgn = 1 if up else -1
    H = Vector((0.0, CLAM_Y, HINGE_Z))
    angles = [math.tau * k / n - math.pi / 2 for k in range(n)]

    def pt(t, a, inner=False):
        rim = clam_rim(a)
        p = Vector((H.x + (rim.x - H.x) * t, 0.0, H.z + (rim.z - H.z) * t))
        dome = depth * (1 - t ** 2.2) ** 0.65 * (0.55 + 0.45 * math.sin(min(1.0, t / 0.35) * math.pi / 2))
        rib = 0.0 if inner else 0.11 * t ** 0.8 * max(0.0, math.cos(ribs * (a + math.pi / 2) / 2)) ** 0.6
        y = dome + rib - (thick * (1 - t ** 3) if inner else 0.0)
        if not inner and t > 0.99:
            y += 0.06 * math.cos(ribs * (a + math.pi / 2))
        return Vector((p.x, CLAM_Y + sgn * max(y, 0.0 if not inner else -0.0), p.z))
    rings = [[pt(i / rows, a) for a in angles] for i in range(1, rows + 1)]
    rings.append([pt(0.985, a, True) + Vector((0, sgn * 0.02, 0)) for a in angles])       # lip
    rings += [[pt(i / rows, a, True) for a in angles] for i in range(rows - 1, 0, -1)]      # nacre
    hinge_out = H + Vector((0, sgn * depth * 0.55, 0))
    hinge_in = H + Vector((0, sgn * max(0.0, depth * 0.55 - thick * 1.6), 0.2))
    g = loft(rings, m_out, start=hinge_out, end=hinge_in, smooth=False)
    grid = (len(rings) - 1) * n
    for i in list(range(rows * n, grid)) + list(range(grid + n, grid + 2 * n)):
        g.m[i] = m_in
    return g


def clamhive(cast, m):
    root = cast.root('clamhive')
    bot = clam_half(m['dark'], m['nacre'], False, 0.95)
    bot.add(facet_blob((0, 0.12, 0), (1.6, 0.25, 1.4), 1, 0.1, 5, m['dark']))
    rng = random.Random(4)
    for k in range(9):   # crust around the base
        a = math.tau * k / 9 + 0.2
        bot.add(shard(Vector((math.cos(a) * 1.9, 0.15, math.sin(a) * 1.7)), Vector((math.cos(a), 0.9, math.sin(a))),
                      rng.uniform(0.5, 0.9), 0.16, 5, 0.5, m['crystal'], 200 + k))
    cast.part(root, 'shell_bottom', bot, (0, 0, 0))
    top = clam_half(m['crystal'], m['nacre'], True, 1.05)
    H = Vector((0.0, CLAM_Y, HINGE_Z))
    for k in range(13):   # Gloom crust on the lid
        a = rng.uniform(-0.2, math.pi + 0.2)
        t = rng.uniform(0.25, 0.8)
        rim = clam_rim(a)
        p = H + (Vector((rim.x, 0, rim.z)) - Vector((H.x, 0, H.z))) * t
        y = CLAM_Y + 1.05 * (1 - t ** 2.2) ** 0.65 - 0.1
        base = Vector((p.x, y, p.z))
        d = Vector((p.x * 0.35, 1.0, (p.z - HINGE_Z * 0.3) * 0.3))
        top.add(shard(base, d, rng.uniform(0.45, 0.9), rng.uniform(0.12, 0.19), 5, 0.5, m['crystal'], 300 + k))
    for k in range(9):   # teeth along the front lip
        a = math.radians(25 + 130 * k / 8)
        rim = clam_rim(a)
        top.add(shard(Vector((rim.x * 0.97, CLAM_Y + 0.06, rim.z * 0.97)), Vector((rim.x * 0.1, -1, rim.z * 0.1)), 0.32, 0.075,
                      4, 0.7, m['crystal'], 400 + k))
    cast.part(root, 'shell_top', top, (0, CLAM_Y, HINGE_Z))
    pc = Vector((0, CLAM_Y + 0.2, 0.35))
    pearl = ellipsoid(pc, 0.55, 18, 12, None, m['eye'])
    pearl.add(ellipsoid(pc + Vector((0.2, 0.26, 0.4)), (0.12, 0.1, 0.05), 8, 4, frame(Vector((0.3, 0.4, 1))), m['white']))
    cast.part(root, 'pearl', pearl, pc)


# ------------------------------------------------------------------ forgehive
def lava_cracks(g, c, r, m, seed, n=5):
    """Glowing seams: thin glow tubes zig-zagging over a boulder's surface."""
    rng = random.Random(seed)
    for k in range(n):
        az = rng.uniform(-1.2, 1.2)
        el = rng.uniform(-0.6, 0.6)
        pts = []
        for i in range(4):
            a, e = az + 0.18 * i * rng.choice((-1, 1)), el - 0.16 * i
            d = Vector((math.cos(e) * math.sin(a), math.sin(e), math.cos(e) * math.cos(a)))
            pts.append(Vector(c) + Vector((d.x * r[0], d.y * r[1], d.z * r[2])) * 1.0)
        g.add(tube(pts, [0.07, 0.06, 0.05, 0.03], 4, m, smooth=False, round_caps=0.5))


def forgehive(cast, m):
    root = cast.root('forgehive')
    body = Geo()
    tc, tr = Vector((0, 2.5, 0)), (1.35, 1.25, 1.0)
    body.add(facet_blob(tc, tr, 2, 0.08, 21, m['rock']))
    body.add(facet_blob((0, 1.35, 0.05), (1.05, 0.7, 0.85), 2, 0.08, 22, m['rock2']))
    lava_cracks(body, tc, (tr[0] * 0.98, tr[1] * 0.98, tr[2] * 0.98), m['lava'], 5, 6)
    body.add(gem(Vector((0, 2.55, 0.92)), 0.36, 0.7, 6, m['lava'], frame(Vector((0, 0, 1)), UP) @ Matrix.Rotation(math.pi / 2, 3, 'X')))
    for s in (1, -1):   # stumpy legs
        rings = [ring((s * 0.62, y, 0.0), r, 6, 0.3) for y, r in ((0.0, 0.62), (0.25, 0.66), (1.2, 0.5))]
        body.add(loft(rings, m['rock'], smooth=False))
    spikes(body, m['crystal'], [((0.5, 3.6, -0.3), (0.4, 1, -0.4), 1.0, 0.24), ((-0.4, 3.55, -0.45), (-0.3, 1, -0.6), 0.9, 0.22),
                                ((0.0, 3.4, -0.75), (0, 0.6, -1), 0.8, 0.2), ((1.0, 3.2, -0.2), (0.9, 1, 0), 0.7, 0.18),
                                ((-1.0, 3.2, -0.1), (-0.9, 1, 0), 0.75, 0.18), ((0.7, 1.8, 0.6), (0.6, 0.3, 1), 0.5, 0.15),
                                ((-0.6, 2.0, 0.7), (-0.5, 0.2, 1), 0.45, 0.14)], 6)
    cast.part(root, 'body', body, (0, 1.2, 0))
    head = Geo()
    hc = Vector((0, 4.05, 0.35))
    head.add(facet_blob(hc, (0.62, 0.52, 0.58), 2, 0.07, 23, m['rock']))
    spikes(head, m['crystal'], [((0.25, 4.45, 0.1), (0.3, 1, -0.2), 0.6, 0.15), ((-0.3, 4.42, 0.0), (-0.4, 1, -0.3), 0.55, 0.14),
                                ((0.0, 4.5, -0.15), (0, 1, -0.5), 0.5, 0.13)], 7)
    ec, ef = hc + Vector((0, 0.02, 0.5)), Vector((0, 0.05, 1))
    head.add(gloom_eye(ec, ef, 0.27, m))
    head.add(socket(ec, ef, 0.27, m, 8))
    cast.part(root, 'head', head, (0, 3.55, 0.2))
    for s, name in ((1, 'arm_l'), (-1, 'arm_r')):
        sh = Vector((s * 1.45, 3.15, 0.0))
        arm = Geo()
        arm.add(facet_blob(sh + Vector((s * 0.15, 0.1, 0)), (0.62, 0.6, 0.6), 2, 0.08, 30 + s, m['rock']))
        el = sh + Vector((s * 0.45, -1.15, 0.15))
        arm.add(facet_blob((sh + el) / 2, (0.42, 0.75, 0.42), 1, 0.08, 32 + s, m['rock2'],
                           Matrix.Rotation(-s * 0.35, 3, 'Z')))
        fist = el + Vector((s * 0.12, -0.85, 0.25))
        arm.add(facet_blob((el + fist) / 2, (0.45, 0.7, 0.45), 1, 0.08, 34 + s, m['rock'], Matrix.Rotation(-s * 0.15, 3, 'Z')))
        arm.add(facet_blob(fist, (0.68, 0.6, 0.66), 2, 0.08, 36 + s, m['rock2']))
        lava_cracks(arm, fist, (0.66, 0.58, 0.64), m['lava'], 40 + s, 3)
        spikes(arm, m['crystal'], [(sh + Vector((s * 0.3, 0.55, 0)), (s * 0.5, 1, -0.2), 0.75, 0.18),
                                   (sh + Vector((s * 0.55, 0.3, -0.25)), (s * 1, 0.7, -0.3), 0.6, 0.15),
                                   (fist + Vector((s * 0.3, 0.35, -0.2)), (s * 0.6, 0.8, -0.4), 0.45, 0.12)], 9 + s)
        cast.part(root, name, arm, sh)


# ------------------------------------------------------------------ greyheart
def heart_outline(n=28):
    pts = []
    for k in range(n):
        t = math.tau * k / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 17.0, y / 17.0))
    return pts


def pillow_heart(c, size, thick, m, rows=3, n=28, centre=(0.0, 0.1)):
    """A puffy faceted heart: the outline shrunk toward its centre in rows, bulging in z (flat shaded)."""
    outline = heart_outline(n)
    cx, cy = centre
    c = Vector(c)

    def ring_at(i, side):
        s = i / rows                       # 0 = rim .. 1 = centre
        k = 1 - s * 0.82
        z = side * thick * math.sqrt(max(0.0, 1 - (1 - s) ** 2))
        return [c + Vector(((cx + (x - cx) * k) * size, (cy + (y - cy) * k) * size, z)) for x, y in outline]
    front = [ring_at(i, 1) for i in range(rows + 1)]
    back = [ring_at(i, -1) for i in range(1, rows + 1)]
    mid = c + Vector((cx * size, cy * size, 0))
    return loft(list(reversed(front)) + back, m, start=mid + Vector((0, 0, thick)), end=mid - Vector((0, 0, thick)),
                smooth=False)


def greyheart(cast, m):
    root = cast.root('greyheart')
    hc = Vector((0, 3.55, 0))
    sh = pillow_heart(hc, 3.2, 1.45, m['crystal'], rows=3, n=28)
    rng = random.Random(9)
    for k in range(10):   # facets jutting from the heart
        a = rng.uniform(0, math.tau)
        x, y = 16 * math.sin(a) ** 3 / 17.0 * 2.4, (13 * math.cos(a) - 5 * math.cos(2 * a) - 2 * math.cos(3 * a)
                                                   - math.cos(4 * a)) / 17.0 * 2.4
        zs = rng.choice((1, -1)) * rng.uniform(0.3, 0.9)
        base = hc + Vector((x, y, zs))
        d = Vector((x, y, zs * 2.5)).normalized()
        sh.add(shard(base, d, rng.uniform(0.6, 1.1), rng.uniform(0.18, 0.28), 5, 0.5, m['crystal'], 500 + k))
    cast.part(root, 'shell', sh, (0, 0, 0))
    core = pillow_heart(hc + Vector((0, 0.05, 1.05)), 1.25, 0.55, m['eye'], rows=2, n=20)
    cast.part(root, 'core', core, hc + Vector((0, 0, 1.05)))
    for k in range(6):
        a = math.tau * k / 6 + 0.25
        c = hc + Vector((math.cos(a) * 4.3, 0.9 * math.sin(2 * a) + 0.3, math.sin(a) * 4.3))
        d = Vector((math.cos(a) * 0.3, 1, math.sin(a) * 0.3)).normalized()
        ln = 1.3 + 0.25 * (k % 3)
        g = shard(c - d * ln * 0.45, d, ln, 0.3, 5, 0.42, m['crystal'], 600 + k, base_tip=1.2)
        cast.part(root, f'shard_{k}', g, c)


# ------------------------------------------------------------------ note
def note(cast, m):
    root = cast.root('note')
    g = Geo()
    hc = Vector((-0.08, 0.13, 0))
    R = Matrix.Rotation(0.45, 3, 'Z')
    g.add(gem(Vector(), 0.13, 0.2, 7, m['gold'], frame(Vector((0, 0, 1)), UP) @ Matrix.Rotation(math.pi / 2, 3, 'X'))
          .scale((1.35, 1.0, 0.75)).xf(R).move(hc))
    stem_x = hc.x + 0.15
    rings = [ring((stem_x, y, 0.0), 0.032, 5, 0.3) for y in (0.14, 0.58)]
    g.add(loft(rings, m['gold'], smooth=False))
    flag = [(0.0, 0.0), (0.06, -0.02), (0.15, -0.09), (0.2, -0.18), (0.17, -0.26), (0.14, -0.2), (0.1, -0.13),
            (0.04, -0.09), (0.0, -0.08)]
    g.add(plate([(x, -y) for x, y in flag], 0.05, m['gold'], Matrix.Rotation(math.pi / 2, 3, 'X'),
                Vector((stem_x, 0.6, 0.0))))
    lo, hi = g.bounds()
    g.move((-(lo.x + hi.x) / 2, -lo.y, -(lo.z + hi.z) / 2))
    cast.part(root, 'body', g, (0, 0, 0))


# ------------------------------------------------------------------ Frostfall bells
def bronze():
    return pal('straw_dark', 0.35, 0.35), pal('gold', 0.3, 0.35)


def bell_shell(h, rmouth, segs, m_body, m_band):
    """A bell (mouth at y = 0, crown at y = h) as one thick lathe, inside and out, with raised bands."""
    k = h / 3.5
    r = rmouth / 1.6
    prof = [(0.0, 3.15), (0.65, 3.0), (0.88, 2.6), (0.95, 1.8), (1.05, 1.0), (1.3, 0.45), (1.48, 0.12), (1.58, 0.0),
            (1.66, 0.06), (1.64, 0.16), (1.5, 0.38), (1.22, 0.95), (1.1, 1.7), (1.04, 2.4), (1.08, 2.5), (1.04, 2.62),
            (0.96, 2.9), (0.75, 3.25), (0.42, 3.45), (0.0, 3.5)]
    mats = []
    for i in range(len(prof) - 1):
        mats.append(m_band if i in (7, 8, 13, 14) else m_body)
    return lathe([(x * r, y * k) for x, y in prof], segs, (0, 0, 0), 1.0, 1.0, None, None, mats)


def hushbell(cast, m):
    root = cast.root('hushbell')
    br, band = bronze()
    snow, icy = pal('snow', 0.5), pal('sky_light', 0.25)
    cr, clear = m['crystal'], gloom_crystal(alpha=0.55)
    # the crystal arch with frost on top
    arch = Geo()
    for s in (1, -1):
        rings = [ring((s * x, y, 0.0), r, 6, 0.2) for x, y, r in ((2.75, 0.0, 0.5), (2.6, 2.8, 0.42), (2.35, 5.4, 0.36))]
        arch.add(loft(rings, cr, smooth=False))
        arch.add(facet_blob((s * 2.8, 0.25, 0.0), (0.85, 0.4, 0.8), 1, 0.12, 50 + s, m['dark']))
    top = [Vector((x, 5.25 + 1.1 * (1 - (x / 2.4) ** 2), 0.0)) for x in (-2.4, -1.6, -0.8, 0.0, 0.8, 1.6, 2.4)]
    arch.add(tube(top, 0.36, 6, cr, smooth=False, round_caps=0.6))
    arch.add(tube([p + Vector((0, 0.28, 0)) for p in top], 0.22, 6, snow, flatten=0.55, up=(0, 1, 0), round_caps=0.8))
    spikes_lean(arch, cr, [((-2.2, 5.9, 0.1), (-0.6, 1, 0.2), 0.9, 0.18), ((2.2, 5.9, -0.1), (0.6, 1, -0.2), 0.9, 0.18),
                      ((-1.0, 6.25, 0.0), (-0.3, 1, 0.3), 0.7, 0.15), ((1.0, 6.25, 0.0), (0.3, 1, -0.3), 0.7, 0.15),
                      ((2.9, 3.0, 0.3), (1, 0.5, 0.3), 0.7, 0.16), ((-2.9, 2.2, -0.3), (-1, 0.5, -0.3), 0.7, 0.16)], 31)
    rng = random.Random(33)
    for k in range(7):   # icicles hanging from the arch
        x = -2.0 + 4.0 * k / 6
        y = 5.25 + 1.1 * (1 - (x / 2.4) ** 2) - 0.3
        arch.add(lean_shard(Vector((x, y, rng.uniform(-0.15, 0.15))), Vector((0, -1, 0)), rng.uniform(0.35, 0.7), 0.07, 4, 0.75,
                       icy, 40 + k))
    arch.add(chain(Vector((0, 6.2, 0)), 0.85, cr, 60, links=3, major=0.14, minor=0.045, smooth=True))
    cast.part(root, 'arch', arch, (0, 0, 0))
    # the bell, hanging from a short crystal chain; a glowing crack runs up from the lip
    top_y = 5.15
    b = bell_shell(3.5, 1.6, 16, br, band).move((0, top_y - 3.5, 0))
    b.add(torus(Vector((0, top_y + 0.1, 0)), 0.22, 0.08, 12, 5, Matrix.Rotation(math.pi / 2, 3, 'X'), br))
    crack = []
    a0 = 0.35
    for i, (t, da) in enumerate(((0.0, 0.0), (0.12, 0.08), (0.24, -0.05), (0.36, 0.1), (0.5, -0.02), (0.62, 0.09))):
        y = top_y - 3.5 + 0.06 + t * 3.0
        rr = 1.62 - 0.55 * min(1.0, t * 1.7) + 0.02
        crack.append(Vector((rr * math.sin(a0 + da), y, rr * math.cos(a0 + da))))
    b.add(tube(crack, [0.07, 0.06, 0.055, 0.05, 0.04, 0.02], 4, m['eye'], round_caps=0.5))
    bell = cast.part(root, 'bell', b, (0, top_y, 0))
    cl = Geo()
    cl.add(tube([Vector((0, top_y - 0.35, 0)), Vector((0, top_y - 2.9, 0))], 0.09, 6, pal('iron', 0.45), round_caps=0.5))
    cl.add(ellipsoid(Vector((0, top_y - 3.05, 0)), 0.3, 12, 8, None, pal('iron', 0.45)))
    cast.part(bell, 'clapper', cl, (0, top_y - 0.35, 0))
    # frozen in a translucent block of Gloom crystal, with frost drifts and opaque spikes
    ice = Geo()
    ice.add(facet_blob((0, 2.15, 0), (2.25, 1.75, 2.0), 2, 0.1, 70, clear))
    for k, (x, y, z, d, ln) in enumerate(((1.7, 2.8, 0.8, (1, 0.8, 0.5), 1.2), (-1.8, 2.5, 0.6, (-1, 0.7, 0.4), 1.1),
                                           (0.5, 3.6, 1.3, (0.3, 1, 0.6), 1.0), (-0.9, 3.4, -1.2, (-0.4, 1, -0.6), 1.1),
                                           (1.4, 1.2, -1.3, (0.8, 0.3, -0.8), 0.9), (-0.4, 1.0, 1.7, (-0.2, 0.2, 1), 0.8))):
        ice.add(lean_shard(Vector((x, y, z)), Vector(d), ln, 0.24, 5, 0.45, cr, 80 + k))
    for k, (x, z, r) in enumerate(((0.6, 0.5, 0.75), (-0.8, -0.4, 0.65), (0.2, -0.8, 0.5))):
        ice.add(facet_blob((x, 3.85, z), (r, 0.2, r * 0.9), 1, 0.15, 90 + k, snow))
    ice.add(facet_blob((0, 0.12, 0), (2.4, 0.3, 2.1), 1, 0.12, 95, snow))
    for k in range(5):
        a = math.tau * k / 5 + 0.3
        ice.add(lean_shard(Vector((math.cos(a) * 1.9, 1.0, math.sin(a) * 1.7)), Vector((0, -1, 0)), rng.uniform(0.3, 0.6), 0.08, 4,
                      0.75, icy, 100 + k))
    cast.part(root, 'ice', ice, (0, 0, 0))


def echo_bell(cast, m):
    root = cast.root('echo_bell')
    br, band = bronze()
    wood, snow = pal('wood', 0.6), pal('snow', 0.5)
    post = Geo()
    post.add(loft([ring((0, y, 0), r, 6, 0.3) for y, r in ((0.0, 0.11), (1.5, 0.09))], wood, smooth=False))
    post.add(tube([Vector((0, 1.42, 0)), Vector((0, 1.47, 0.22)), Vector((0, 1.44, 0.42))], 0.05, 5, wood, round_caps=0.5))
    post.add(facet_blob((0, 1.53, 0), (0.13, 0.07, 0.13), 1, 0.12, 5, snow))
    post.add(tube([Vector((0, 1.5, 0.05)), Vector((0, 1.52, 0.38))], 0.05, 5, snow, flatten=0.6, up=(0, 1, 0), round_caps=0.8))
    post.add(facet_blob((0, 0.05, 0), (0.4, 0.12, 0.38), 1, 0.15, 6, snow))
    cast.part(root, 'post', post, (0, 0, 0))
    top = Vector((0, 1.38, 0.42))
    b = bell_shell(0.45, 0.22, 10, br, band).move(top - Vector((0, 0.45, 0)))
    b.add(ellipsoid(top - Vector((0, 0.47, 0)), 0.05, 6, 4, None, pal('iron', 0.45)))
    b.add(torus(top + Vector((0, 0.02, 0)), 0.04, 0.014, 8, 4, Matrix.Rotation(math.pi / 2, 3, 'X'), br))
    cast.part(root, 'bell', b, top + Vector((0, 0.04, 0)))


# ------------------------------------------------------------------ Captain Barnacle
def captain_barnacle(cast, m):
    root = cast.root('captain_barnacle')
    shell_m, under_m, barn = pal('coral', 0.5), pal('cherry', 0.5), pal('stone_light', 0.7)
    cr = m['crystal']
    rng = random.Random(77)
    body = Geo()
    bc = Vector((0, 1.62, 0))
    body.add(ellipsoid(bc, (1.2, 0.52, 0.95), 14, 8, None, shell_m))
    body.add(ellipsoid(bc + Vector((0, -0.2, 0.02)), (1.1, 0.36, 0.86), 10, 5, None, under_m))
    for k in range(5):   # barnacles
        a = rng.uniform(0.5, math.pi - 0.5)
        az = rng.uniform(0, math.tau)
        d = Vector((math.cos(az) * math.sin(a) * 1.0, math.cos(a), math.sin(az) * math.sin(a)))
        p = bc + Vector((d.x * 1.15, abs(d.y) * 0.5, d.z * 0.9))
        body.add(lathe([(0.0, 0.0), (0.11, 0.0), (0.09, 0.08), (0.05, 0.11), (0.0, 0.07)], 6, (0, 0, 0), 1.0, 1.0,
                       frame(Vector((d.x, 1.6, d.z)).normalized()) @ Matrix.Rotation(math.pi / 2, 3, 'X'), barn).move(p))
    for k in range(7):   # the Gloom crust on its back
        az = rng.uniform(math.pi * 0.9, math.pi * 2.1)
        p = bc + Vector((math.cos(az) * rng.uniform(0.3, 0.95), 0.38, math.sin(az) * rng.uniform(0.2, 0.7)))
        body.add(lean_shard(p, Vector((math.cos(az) * 0.5, 1.0, math.sin(az) * 0.5)), rng.uniform(0.35, 0.6), 0.11, 5, 0.45, cr,
                       150 + k))
    for s in (1, -1):   # three legs a side
        for k, z in enumerate((-0.55, -0.05, 0.42)):
            hip = bc + Vector((s * 0.9, -0.2, z))
            knee = Vector((s * 1.5, 1.55, z * 1.2))
            foot = Vector((s * 1.75, 0.08, z * 1.3))
            body.add(tube([hip, knee, foot], [0.22, 0.18, 0.09], 5, shell_m, round_caps=0.5))
            body.add(lean_shard(foot + Vector((0, 0.12, 0)), Vector((s * 0.2, -1, 0)), 0.18, 0.06, 4, 0.7, cr, 170 + k + 3 * s))
    stalk_base = bc + Vector((0, 0.38, 0.6))
    ec, ef = bc + Vector((0, 0.78, 0.82)), Vector((0, 0.12, 1))
    body.add(tube([stalk_base, ec - ef * 0.2], [0.12, 0.09], 6, shell_m, round_caps=0.3))
    body.add(lean_shard(bc + Vector((-0.32, 0.4, 0.62)), Vector((-0.3, 1, 0.4)), 0.4, 0.09, 5, 0.45, cr, 180))   # the other eye, crusted over
    for s in (1, -1):   # crystal moustache
        body.add(tube([bc + Vector((s * 0.06, 0.1, 0.92)), bc + Vector((s * 0.28, 0.02, 0.98)), bc + Vector((s * 0.4, 0.12, 0.92))],
                      [0.06, 0.05, 0.02], 5, cr))
    body.add(socket(ec, ef, 0.27, m, 21, lean=True))
    cast.part(root, 'body', body, bc)
    cast.part(root, 'eye', gloom_eye(ec, ef, 0.27, m, lean=True), ec)
    # crystal tricorn hat with a glowing badge
    hc = bc + Vector((0, 0.46, -0.22))
    hat = lathe([(0.0, 0.0), (0.58, 0.0), (0.6, 0.3), (0.5, 0.58), (0.0, 0.66)], 8, (0, 0, 0), 1.0, 1.0, None, cr,
                smooth=False)
    brim = lathe([(0.0, -0.03), (1.15, -0.03), (1.18, 0.05), (0.0, 0.08)], 15, (0, 0, 0), 1.0, 1.0, None, m['dark'],
                 smooth=False)
    for i, v in enumerate(brim.v):   # three corners turned up: a tricorn
        rr = math.hypot(v.x, v.z)
        if rr > 0.62:
            a = math.atan2(v.x, v.z) + math.pi
            k = max(0.0, math.cos(3 * a)) ** 0.7
            brim.v[i] = Vector((v.x * (0.78 + 0.22 * k), v.y + 0.55 * k, v.z * (0.78 + 0.22 * k)))
    hat.add(brim)
    hat.add(gem(Vector((0, 0.3, 0.6)), 0.12, 0.26, 6, m['eye'], frame(FWD) @ Matrix.Rotation(math.pi / 2, 3, 'X')))
    cast.part(root, 'hat', hat.xf(Matrix.Rotation(-0.12, 3, 'X')).move(hc), hc)
    # claws (pivots at the shoulders); the right claw grips the anchor's chain
    for s, name in ((1, 'claw_l'), (-1, 'claw_r')):
        sh = bc + Vector((s * 0.95, -0.05, 0.62))
        el = sh + Vector((s * 0.55, -0.15, 0.55))
        wr = el + Vector((-s * 0.05, -0.1, 0.55))
        cl = Geo()
        cl.add(tube([sh, el, wr], [0.18, 0.16, 0.15], 7, shell_m, round_caps=0.5))
        pc = wr + Vector((0, 0.0, 0.45))
        cl.add(ellipsoid(pc, (0.42, 0.34, 0.55), 10, 7, None, shell_m))
        cl.add(ellipsoid(pc + Vector((0, -0.15, 0.05)), (0.36, 0.2, 0.46), 8, 4, None, under_m))
        for up, mm in ((1, shell_m), (-1, under_m)):   # the two fingers
            base = pc + Vector((0, up * 0.12, 0.42))
            cl.add(tube([base, base + Vector((s * 0.05, up * 0.12, 0.35)), base + Vector((s * 0.02, -up * 0.02, 0.62))],
                        [0.16, 0.11, 0.03], 6, mm, round_caps=0.3))
        spikes_lean(cl, cr, [(pc + Vector((s * 0.2, 0.3, -0.1)), (s * 0.4, 1, -0.2), 0.42, 0.1),
                        (pc + Vector((-s * 0.1, 0.32, 0.15)), (0, 1, 0.3), 0.32, 0.08),
                        (el + Vector((0, 0.16, 0)), (s * 0.3, 1, 0), 0.3, 0.08)], 190 + s)
        claw = cast.part(root, name, cl, sh)
        if s < 0:
            grip = pc + Vector((0, 0.0, 0.85))
            an = Geo()
            an.add(chain(grip, 0.5, cr, 210, links=3, major=0.09, minor=0.03, smooth=True))
            ring_c = grip - Vector((0, 0.62, 0))
            stone = pal('stone_dark', 0.8)
            an.add(torus(ring_c, 0.14, 0.04, 10, 4, Matrix.Rotation(math.pi / 2, 3, 'Z'), pal('iron', 0.45)))
            bot = Vector((grip.x, 0.18, grip.z))
            an.add(loft([ring((grip.x, y, grip.z), r, 6, 0.25) for y, r in ((ring_c.y - 0.12, 0.09), (bot.y + 0.1, 0.12))],
                        stone, smooth=False))
            an.add(tube([Vector((grip.x - 0.45, ring_c.y - 0.25, grip.z)), Vector((grip.x + 0.45, ring_c.y - 0.25, grip.z))],
                        0.08, 6, stone, smooth=False, round_caps=0.5))
            arc = [Vector((grip.x + 0.55 * math.sin(a), 0.42 - 0.3 * math.cos(a), grip.z)) for a in
                   (-1.25, -0.7, 0.0, 0.7, 1.25)]
            an.add(tube(arc, 0.1, 5, stone, smooth=False, round_caps=0.5))
            for sd in (1, -1):
                an.add(lean_shard(arc[0 if sd < 0 else -1], Vector((sd * 0.6, 1.0, 0.0)), 0.42, 0.13, 5, 0.6, cr, 220 + sd))
            an.add(lean_shard(Vector((grip.x, 0.1, grip.z)), Vector((0, -1, 0)), 0.18, 0.1, 5, 0.7, cr, 223))
            cast.part(claw, 'anchor', an, grip)


# ------------------------------------------------------------------ the coil wyrm
def coilwyrm(cast, m):
    """A crystal serpent lying coiled on the deck: two low loops around an empty middle, neck and head rearing."""
    root = cast.root('coilwyrm')
    cr = m['crystal']
    turns, N = 2.0, 44
    pts, radii, outs = [], [], []
    for i in range(N):
        t = i / (N - 1)
        a = turns * math.tau * t
        rr = 1.9 - 0.62 * t
        rt = 0.37 * min(1.0, 0.2 + 5.0 * t)
        y = max(rt * 0.92, 0.34 + 0.55 * smoothstep(0.08, 0.95, t))
        pts.append(Vector((rr * math.cos(a), y, rr * math.sin(a))))
        radii.append(rt)
        outs.append(Vector((math.cos(a), 0.0, math.sin(a))))
    coil = tube(pts, radii, 7, cr, smooth=True, round_caps=0.6)
    for i in range(3, N - 2, 4):   # crystal spines along its back
        coil.add(lean_shard(pts[i] + outs[i] * radii[i] * 0.3 + Vector((0, radii[i] * 0.75, 0)),
                            outs[i] * 0.5 + Vector((0, 1, 0)), radii[i] * 0.9, 0.07, 4, 0.6, cr, 300 + i))
    cast.part(root, 'coil', coil, (0, 0, 0), sharp=80)
    for k, t in enumerate((0.2, 0.52, 0.84)):   # spread around the loops, at ringing height
        i = int(round(t * (N - 1)))
        c = pts[i] + outs[i] * radii[i] * 0.95
        cast.part(root, f'knot_{k}', gem(c, 0.2, 0.5, 6, m['eye'], frame(outs[i]) @ Matrix.Rotation(math.pi / 2, 3, 'X')), c)
    # the neck rises from the inner end of the coil; the head faces +Z
    base = pts[-1]
    head = Geo()
    neck = [base, base + Vector((0.0, 0.6, 0.05)), base + Vector((-0.2, 1.25, 0.25)), base + Vector((-0.4, 1.85, 0.5))]
    head.add(tube(neck, [0.37, 0.34, 0.31, 0.29], 7, cr, round_caps=0.3))
    hc = neck[-1] + Vector((0.0, 0.32, 0.35))
    Rh = frame(FWD, UP)
    head.add(facet_blob(hc, (0.4, 0.32, 0.58), 2, 0.07, 340, cr, Rh))
    head.add(facet_blob(hc + Vector((0, -0.22, 0.25)), (0.28, 0.11, 0.38), 1, 0.06, 341, m['dark'], Rh))   # jaw
    for s in (1, -1):
        head.add(lean_shard(hc + Vector((s * 0.22, 0.2, -0.15)), Vector((s * 0.4, 1, -0.6)), 0.6, 0.09, 4, 0.5, cr, 350 + s))
    for k in range(4):   # a crest down the neck
        p = neck[1] + (neck[3] - neck[1]) * (k / 3)
        head.add(lean_shard(p + Vector((0, 0.05, -0.28)), Vector((0, 0.4, -1)), 0.32, 0.07, 4, 0.6, cr, 360 + k))
    ec = hc + Vector((0, 0.1, 0.52))
    ef = Vector((0, 0.12, 1)).normalized()
    head.add(gloom_eye(ec, ef, 0.17, m, lean=True))
    head.add(socket(ec, ef, 0.17, m, 23, lean=True))
    cast.part(root, 'head', head, base)


def late_preview(cast):
    objs = {r.name: r for r in cast.roots}
    sheet(cast, 'hives-batch.png', rows=[LATE], gap=1.2, size=(2200, 1000), elev=35, yaw=10, ortho=21.5,
          hide=[n for n in objs if n not in LATE])


def build():
    style.reset_scene()
    cast = Cast(FILE)
    m = materials()
    for fn in (note, thornhive, clamhive, forgehive, greyheart, hushbell, echo_bell, captain_barnacle, coilwyrm):
        fn(cast, m)
    return cast


def main():
    cast = build()
    cast.export(BUDGETS)
    if '--render' in args():
        sheet(cast, 'hives.png', rows=[ORDER], gap=1.4, size=(2200, 900), elev=40, yaw=0, ortho=30, hide=LATE)
        sheet(cast, 'hives-front.png', rows=[ORDER], gap=1.4, size=(2200, 800), elev=10, yaw=0, ortho=30, hide=LATE)
        sheet(cast, 'hives-note.png', rows=[['note']], size=(600, 600), elev=20, yaw=0, ortho=1.0,
              hide=[n for n in ORDER + LATE if n != 'note'])
        late_preview(cast)


if __name__ == '__main__':
    main()
