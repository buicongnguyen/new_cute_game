# Codex task list

Build the plan in `docs/COPY-PLAN.md` (the why and the bar) as these tasks, **in order**. Read `AGENTS.md` first for the commands and rules.

Each task:
- is one branch `codex/<id>`;
- ends with `npm test`, `npm run typecheck`, `npm run build`, and both browser suites passing;
- updates `docs/DESIGN.md` for the rules it adds.

A **Done when** line is the acceptance; meet all of it.

Zoo Garden source paths below are relative to `../cute_game/src/`.

---

## Phase 0: foundations

### T00: borrowed-art plumbing
- Create `src/world/borrowed.ts`: a `BORROWED` table, role → `{ file, node, tint? }`, plus a `loadBorrowed(role)` helper using the existing loader in `src/world/assets.ts`.
- Create `docs/BORROWED-ASSETS.md` with columns: role, source file, source node, used in, size (kB), status (`borrowed` / `placeholder` / `replaced`).
- Create `public/assets/models/borrowed/` and make sure `scripts/pack-models.mjs` packs it too.
- **Done when:** a unit test checks that every role in `BORROWED` has a row in `BORROWED-ASSETS.md`, and the reverse.

### T01: event bus
- `src/core/events.ts`: a typed bus. `emit(name, payload)` and `on(name, fn)`, returning an unsubscribe function.
- Events: `harvested`, `planted`, `sold`, `built`, `cooked`, `caught`, `freed`, `bossFreed`, `landed`, `departed`, `chapter`, `goal`, `raidWon`, `islet`, `pet`.
- Emit them from the existing places in `src/game.ts` and the rules.
- **Done when:** a test asserts the event sequence of the first chapter played by the sim.

### T02: split `game.ts`
- Move each mode's code into `src/systems/<name>.ts`, using an interface `{ enter(), update(dt), exit() }`.
  - Systems: `deck`, `isle`, `ship`, `skiff`, `drone`, `raid`, `cut`.
  - Plus `camera.ts` and `interact.ts`.
- `game.ts` keeps the loop, mode switching and shared state.
- **No behaviour change.**
- **Done when:**
  - `src/game.ts` is under 600 lines;
  - both browser suites pass unchanged;
  - `scripts/chapters-shot.mjs` screenshots look the same.

### T03: the Interact pick
- Port `interact-pick.ts`: score each target by distance and by the angle in front of the player.
- Use it for every interactable: plots, hatch, crate, workbench, crew, cages, rope.
- **Done when:** a unit test covers "the hatch beside a plot, facing the hatch: the hatch wins". The playtest's hatch approach from `x - 1.0` can be removed.

### T04: save migration chain
- Turn the migrations into a chain (`v2 → v3 → …`).
- Add `tests/saves/` fixture JSON for v1 and v2.
- **Done when:** a test loads every fixture and gets a valid current state.

### T05: panel shell
- `src/ui/panel.ts`: one component for every sheet and panel.
  - Open and close with a 180 ms motion (none under `prefers-reduced-motion`).
  - Focus trap; Esc and back-button close.
  - Arrow-key and gamepad navigation.
- Tabs with scroll cues (port `tab-cues.ts`); grouped lists (port `item-groups.ts`).
- Panels dock to the side on desktop when wider than 1100 px (port `dialog-dock.ts`).
- Move the existing panels in `src/ui/panels.ts` onto it.
- **Done when:** `scripts/panels-shot.mjs` shows every panel working at 360 × 740 and 1440 × 900, and an audit script finds no text under 11 px and no tap target under 44 px.

### T06: budget probe
- Add `scripts/budget.mjs`. It opens Bao, a land and a ship through `?test` states, reads `renderer.info.render.calls` and triangles, and fails above DESIGN §16.
- **Done when:** it runs in both browser suites and prints a table.

---

## Phase 1: menus, map and journal

### T10: dock and icons
- Port `hud-icons.ts` (the SVG icon set) and `hud-layout.ts` into `src/ui/`.
- Build a right-edge dock: Bag, Journal, Sky Map, Crew, Logbook (hidden until T26), Settings.
  - On phones it folds into one menu button that opens a column.
  - It replaces the four emoji buttons.
- Badges: port `journal-badges.ts`, so a red dot shows when something can be claimed.
- **Done when:** the dock passes the 11/44 audit and works with the keyboard, gamepad and touch.

### T11: mini map (lands and ships)
- Port `minimap.ts` into `src/ui/minimap.ts`: a round 150 px canvas, top-right under the dock.
  - The land or ship deck is drawn once.
  - Markers are redrawn every 0.2 s: player arrow, Gloom groups, Spires, cages, boss, rope home, market, ore.
- Shown only in the `isle` and `ship` modes. Tapping it opens the Sky Map.
- Port `place-flags.ts`: an arrival banner with the place name.
- **Done when:** a browser test reads the minimap's marker list through a test hook.

### T12: compass ribbon (on Bao)
- On Bao, in the minimap's place, show a slim ribbon with Bao's heading, an arrow to the next goal's place, and "Below: forest / sea / clouds" (from `BELOW`).
- **Done when:** it shows in the `deck` mode only.

