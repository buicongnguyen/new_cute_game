# Cloudback: what to copy from Zoo Garden, and in what order (v2, reviewed)

Version 1 (2026-10-16, commit 8d4dc90) listed about 70 Zoo Garden modules to copy in seven phases. This version is the same plan after a review against a AAA bar. The review covered three things: the ideas (does each one make Cloudback better, or only bigger?), the logic (does it fit the story and the rules?) and the code (do the files exist, and what does a port really cost?). Section 1 gives the findings. Sections 2–8 are the refined plan, and nothing in it is built yet.

Zoo Garden (`cute_game`) is the owner's own game and code, so its modules may be ported. Each port names the Zoo Garden file it came from in a header note, as `house-plan.ts` already does. Zoo Pet's own content is never copied.

## 1. Review findings

### 1a. The ideas: "more" is not "AAA"

Version 1 copied nearly every Zoo Garden system. AAA games in this genre (Animal Crossing, Stardew Valley, A Short Hike, Ni no Kuni, Mario Kart 8 for polish) do **fewer systems, each finished to a high bar**, all serving one fantasy. Copying everything would turn Cloudback into a re-skinned Zoo Garden and spread the work thin.

**The fix:** every item must pass the **pillar test**. Cloudback's three pillars are:

1. **Bao is home, and home grows.** The whale, the deck, the garden, the crew and the cottage get bigger and livelier because of you.
2. **The sky is wide and alive.** Flying, islets, weather, what lies below, and things to find.
3. **Song beats the Gloom.** Fights are bell and rhythm combat, freeing and never killing; freed creatures go home or join you.

An item that serves none of the pillars is cut, however good it is in Zoo Garden.

**Cut or deferred from version 1:**

| Item | Verdict | Why |
|---|---|---|
| Three save profiles | Cut | A one-captain story; export codes cover sharing a device. |
| Leaderboard / records board | Deferred | No server, no rivals; the Logbook covers personal bests. |
| Flag Rush, Titans | Cut | Off-pillar (competitive modes). |
| Dyes and the mirror look builder | Deferred | A captain's coats come later, as story rewards, not a shop. |
| Forging +1…+10 | Reduced to 3 tiers | Ten tiers is grind; three tiers, each with a visible change, read better. |
| Daily check-in rewards, login streaks | Replaced | Mobile retention tricks feel cheap at this bar. Use a **day cycle** instead (below). |
| News inbox | Merged | Folded into the Logbook and Bao's letters from friends. |
| Swimming | Cut | Cloudback has no water you can walk into; the skiff covers the sea. |
| Fish harpoon hunting | Deferred | The reel game was just ported; deepen it before adding a second fishing mode. |

### 1b. The logic: places where version 1 contradicts the game

| Problem in version 1 | Fix |
|---|---|
| **Pets from freed Gloom forms** contradicts the story: freed creatures return home (STORY.md, ch. 1–5). | Pets are **hatched or befriended**: a cloud-puppy egg from Nana's chest, a glowfish from the skiff, a puffbun that **asks** to stay after a land is freed. The freeing rule stays intact. |
| **The always-on mini map on Bao's deck**: the deck is about 36 × 32 m even at the Grand Deck, all visible on screen. A mini map there is noise. | The mini map shows **only on lands and Gloom ships** (where you lose your way). On Bao, the same corner shows **Bao's heading and what lies below** (compass and next-place arrow). |
| **The helper bot plants and harvests while you are away**: it removes the core garden verb. | Juno's bot **waters and gathers fallen fruit** (half yield, never planting), and only during voyages. Planting and the full harvest stay the player's. |
| **Free steering of Bao** breaks the gated story order (Frostfall needs the Storm Coat, etc.). | Steer freely **inside the opened sky**; a gate is a weather wall with a shown reason ("Too cold: the Storm Coat"), never an invisible stop. Story voyages stay one tap away for players who don't want to steer. |
| **A five-button fight on phones**, beside the stick, the Reel and the Pull buttons, breaks the 44 px / thumb-arc rule. | **Three buttons on phones** (Ring, Hop, Bell move: the third button changes with the equipped bell). On desktop, keys 1–3 swap moves. The charged Great Bell is "hold Ring", so it needs no button. |
| **Bow combat from the scooter** on a phone means aiming while flying. | **Lock-on aim**: the nearest bug in front is targeted automatically; tap to shoot, drag to switch targets. |
| **Daily tasks** make a story game feel like a chore list. | A **day cycle on Bao** (about 20 real minutes): dawn, day, dusk, night. Each day brings 3 small "sky requests" from the crew, and fresh islets drift by. Nothing is lost by skipping a day, so there are no streaks. |
| **The goal ladder under each chapter** could block the story. | Ladder steps are **optional**, except the ones the story already needs. A chapter gift goes to completing 5 of 8 steps, not all 8. |

