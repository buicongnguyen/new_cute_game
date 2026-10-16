# Cloudback art contract (Blender → glTF → game)

The game code depends on everything in this file. Generators live in `art/blender/kit/`, and each one writes one GLB into `public/assets/models/`. If a model is missing or still loading, the code falls back to simple shapes, so a missing node never breaks the game, but it does look wrong.

## Global rules

- **Space:** glTF Y up, metres, +Z is the front of every character and creature. (In Blender: Z up, −Y front; `style.py` handles the conversion.) The origin is at the ground centre (between the feet) unless stated otherwise.
- **Look:**
  - Vivid, warm, toy-like, chunky, with soft bevels. The quality bar is stylized console art; never pastel or beige.
  - Flat colours, with no textures and no normal maps.
  - Smooth-by-angle shading.
  - Readable silhouettes from a 45° camera 20 m away.
- **Materials:**
  - Use the shared palette materials named `pal_<colour>` (for example `pal_leaf`, `pal_sky`). The same name means the same colour in every file, so the game can share and merge them.
  - Glow materials are named `glow_<colour>` and are emissive.
  - Gloom crystal is `gloom_crystal` (grey-violet, slightly glossy), and Gloom eyes are `glow_gloom` (violet `#B26BFF`, emissive).
- **Triangle budgets:** see each file below. Stay under them; the game must run at 60 fps on phones.
- **Part names:**
  - Node names are part of the contract: keep them exact. Animated parts are separate nodes, with the pivot at the joint.
  - Children of a character root use generic names (`body`, `head`, `arm_l`…). The code finds the root by name, then the child inside it.

## Files

### `whale.glb` (Bao, the calf; the code scales it per stage)

- **Size and walk surface:**
  - About 22 m long (head at +Z), 9 m wide and 7.5 m tall.
  - **The walkable deck is the top of the back, at y = 0 (±0.15)** inside an ellipse with half-axes x 4.4 and z 8.0, centred at the origin.
  - The body hangs below, with the belly at about y = −6.5.
- **Moss deck:** a soft green moss layer on top of the back, with tiny flowers at the edge. It is part of `body`.
- **Body colours:** saturated sky blue and teal, a cream belly, darker blue spots, pink cheeks.
- **Nodes:**
  - `body`: the whole whale except the parts below.
  - `tail`: the fluke, with its pivot at the tail root (about z −9.5). The code swings it up and down.
  - `fin_l`, `fin_r`: the side fins, with pivots at the fin roots. The code flaps them.
  - `eye_l`, `eye_r`: big friendly eyes (white with a dark pupil and a highlight), each a separate node centred on the eye. The code squashes Y to blink.
  - Empty markers: `mouth` (front of the head, where you feed Bao), `blowhole` (top of the head, where the fountain spray starts) and `tailtip`.
- **Budget:** ≤ 14,000 triangles.

### `keeper.glb` (the player)

- A chibi child about 1.1 m tall: a big head, teal coat, orange scarf, warm skin and brown boots.
- **Nodes** under the root `keeper`: `body`, `head`, `arm_l`, `arm_r`, `leg_l`, `leg_r` (pivots at the shoulders and hips), and `mallet` (a bell mallet: wooden handle with a golden bell head, a child of `arm_r`).
- **Budget:** ≤ 3,000 triangles.

### `crew.glb` (people)

- Roots `nana`, `pip`, `olla`, `kai`, `mina`, `coal`, `tam`, `ria`. Each has children `body`, `head`, `arm_l`, `arm_r`, `leg_l`, `leg_r`, built like the keeper, 0.95–1.15 m tall, and each with a distinct silhouette and colours:
  - **Nana:** shawl, bun hair, cane.
  - **Pip:** straw hat, green overalls.
  - **Olla:** mayor sash, round glasses.
  - **Kai:** fisher hat, beard.
  - **Mina:** chef hat, apron.
  - **Coal:** soot apron, white hair.
  - **Tam:** leather apron, goggles.
  - **Ria:** red bandana, spyglass.