### T13: journal with tabs
- Rebuild the journal on the panel shell, with three tabs:
  - **Story:** chapters, ladder steps (T20), friend quests (T21).
  - **Sky:** day requests (T22).
  - **Collect:** collections and achievements (T23).
- Until those tasks land, the tabs show what exists.
- **Done when:** badges on the tabs match what can be claimed.

### T14: goal trail and first-run guide
- Port `quest-walk.ts`: tapping the goal card draws a trail of glowing motes along the path to the goal target. Use the interactables from T03.
- Port `guide.ts` and `guide-ui.ts`: a pulsing pointer at the next thing, in the first 30 minutes of play, or after 60 s without progress.
- **Done when:** a new playtest, `scripts/trail-playtest.mjs`, completes chapter 1 by following only the trail's target positions from the test hook.

---

## Phase 2: story web

### T20: chapter ladders
- In `src/rules/ladder.ts`, give each chapter 8 optional steps. They are listed in COPY-PLAN §3; write steps that teach the systems that exist.
- Steps complete from bus events.
- The chapter gift (seeds, sparks, a decoration) comes at 5 of 8. Port `story-gifts.ts`, and `story-catchup.ts` so old saves get earned gifts.
- **Done when:**
  - the rules have tests;
  - the sim still finishes in 45–60 minutes on the attentive path;
  - the sim's "completionist" profile does all the ladders.

### T21: friend quests
- Three steps for each of Pip, Mina, Ria, Tam and Juno, with the goals and gifts in COPY-PLAN §3.
- Each ends in a short scene using the existing dialogue system (`src/dialogue.ts`): camera, lines, gift.
- Write the lines in Cloudback's voice: warm, short, a little funny. Keep them in `src/rules/content.ts`.
- **Done when:** the sim can complete all five quests, and every line has Vietnamese.

### T22: day cycle and sky requests
- A day cycle of 20 real minutes: dawn, day, dusk, night. Light and sky colours shift (in `src/world/sky.ts`); night is very dark blue, with lanterns glowing.
- 3 crew requests a day, from a table such as "Bring Mina 4 berries" or "Catch a Star Ray", each with a small reward.
- Nothing is lost by skipping a day, and there are no streaks.
- **Done when:** the rules have tests, and the time of day is saved.

### T23: collections and achievements
- Port `goals.ts` and `goals-ui.ts`. Collections:
  - fish;
  - freed creatures (with where they went home);
  - seeds;
  - decorations;
  - islets;
  - keepsakes.
- A completed page gives a decoration. Achievements are milestones from bus events.
- There is a goals chip on the HUD: places x/8 and the collection percentage.
- **Done when:** the rules have tests, and the Collect tab shows them.

### T24: difficulty
- Port `difficulty.ts`: Gentle, Normal and Brave.
  - Brave: more Gloom health and more raid pressure.
  - Gentle: a wider safe zone on the reel and slower Gloom.
- It is changeable in Settings at any time.
- **Done when:** the sim runs all three and none get stuck.

---

## Phase 3: life on Bao

### T30: sky pets
- Port `pet-slots.ts` (two slots), `pet-guard.ts`, `pet-surge.ts` (Bond Surge on the third ring) and `pet-card.ts`.
- Three pets:
  - the cloud pup, hatched from an egg in Nana's chest;
  - the glowfish, a rare catch from the skiff;
  - the puffbun, which asks to join after Clover is freed. It is **not** a freed Gloom form; those go home.
- Idle on the deck: sleep in the sun, chase specks, greet you after a voyage.
- Art: borrowed (T00).
- **Done when:** the rules have tests, and Bao stays within budget with 2 pets.

### T31: deck animals
- Port `farm.ts` and `farm-roam.ts`, plus the instancing approach of `farm-view.ts`:
  - **sky hens:** give eggs (a new cooking item);
  - **puffsheep:** give wool, which is turned into Fibre;
  - **bee box:** gives honey, and raises Sky Spark drops by 10%.
- A pen on the side decks (needs deck tier 1).
- **Done when:** 6 animals roam within the deck oval and avoid plots and fittings, and Bao stays within budget.

### T32: decorations
- Port `placement-ghost.ts` and `decor-move.ts`: place, move and turn decorations, snapped to the 0.44 m plank grid, inside the deck oval and away from paths.
- 20 decorations, each with a use:
  - lanterns light the night;
  - benches seat the crew;
  - the wind chime slows Gloom in raids.
- Half are earned from collections and quests; the rest are sold by the market.
- There is a cap per deck tier.
- **Done when:** the layout is saved, and Bao stays within budget with the cap reached.

### T33: Juno's bot and storage
- Port `helper.ts`, reduced: during voyages, Juno's bot waters the plots and gathers fallen fruit at half yield. It **never plants**.
- Port `storage-slots.ts`: bag and chest slots, with expansions bought with glimmer and Fibre.
- **Done when:** the rules have tests.