### 1c. The code: what a port really costs

- **All 70 referenced Zoo Garden files exist** (checked 2026-10-16), from 9 lines (`tree-crops.ts`) to 603 (`farm-view.ts`).
- **They depend on Zoo Garden's state shape.** A "port" means rewriting each one against Cloudback's `GameState`. The pure rules (`five-rules`, `power-rules`, `pet-surge`, `weapon-forge`, `goals`, `journal-badges`) port cleanly, with their tests. The views (`minimap`, `farm-view`, `friend-crew`) are about 50% rewrite. Version 1's estimates assumed copy-and-rename; real costs are about **1.5–2×**.
- **`src/game.ts` is 1852 lines with 152 methods**, the only orchestrator. Adding six phases of systems to it would make it unmaintainable and slow to test. **A new Phase 0 splits it first.**
- **Saves are at version 2** (`SAVE_VERSION`). Each phase adds fields; a chained migration per phase is needed, with a test that loads every earlier version.
- **Budgets** (DESIGN §16): Bao ≤ 140 draw calls, ≤ 120k triangles, ≤ 3 MB before play. Pets, animals and decorations all add to Bao's deck. The budget must be measured before and after each phase (`smooth-dense-scenes/scripts/render-probe.mjs`), with instancing planned from the start.
- **The story sim** (`tests/sim.ts`) only knows the main path. New loops change pacing, so the sim must learn each loop in the phase that adds it.
- Audio exists (`src/core/audio.ts`, `src/sfx.ts`); every new verb needs its sound in the same phase, not later.

## 2. The AAA bar: what "done" means for every item

An item ships only when all of these hold. They come from the owner's art direction ("AAA" = the Mario Kart 8 bar: vivid warm colour, depth of story and logic) and the web-game-craft numbers.

| Area | Done means |
|---|---|
| **Feel** | Input answered on the same frame; a contact flash and a sound on the contact frame; hit-stop 40–120 ms; camera damped by rates; filmstrip proof. |
| **Look** | Vivid warm palette; reads as silhouettes in the squint test; one landmark per area; no placeholder art. |
| **Sound** | 3–5 variants per action, ±5% pitch, on the right bus. |
| **UI** | Opens and closes with motion (150–250 ms); text ≥ 11 px; taps ≥ 44 px (action buttons ≥ 64); safe areas; keyboard and gamepad paths; English and Vietnamese. |
| **Story** | At least one character line ties the system into the world. Nothing appears without a reason. |
| **Teaching** | Introduced by doing, at the moment it's needed; there are no rule pages. |
| **Speed** | Inside DESIGN §16 budgets, measured; no new shader compiles during play (warm-up). |
| **Tests** | Rules unit tests; the story sim still finishes with no stuck runs; both browser suites pass on dev, the build and live. |
| **Saves** | The migration is tested from every earlier version. |

## 3. The refined story structure

The five chapters stay the spine. Around them:

1. **Chapter ladders:** 8 optional steps under each chapter. The gift goes to 5 of 8, and every step teaches a system (seeded from Zoo Garden's `STORY_STEPS` and `story-gifts.ts`).
2. **Friend quests:** three steps per rescued friend, each ending in a **scene** (camera, lines, a gift that changes the deck):
   - **Pip:** the lost seed pouch, which unlocks the Blossom Tree.
   - **Mina:** the family recipe, a new dish that heals and boosts.
   - **Ria:** the lighthouse lamp, which lights the deck at night.
   - **Tam:** the first anvil, which unlocks bell tier 2.
   - **Juno:** the runaway bot, which unlocks the helper bot.
3. **The day cycle:** 3 sky requests a day, fresh islets, and night events (Deck Defence nights after chapter 3).
4. **Collections** (the Collect tab): fish, freed creatures (where they went home), seeds, decorations, islets and keepsakes. Each completed page gives a decoration.
5. **After the ending:** the Deep Mist Vault, the Storm Leviathan, Deck Defence nights and the last islets. Plus a **postgame letter chain** from Bao's pod, so the world keeps talking.

## 4. The plan, phase by phase

Each phase ships on its own and must meet section 2. Effort is in focused days, including art, sound, tests and the deploy.

### Phase 0: foundations (new; 2–3 days)
- **Split `game.ts`** into systems (`deck`, `isle`, `ship`, `skiff`, `drone`, `raid`, `camera`, `story`), each with `enter`, `update` and `exit`, sharing one event bus (`harvested`, `freed`, `caught`, `built`…). Ladders, collections and achievements listen to the bus instead of being called from everywhere.
- **Save migration chain:** v2 → v3 → …, with a fixture save per version in `tests/saves/`.
- **A budget probe** in the browser suite: draw calls and triangles on Bao, a land and a ship, failing above DESIGN §16.
- **UI shell:** one panel component (open and close motion, focus trap, gamepad and keyboard navigation, back button). This is a port of the ideas in `dialog-dock.ts`, `tab-cues.ts` and `item-groups.ts`.
- **The Interact pick rule** (`interact-pick.ts`): the nearest thing in front of the player wins, which fixes the planter box that steals the hatch.
- **Acceptance:** everything plays the same as today (the suites pass unchanged); `game.ts` is under 600 lines.

### Phase 1: the menus, map and journal (4–5 days)
- **Dock:** a right-edge menu column with SVG icons (`hud-icons.ts`, `hud-layout.ts`): Bag, Journal, Sky Map, Crew, Logbook, Settings. On phones it folds into one button. Red badges come from `journal-badges.ts`.
- **Map, by place:**
  - **On lands and ships:** a round mini map (`minimap.ts` method: terrain drawn once, markers redrawn every 0.2 s). It shows Gloom groups, Spires, cages, the boss crown, the rope home, the market and ore, plus the facing arrow. A caption and an arrival flag show when you land (`place-flags.ts`).
  - **On Bao:** a compass ribbon with Bao's heading, the next-goal arrow and "Below: forest / sea / clouds".
  - **Full map:** tapping either opens the Sky Map.
- **Journal:** three tabs.
  - **Story:** chapters, the ladder and friend quests.
  - **Sky:** today's requests and bounties.
  - **Collect:** collections and achievements.
- **Goal card and guided walk:** tapping the goal shows a trail of dust motes to it (`quest-walk.ts`, `guide.ts`). Pointers show only in the first 30 minutes, or after 60 s with no progress.
- **Acceptance:**
  - a new player finds every next goal without help: the playtest bot uses only the trail;
  - panels pass the 11/44 audit on a 360 × 740 phone;
  - the journal has full Vietnamese.

### Phase 2: ladders, friend quests, collections and the day cycle (4–5 days)
- **Chapter ladders and gifts** (`story-gifts.ts`, `story-catchup.ts`, so old saves get the gifts they have earned).
- **The five friend quests**, with their scenes.
- **The day cycle:** the lighting changes over the day; there are 3 sky requests a day; nothing is lost by skipping.
- **Collections and achievements** (`goals.ts`, `goals-ui.ts`), driven by the event bus.
- **Difficulty:** Gentle, Normal and Brave (`difficulty.ts`). Brave raises Gloom health and raid pressure; Gentle widens the reel's safe zone.
- **Sim acceptance:**
  - the attentive path still finishes in 45–60 minutes;
  - a player doing ladders and quests reaches 2–3 hours of story;
  - no run gets stuck.

### Phase 3: life on Bao (5–6 days, with art)
- **Sky pets:**
  - two slots (`pet-slots.ts`) and guard moves (`pet-guard.ts`);
  - **Bond Surge** on the third ring (`pet-surge.ts`);
  - three pets to start: the cloud pup, the glowfish and the puffbun;
  - each pet has idle play on the deck: it sleeps in the sun, chases specks and greets you after a voyage.
- **Deck animals:**
  - sky hens give eggs and puffsheep give wool (Fibre); a bee box gives honey and keeps the trees' Sky Spark rate up;
  - they roam the deck with `farm-roam.ts` rules and are instanced (`farm-view.ts` method).
- **Decorations:**
  - place, move and turn them with a ghost preview (`placement-ghost.ts`, `decor-move.ts`), snapped to the planks;
  - 20 to start, half of them earned through collections and quests;
  - **decorations have uses:** lanterns light the night, benches seat the crew, and a wind chime slows Gloom on the deck during raids.
- **Juno's helper bot** (reduced scope; see 1b).
- **Bigger bag and chest** (`storage-slots.ts`).
- **Budget acceptance:** Bao with 2 pets, 6 animals and 20 decorations stays ≤ 140 draw calls.

### Phase 4: song combat (5–7 days)
- **Three phone buttons and five moves.**
  - **Ring:** a chain of 3 hits. **Hold Ring** charges the **Great Bell** (the power-strike rules in `power-rules.ts`).
  - **Hop:** a jump and dodge with 0.1 s of coyote time.
  - **The bell button** depends on the equipped bell (`moves.ts` patterns):
    - the chime staff throws a chime (Lob);
    - the gong hammer strikes a ground gong (Quake);
    - the wind-bell bow shoots (Rush becomes a dash shot).
- **Rhythm layer, unique to Cloudback:** hits **on the music's beat** (a ±90 ms window) ring brighter and free Gloom faster. This is shown by a soft pulse on the Ring button. It is never required, but it is the mastery path.
- **Gear:**
  - three bells, each with three tiers at Tam's anvil (`weapon-forge.ts`, reduced);
  - each tier changes the look: the brass brightens, then gets a ribbon, then a glow;
  - a ring trail that is visible when you ring (`weapon-trail.ts`).
- **Gloom variety:**
  - elite forms: Warden (shield), Mender (heals others) and Caller (summons) (`elite-roles.ts`);
  - bosses stagger and visibly crack (`boss-stagger.ts`, `boss-wear.ts`).
- **Feedback:** hit-stop, flash (`flash-materials.ts`), a directional kick, a combo count and a target ring.
- **Acceptance:** filmstrip proof for response under 100 ms; telegraphs of at least 0.25 s; the sim re-balanced; boss fights 60–120 s.

### Phase 5: the open sky (6–8 days)
- **Steer Bao** on the Sky Map inside the opened sky (`space.ts` and `ship-sequence.ts` methods):
  - weather walls give their reasons;
  - departure and arrival scenes;
  - one-tap story voyages remain.
- **Sky islets** (the owner's idea):
  - 8 hand-made islets plus drifting daily ones, reached by the scooter's tether;
  - Zoo Garden's tree kits (`tree_round`, `tree_blossom`, `cloudtree`), re-tinted to Cloudback's palette;
  - bugs and bees to free with the wind-bell bow, using lock-on aim;
  - rewards: **new seeds** (each islet's own tree), sparks and decorations;
  - one landmark per islet.
- **Denser lands:** biome scatter, instanced (`biomes.ts`, `scatter.ts`, `cover-cards.ts`); breakable ice on Frostfall (`breakables.ts`).
- **The Cloud Koi Queen:** a rare reel fight under the skiff (`lake-guardian.ts`).
- **Acceptance:** an islet is in view at least every 60 s of free flight; lands stay ≤ 200 draw calls.

### Phase 6: after the story (5–6 days)
- **Deck Defence nights** (from Rescue Call, `rescue-*.ts`, merged with the existing raids): lanes, crew at guard posts, and decorations as defences.
- **The Deep Mist Vault** (from Delvers' Vault, `dungeon-*.ts`): five crystal rooms. A new layout each day (seeded); best time recorded.
- **The Storm Leviathan** (from Colossus, `colossus-*.ts`): a sleeping sky giant in the Storm Belt, woken once a day.
- **Bao's Logbook** (from the Almanac, `insight-*.ts`): Bao's growth, harvests, catches, personal bests and the pod's letters.

### Phase 7: feel, look and speed (with every phase)
- Camera rig (`camera-rig.ts`), fading tall scenery between camera and hero (`occluders.ts`), ink outlines (`outline.ts`), background shader warm-up (`safe-compile.ts`).
- One **polish pass at the end of each phase** against section 2, with screenshots on a phone and desktop that were actually opened.

## 5. Mapping table (Zoo Garden → Cloudback)

| Zoo Garden | Cloudback | Phase |
|---|---|---|
| `dialog-dock`, `tab-cues`, `item-groups` | Panel shell | 0 |
| `interact-pick` | Interact pick | 0 |
| `hud-icons`, `hud-layout`, `journal-badges` | Dock and badges | 1 |
| `minimap`, `place-flags` | Land and ship map, arrival flags | 1 |
| `quest-walk`, `guide`, `guide-ui` | Goal trail, first-30-minutes pointers | 1 |
| `STORY_STEPS`, `story-gifts`, `story-catchup` | Chapter ladders | 2 |
| `goals`, `goals-ui` | Collections and achievements | 2 |
| `difficulty` | Gentle, Normal, Brave | 2 |
| `pet-slots`, `pet-guard`, `pet-surge`, `pet-card` | Sky pets | 3 |
| `farm`, `farm-roam`, `farm-view` | Deck animals | 3 |
| `placement-ghost`, `decor-move`, `decorations-art` | Decorations | 3 |
| `helper` (reduced) | Juno's bot | 3 |
| `storage-slots` | Bag and chest | 3 |
| `five-rules`, `moves`, `power-rules` | Ring, Hop, bell moves, Great Bell | 4 |
| `weapon-forge` (3 tiers), `weapon-trail` | Bells | 4 |
| `elite-roles`, `boss-stagger`, `boss-wear` | Elite Gloom, boss cracks | 4 |
| `space`, `ship-sequence` | Steering Bao | 5 |
| `biomes`, `scatter`, `cover-cards`, `breakables` | Islets and dense lands | 5 |
| `lake-guardian` | Cloud Koi Queen | 5 |
| `rescue-*` | Deck Defence | 6 |
| `dungeon-*` | Deep Mist Vault | 6 |
| `colossus-*` | Storm Leviathan | 6 |
| `insight-*` | Logbook | 6 |
| `camera-rig`, `occluders`, `outline`, `flash-materials`, `safe-compile` | Feel and speed | 7 |

## 6. Rules for every port

1. **Attribution:** a header note naming the Zoo Garden file; names and content re-themed. Zoo Pet content is never copied.
2. **Pure rules** in `src/rules/` with Node tests; views only display state. New systems talk through the event bus.
3. **The story sim** learns each new loop in the same phase; pacing targets are in each phase's acceptance.
4. **Translations:** every string goes through `t()`, with Vietnamese in `src/vi.ts`.
5. **Budgets** measured before and after (draw calls, triangles, download size, frame time on a mid phone).
6. **Saves:** one migration per phase, with a fixture test.
7. **Section 2 is the bar.** A phase is not done until every item in it meets it.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Scope creep: 40+ days of work | Phases ship alone; the pillar test cuts anything off-pillar. |
| Bao's deck over budget with pets, animals and decorations | Instancing from the start; a decoration cap per deck tier; the budget probe fails the build. |
| Ports drag in Zoo Garden's assumptions | Port rules plus tests first; rewrite views against Cloudback's state. |
| Pacing breaks | The sim gates every phase. |
| Phone controls overcrowd | Three-button rule; the dock folds; the 11/44 audit in the suite. |

## 8. Order and effort

| Phase | Days |
|---|---|
| 0: foundations | 2–3 |
| 1: menus, map, journal | 4–5 |
| 2: ladders, quests, day cycle | 4–5 |
| 3: life on Bao | 5–6 |
| 4: song combat | 5–7 |
| 5: open sky | 6–8 |
| 6: after the story | 5–6 |
| 7: feel and speed | with each phase |
| **Total** | **31–40 days** (about 6–8 weeks) |

**Recommended start:** Phase 0, then Phase 1. These give the quickest visible jump in quality, and everything later depends on the event bus and the panel shell.