- **Budget:** ≤ 2,500 triangles each.

### `gloom.glb` (Gloom forms, freed animals, cage)

- **Gloom forms**, each wrapped in `gloom_crystal` shards, with a `glow_gloom` eye:
  - `gloomling`: a 0.8 m blob.
  - `spitter`: 0.9 m, with a mouth tube.
  - `brute`: 1.6 m tall and 2 m long, with horns.
  - `flyer`: 1.4 m wingspan, with `wing_l` and `wing_r` nodes.
  - `spire`: a 3.5 m crystal pillar with a glowing core.

  Children: `shell` (the crystal part) and `eye` (the glow).
- **Freed animals** (cute, warm colours, no crystal): `puffbun` (round bunny, 0.5 m), `hopfrog` (0.45 m), `rockgoat` (0.9 m), `skylark` (0.4 m, with `wing_l` and `wing_r`).
- `cage`: a crystal cage 2.0 m tall and 1.4 m wide, open in the middle so a person fits inside. Material `gloom_crystal`, slightly transparent.
- **Budget:** ≤ 1,500 triangles each (spire ≤ 1,200, cage ≤ 900).

### `hives.glb` (bosses and Notes)

- `thornhive`: a 5 m crystal tower with thorn crowns.
- `clamhive`: a 5 m wide clam with Gloom crust. Children: `shell_top` (pivot at the back hinge, so the code opens it by rotating X), `shell_bottom` and `pearl` (a glowing pearl inside).
- `forgehive`: a crusted golem 5 m tall. Children: `body`, `head`, `arm_l`, `arm_r` (pivots at the shoulders).
- `greyheart`: a 6 m faceted crystal heart. Children: `core` (glow), and `shard_0`…`shard_5` floating around it.
- `note`: a 0.6 m golden glowing crystal shaped like a music note, using `glow_gold`.
- **Budget:** ≤ 6,000 triangles each.

### `trees.glb` (garden trees, three stages each)

- For each id in `puffberry`, `ropevine`, `cloudpear`, `chimewood`, `honeybun`, `glowplum`, `starfig`, `golden`, there are roots:
  - `<id>_sprout`: 0.4 m;
  - `<id>_young`: about 1 m;
  - `<id>_grown`: 1.6–3 m, with a child mesh `fruits` holding all the ripe fruit, which the code shows or hides.
- Each tree must be recognisable by its silhouette and its fruit colour:

| Tree | Looks like | Fruit |
|---|---|---|
| Puffberry | Round bush | Pink-red berries |
| Ropevine | Curly vine on a little trellis | Green fibre pods |
| Cloudpear | Tree | Pale gold pears |
| Chimewood | Slim tree | Little hanging bells, gold |
| Honeybun | Squat tree | Brown buns |
| Glowplum | Tree | Glowing violet-blue plums (`glow_plum`) |
| Starfig | Twisty tree | Star-shaped orange figs |
| Golden | Tree | Golden leaves, no fruit (an empty `fruits` node is fine) |

- `plot`: a round moss patch 1.6 m across, slightly raised, with a soft glowing edge (`glow_moss`).
- **Budget:** ≤ 1,500 triangles per stage.

### `props.glb` (Bao's deck, camps, isles)

| Root | What it is | Size |
|---|---|---|
| `hut` | Nana's round hut with a lantern | About 3 m tall |
| `workbench` | Workbench | — |
| `kitchen` | Stove with a pot | — |
| `maptable` | Map table with a rolled map | — |
| `ropepost` | Post with a pulley and coiled rope | — |
| `fishspot` | Small railing platform with a rod holder | — |
| `pantry` | Woven basket chest | — |
| `chimepost` | Pole with three bells; a raid tower | 2.2 m |
| `postspot` | Small stone ring | — |
| `market` | Stall with an awning that uses `pal_awning`, which the code tints per isle | — |
| `tent` | Tent | — |
| `lantern` | Paper lantern | — |
| `windmill` | Windmill (Clover) | Child `blades` spins, pivot at the hub |
| `coral_arch` | Coral arch | — |
| `ore_rock` | Grey rock with gold-orange ore glints | — |
| `forge` | Cold stone forge | — |
| `rod` | Fishing rod | 1.6 m; marker `tip` |
| `speck` | Small Gloom crystal cluster | 0.35 m |
| `skydew` | Small puffy cloud with a sparkle | 1.2 m |