---

## Phase 4: song combat

### T40: moves
- Port `five-rules.ts`, `moves.ts` and `power-rules.ts` into a three-button scheme:
  - **Ring:** a 3-hit chain. **Holding** Ring charges the Great Bell.
  - **Hop:** a jump and dodge, with 0.1 s coyote time and a 67 ms buffer.
  - **Bell:** a move set by the equipped bell. The chime staff lobs, the gong hammer quakes, the wind-bell bow shoots.
- Desktop keys: J, K, L, and 1–3 to swap bells.
- **Done when:**
  - the rules have tests;
  - response is under 100 ms (measured with `clone-reference-app/scripts/filmstrip.mjs` from `~/.claude/skills`, if present);
  - there are at most 3 action buttons on phones.

### T41: on-beat bonus
- Expose the beat clock from `src/core/audio.ts`.
- Rings within ±90 ms of a beat free Gloom 25% faster and ring brighter. A soft pulse on the Ring button shows the beat.
- It is optional, and turned off by "reduce motion" for the visuals only.
- **Done when:** the rules have tests with a fake clock.

### T42: bells and the anvil
- Port `weapon-forge.ts`, reduced to 3 tiers per bell, upgraded at Tam's anvil. Each tier has a visible change: brighter, then a ribbon, then a glow.
- Port `weapon-trail.ts` for the ring trail.
- **Done when:** the economy test covers the costs.

### T43: elite Gloom and bosses
- Port `elite-roles.ts` as Warden (shield), Mender (heals) and Caller (summons).
- Port `boss-stagger.ts` and `boss-wear.ts`: bosses stagger and visibly crack.
- Feedback for every hit:
  - hit-stop of 40–120 ms;
  - a flash (port `flash-materials.ts`, with no material copies);
  - a directional kick;
  - a combo counter and a target ring.
- Telegraphs last at least 0.25 s.
- **Done when:** the sim is re-balanced, and boss fights take 60–120 s.

---

## Phase 5: the open sky

### T50: steering Bao
- Use the approach of `space.ts` and `ship-sequence.ts`: steer Bao on the Sky Map within the opened sky.
  - Gates are weather walls, each with a shown reason.
  - Departure and arrival scenes.
- The one-tap story voyage stays.
- **Done when:** the sim uses one-tap voyages, and a browser test steers to Clover.

### T51: sky islets
- 8 hand-placed islets plus 3 drifting ones a day, reached by the scooter's tether.
- Each islet has one landmark, trees (borrowed from Zoo Garden's `tree_round`, `tree_blossom` and `cloudtree`, tinted), and bees and bugs.
- **Lock-on aim** with the wind-bell bow: the nearest bug in front is targeted; tap to shoot, drag to switch.
- Rewards: each islet's own seed (a new tree in `TREES`), sparks and decorations.
- **Done when:**
  - an islet is in view at least every 60 s of free flight;
  - the islets show in the Collect tab;
  - the budget holds.

### T52: denser lands
- Use the approach of `biomes.ts`, `scatter.ts` and `cover-cards.ts`: seeded, instanced scatter on the four lands.
- Port `breakables.ts` for ice on Frostfall.
- **Done when:** lands stay ≤ 200 draw calls.

### T53: the Cloud Koi Queen
- Port `lake-guardian.ts` as a rare reel fight from the skiff, with its own reel patterns.
- **Done when:** the rules have tests.

---

## Phase 6: after the story

### T60: Deck Defence nights
- Port the `rescue-*.ts` modules, merged with the existing raids: lanes on the deck, crew at guard posts, decorations as defences.
- It happens on some nights after chapter 3.
- **Done when:** the rules have tests, and the night raid plays in a browser test.

### T61: the Deep Mist Vault
- Port the `dungeon-*.ts` modules: five crystal rooms under the Grey Star, seeded daily, available after the ending. The best time is recorded.

### T62: the Storm Leviathan
- Port the `colossus-*.ts` modules: a sleeping giant sky beast in the Storm Belt, woken once a day.

### T63: Bao's Logbook
- Port the `insight-*.ts` modules: Bao's growth, harvests, catches, personal bests and letters from Bao's pod.
- This shows the Logbook dock button.

---

## Phase 7: feel and speed (do T70 early; T71–T72 at the end of each phase)

### T70: camera and look
- Port `camera-rig.ts` (rate-based damping), `occluders.ts` (fade what is between the camera and the hero), `outline.ts` and `safe-compile.ts` (shader warm-up before play).
- **Done when:** there are no shader compile hitches on the first raid, measured with the frame time in a browser test.

### T71: polish pass (per phase)
- Every new action has a sound with 3–5 variants and ±5% pitch, and a contact flash.
- Every panel has open and close motion.
- Every new system is introduced by a character line.
- Screenshots go in `shots/` for the owner.

### T72: phase report (per phase)
- Write `docs/reports/phase-<n>.md` with:
  - what was built;
  - test results;
  - budget numbers before and after;
  - screenshots;
  - borrowed assets added;
  - anything not done.