**Ship deck.** Bao's back is a wooden ship deck. Nana's hut is replaced by a hatch that leads down into the cabin. The cabin interior reuses the owner's house kit from Zoo Garden (`house.glb` and its house plan), so it is not part of this file.

| Root | What it is | Nodes and markers | Size |
|---|---|---|---|
| `hatch` | Round hole in the deck with a raised brass rim, a dark shaft and the top rungs of a ladder; a little lantern post beside it | Child `door`: the planked lid with iron straps, pivot on the hinge at the back edge (−Z). The code opens it by rotating `door.rotation.x` negative, to about −1.9 rad (the lid then stands up behind the hole). | Hole 1.6 m across, rim 0.12 m high; origin at the hole centre, deck surface y = 0 (the shaft goes down to y −0.75) |
| `planter` | Rounded square planter of wooden planks, filled with moss soil, with a thin `glow_moss` rim line | Empty marker `soil` at the centre of the soil top (y 0.27); trees are placed there | 1.5 m wide, 0.3 m tall |
| `gong` | Raid gong. During a Gloom raid everything else on the deck sinks below and only battle tools stay up. A golden gong (`pal_gold` face, bronze `pal_tangerine` rim, a thin `glow_gold` ring) hangs on red cords in a chunky `pal_wood_dark` frame with feet; a red-headed striker mallet hangs on a side peg | Child `disc`: the gong with its cords, pivot at the top hanging point (0, 1.7, 0), just under the crossbar. The code wobbles it with `disc.rotation.x` when it is rung. At rest the face leans about 12° up toward the camera; the lean is in the mesh, so the node rests at identity. | 1.9 m tall, 2.25 m wide; origin at the frame's foot centre, deck y = 0 |

- **Budget:** ≤ 2,000 triangles each. Exceptions: `hatch` ≤ 1,500, `planter` ≤ 600 and `gong` ≤ 900.

### `nature.glb` (isle scenery, drawn instanced)

- **Roots:**
  - `rock_a`, `rock_b`, `rock_c`;
  - `bush_a`, `bush_b`;
  - `flower_a`, `flower_b`, `flower_c` (small clusters);
  - `grass_tuft`, `mushroom`;
  - `tree_round`, `tree_pine`, `palm`;
  - `coral_a`, `coral_b`;
  - `lava_rock_a`, `lava_rock_b`;
  - `fence`, `cloud_puff`.
- `cloud_puff`: a soft low-poly white cloud lump about 4 m across, with warm white on top and a cool blue-lilac underside. The underside colour is a second material, `pal_cloud_shade`.
- Each root should be a single mesh with one or two materials. They are drawn thousands of times.
- **Budget:** ≤ 400 triangles each (trees ≤ 700, `cloud_puff` ≤ 300).

### `fish.glb` (sky fish)

- `puff_minnow`: small and round, sky blue.
- `sun_carp`: gold-orange.
- `star_ray`: a violet ray with star spots.
- `cloud_koi`: white with red and pink patches and long fins.
- **Size:** 0.3–0.8 m.
- **Budget:** ≤ 500 triangles each.

## Delivery checks

- Each generator writes a preview PNG to `art/previews/<file>.png`: every root, labelled, in a contact sheet under game-like light.
- `art/asset-manifest.json` lists each GLB with its roots, triangle count per root and file size.
- The whole model folder must stay under 2.8 MB (it includes the owner's Zoo Garden house kit, `house.glb`, 0.19 MB).
