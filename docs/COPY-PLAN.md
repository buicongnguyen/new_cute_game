# Cloudback: what to copy from Zoo Garden, and in what order

Written 2026-10-16 at the owner's request: "the game is too simple; copy the well-developed parts of cute_game, in the menus, the mini map and the rest". Zoo Garden (`cute_game`) is the owner's own game and code, so its modules may be ported. Each port keeps a one-line note naming the file it came from, as `house-plan.ts` already does.

This is a plan only: nothing in it is built yet.

## 1. The two stories compared

| | Cloudback (now) | Zoo Garden |
|---|---|---|
| **Kind of story** | A told story: five chapters with a cast of 12, a villain (the Gloom), places with their own mood, and an ending (the pod wakes). | A goal ladder: about 30 story steps in four chapters ("Harvest three crops", "Defeat a boss", "Discover five planets"…), each with a gift at the end of a chapter. Around it sit the cottage family, friends to rescue, planets and bosses. |
| **What it does well** | Reasons for everything. Bao chose you; the Gloom crusts what keeps still; song breaks crystal. Every land has a friend, a twist and a boss trick. | **Always something to do next.** Steps cover every system (fishing, cooking, crafting, decorating, bosses), so the story teaches the whole game. Daily and weekly tasks, achievements and collections keep it going for weeks. |
| **Weak points** | **Linear and short.** One goal at a time, about 50–90 minutes, then only free play. Few systems, so little to do between story beats. No reasons to come back tomorrow. | The story itself is thin: steps are chores, and the characters say little. |
| **Length** | 50–90 min | Many hours: level 18+ steps, nine planets, ten bosses |

**The verdict:** keep Cloudback's story as the spine, and copy Zoo Garden's **goal ladder, side goals and long-term loops** around it. Every chapter beat then sits inside a web of smaller goals, and the game gains Zoo Garden's depth without losing its heart.

## 2. Side by side, by area

✓ = Cloudback has it, ½ = a smaller version, ✗ = missing.

| Area | Cloudback | Zoo Garden (files) | Copy? |
|---|---|---|---|
| **Menus** | 4 emoji buttons (map, bag, journal, settings) and bottom-sheet panels ½ | A **dock** (a column of menu buttons on the right edge) with a hand-drawn SVG icon set (`hud-icons.ts`, `hud-layout.ts`); panels docked to the side on desktop (`dialog-dock.ts`); grouped item lists (`item-groups.ts`); scroll cues for tabs (`tab-cues.ts`); a compact phone HUD (`hud-compact.css`) | **Yes, first** |
| **Mini map** | ✗ (only the sky-map panel) | Always-on round minimap (`minimap.ts`): the land drawn once, with live markers for bosses, nearby creatures, ready beds and other players, plus a facing arrow and a place caption; arrival flags (`place-flags.ts`) | **Yes, first** |
| **Journal** | 1 page: chapters, crew, records ½ | Tabbed journal: **Explore** (story, bounties, challenges), **Grow** (daily, weekly, pass), **Collect** (achievements, collection), with red "to claim" badges (`journal-badges.ts`) | **Yes** |
| **Goals** | One goal card ½ | Goal card **plus** a goals chip (worlds x/9, collection %, next unlock) (`goals.ts`, `goals-ui.ts`); a guided walk when you tap a quest (`quest-walk.ts`); first-30-minutes guidance with a pointer (`guide.ts`, `guide-ui.ts`) | **Yes** |
| **Daily reasons to return** | ✗ | Welcome-back card with check-in rewards (`welcome-back.ts`); news inbox (`news-inbox.ts`); daily world boss | Yes |
| **Fighting** | Ring, Spin, Hop; auto-ring ½ | Five-button fight (`five-rules.ts`: Attack, Jump, three specials Lob/Rush/Quake in `moves.ts`); power strike (`power-rules.ts`); skill upgrades (`skill-upgrades.ts`, `upgrade-bench.ts`); combo counter; target marker; hit reactions and creature weight; boss stagger and boss wear (`boss-stagger.ts`, `boss-wear.ts`); elite roles (`elite-roles.ts`) | Yes |
| **Gear** | Mallet I–III, Coat I–III ½ | Many weapons with a second slot (`weapon-pair.ts`); forging +1…+10 (`weapon-forge.ts`); weapons that grow with use (`weapon-growth.ts`); trails; gear ceilings | Yes |
| **Pets** | ✗ | Two pet slots, pet guard moves, Bond Surge (`pet-slots.ts`, `pet-guard.ts`, `pet-surge.ts`, `pet-card.ts`) | **Yes** |
| **Friends** | Static jobs and chatter ½ | Friends who follow you, idle, rest, talk in bubbles (`friend-crew.ts`, `friend-idle.ts`, `friend-chat.ts`), grow up (`growth.ts`) and can be dressed (`friend-looks.ts`) | Yes |
| **Helpers** | Pip picks fruit ½ | Bolt the garden robot: auto-plant, harvest, delivery (`helper.ts`, `auto-plant.ts`, `delivery.ts`) | Yes |
| **Farm animals** | ✗ | Animal pen, produce, roaming animals, restock robot (`farm.ts`, `farm-roam.ts`, `farm-restock.ts`, `farm-view.ts`) | **Yes** (animals on Bao's back) |
| **Home** | Fixed rooms and repairs ½ | Decorations you place, move and turn, with a see-through preview (`placement-ghost.ts`, `decor-move.ts`, `decorations-art.ts`); house activities in every room (`house-activities.ts`); mirror character builder and dyes (`look-shop.ts`, `dye-*.ts`); bag and chest slots with expansions (`storage-slots.ts`) | **Yes** |
| **Crops** | 9 trees ½ | Many crops plus 8 slow fruit trees (8 h+) (`tree-crops.ts`); crop cards; garden-bed kits | Yes |
| **Fishing** | Reel game ✓ (ported) | Plus harpoon fish hunting (`fish-hunting.ts`), a rare **Lake Guardian** (`lake-guardian.ts`), and mystery shadows | Partly |
| **Travel** | Automatic voyages on a list map ½ | **Piloted flight** over a star map with launch and landing scenes (`space.ts`, `ship-sequence.ts`) | **Yes** (steer Bao) |
| **Worlds** | 4 lands + 3 ships ½ | Nine worlds with biomes and dense instanced scenery (`biomes.ts`, `scatter.ts`, `cover-cards.ts`); breakable scenery (`breakables.ts`); swimming and jumping (`swim-rules.ts`, `jump-rules.ts`) | Partly |
| **Modes** | Raids and boardings ½ | **Rescue Call**: tower-defence-style "hold the line" missions (`rescue-*.ts`); **Delvers' Vault**: a five-room daily dungeon (`dungeon-*.ts`); **Colossus**: a giant sleeping boss (`colossus-*.ts`); Titans; Flag Rush | Yes, adapted |
| **Long-term** | ✗ | Achievements and collections, the **Village Almanac** with scores and charts (`insight-*.ts`), a leaderboard (`ranking.ts`), difficulty settings (`difficulty.ts`), three save profiles (`profiles.ts`), a save guard (`save-guard.ts`) | Yes |
| **Feel and tech** | ½ | Camera rig (`camera-rig.ts`), fading tall scenery between camera and hero (`occluders.ts`), ink outlines (`outline.ts`), hit flash without material copies (`flash-materials.ts`), background shader warm-up (`safe-compile.ts`), the Interact-key pick rule (`interact-pick.ts`) | Yes, as needed |

## 3. How each port is adapted to Cloudback

Each item is copied in idea and code, then re-themed. It never copies Zoo Pet's content.

| Zoo Garden | In Cloudback becomes |
|---|---|
| Starship flight | **Steering Bao** across the sky map: fly freely between lands; Gloom weather fronts and sky islets on the way. |
| Planets x/9 goal | **Places x/8** (4 lands, 3 ships, the start) and sky islets found. |
| Pets | **Sky pets**: a cloud puppy, a baby glowfish, a puffbun freed from the Gloom. They follow you on the deck and the lands, guard you and Bond-Surge on the third ring. |
| Farm animals | Animals living on Bao's deck: sky hens (eggs), puffsheep (wool to Fibre), a honey-bee hive (honey). |
| Decorations | Place lanterns, benches, flower pots, a swing and statues anywhere on the deck (and the extensions). The fixed keepsakes become placeable decorations. |
| Bolt the robot | **Juno's little helper bot** (after Frostfall): plants and harvests while you are away on a land. |
| Five-button fight | **Ring, Hop, plus three bell moves:** a thrown chime (Lob), a dash ring (Rush) and a ground gong (Quake). The power strike becomes the **Great Bell** (a full charge, then hold Ring). |
| Weapons and forge | A family of **bell weapons** (mallet, chime staff, gong hammer, wind-bell bow), forged +1…+10 at Tam's anvil, growing brighter with use. |
| Elite roles | Elite Gloom forms: a shielded **Warden**, a **Mender** that heals others, a **Caller** that summons Gloomlings. |
| Rescue Call | **Deck Defence**: scheduled Gloom attacks on Bao in lanes, with crew posted at guard spots and gongs and posts as towers. |
| Delvers' Vault | **The Deep Mist Vault**: five crystal rooms under the Grey Star, once per day after the ending. |
| Colossus | **The Storm Leviathan**: a giant Gloom sky-beast that sleeps in the Storm Belt, a daily world boss. |
| Lake Guardian | **The Cloud Koi Queen**: a rare glowing koi under the skiff's sea. |
| Village Almanac | **Bao's Logbook**: how your ship and garden have grown, with scores and a product map. |
| Leaderboard | A local best-records board (fastest Hive, biggest catch), with no server. |

## 4. The new story structure (the spine stays, the web grows)

1. **Story chapters** (as now): the five chapters and their scenes.
2. **Goal ladder per chapter** (from Zoo Garden's `STORY_STEPS`): 6–9 small steps under each chapter, with a gift at the end. For example, chapter 2:
   1. Harvest 3 crops.
   2. Ship 20 glimmer in the crate.
   3. Build the side decks.
   4. Cook 2 meals.
   5. Catch 3 fish.
   6. Reach Gardening level 3.
   7. Place a decoration.
   8. Adopt a sky pet.

   **Gift:** seeds, Sky Sparks and a decoration.
3. **Bounties and challenges:** "Free 10 Gloomlings on Clover", "Land a Star Ray without the line straining".
4. **Daily and weekly tasks:** three small tasks a day and a weekly chain, with a check-in card and rewards.
5. **Collections:** a fish log, a Gloom-creature log (freed animals), seeds, decorations, and sky islets found.
6. **Achievements:** milestones across every system.
7. **After the ending:** the daily Deep Mist Vault, the Storm Leviathan, Deck Defence nights, and new sky islets.

Story text gets more side stories too. Each rescued friend gets a three-step personal quest:
- Pip's lost seed pouch;
- Mina's family recipe;
- Ria's lighthouse lamp;
- Tam's first anvil;
- Juno's runaway bot.

## 5. The plan, phase by phase

Each phase ships on its own: tests, both browser suites, the phone check (11 px text, 44 px taps), the speed budget and the deploy.

### Phase 1: the menu shell, minimap and journal (biggest win for "too simple")
- **Dock:** the right-edge menu column with Zoo Garden's SVG icon set (`hud-icons.ts`, `hud-layout.ts`). Buttons: Bag, Journal, Map, Crew, Logbook, News, Settings, Help. It folds on small phones.
- **Panels:** docked to the side on desktop (`dialog-dock.ts`), grouped lists (`item-groups.ts`) and tab scroll cues (`tab-cues.ts`).
- **Minimap:** round, always on (`minimap.ts`).
  - On Bao: the deck oval with planters, fittings, crew and specks.
  - On lands: the land drawn once, with Gloom groups, Spires, cages, the boss crown, the rope, the market and ore.
  - On ships: the oval deck with its rail gaps and the captain.

  A caption shows the place name; tapping the minimap opens the sky map.
- **Journal tabs:** Explore (story, bounties), Grow (daily, weekly), Collect (achievements, collections), with "to claim" badges (`journal-badges.ts`).
- **Goals chip and guided walk:** places x/8, collection %, next unlock (`goals.ts`). Tapping the goal card walks you to it (`quest-walk.ts`).
- **First-run guidance:** a pulsing pointer to the next thing (`guide.ts`, `guide-ui.ts`).
- **Effort:** about 2–3 days.

### Phase 2: long-term loops
- The goal ladder under each chapter, with chapter gifts (`STORY_STEPS` pattern, `story-gifts.ts`, `story-catchup.ts`).
- Daily and weekly tasks, and the welcome-back check-in card (`welcome-back.ts`); the news inbox (`news-inbox.ts`).
- Achievements and collections: the fish log, the freed-creature log, seeds and decorations.
- The difficulty setting and three save profiles (`difficulty.ts`, `profiles.ts`); the save guard.
- **Effort:** about 2 days.

### Phase 3: life on Bao (pets, animals, decorations)
- Two sky-pet slots with guard moves and Bond Surge (`pet-slots.ts`, `pet-guard.ts`, `pet-surge.ts`). Pets come from freed Gloom forms and markets.
- A deck animal pen: sky hens, puffsheep and a bee hive, roaming the deck (`farm.ts`, `farm-roam.ts`).
- Decorations: place, move and turn them on the deck, with a preview ghost (`placement-ghost.ts`, `decor-move.ts`). The keepsakes become decorations; there is a decoration shop.
- Bigger bag and chest with slot expansions (`storage-slots.ts`).
- Juno's helper bot: auto-plant and harvest while you are away (`helper.ts`, `auto-plant.ts`, `delivery.ts`).
- **Effort:** about 3 days, with art (pets, animals, decorations) from the Blender kit.

### Phase 4: a richer fight
- Five-button fight: Ring, Hop and three bell moves, plus the Great Bell power strike (`five-rules.ts`, `moves.ts`, `power-rules.ts`).
- Skill upgrades at Tam's bench (`skill-upgrades.ts`, `upgrade-bench.ts`).
- Bell weapons with forging, growth and trails (`weapon-forge.ts`, `weapon-growth.ts`, `weapon-trail.ts`).
- Elite Gloom roles (`elite-roles.ts`); boss stagger and wear (`boss-stagger.ts`, `boss-wear.ts`); a combo counter, a target ring, hit reactions and drops.
- **Effort:** about 3–4 days. The story simulation is re-balanced afterwards.

### Phase 5: the open sky
- **Steering Bao on the sky map** (`space.ts`, `ship-sequence.ts`): Bao flies where you steer, with gates as walls of weather. Departure and arrival scenes.
- **Sky islets** reached by the Sky Scooter (the owner's idea):
  - small green floating islands with Zoo Garden's trees (`tree_round`, `tree_blossom`, `cloudtree`);
  - bees and sky bugs to shoot with a wind-bell bow from the scooter;
  - rewards: new seeds, Sky Sparks and decorations.
- Dense scenery from Zoo Garden's biome kits on the lands (`biomes.ts`, `scatter.ts`, `cover-cards.ts`), and breakable scenery on Frostfall (`breakables.ts`).
- Harpoon fish hunting from the skiff and the Cloud Koi Queen (`fish-hunting.ts`, `lake-guardian.ts`).
- **Effort:** about 4 days.

### Phase 6: modes for after the story
- **Deck Defence** (Rescue Call: `rescue-*.ts`): lanes, guard posts and waves on Bao at night.
- **The Deep Mist Vault** (Delvers' Vault: `dungeon-*.ts`): five rooms, once a day.
- **The Storm Leviathan** (Colossus: `colossus-*.ts`): a daily giant boss.
- **Bao's Logbook** (Almanac: `insight-*.ts`) and a local records board (`ranking-logic.ts`).
- **Effort:** about 4–5 days.

### Phase 7: feel and speed (alongside every phase)
- Camera rig, fading tall scenery between camera and hero, ink outlines, flash materials and background shader warm-up (`camera-rig.ts`, `occluders.ts`, `outline.ts`, `flash-materials.ts`, `safe-compile.ts`).
- The Interact pick rule, which also fixes the "planter box steals the hatch" case (`interact-pick.ts`).

## 6. Rules for every port

1. **Attribution:** port the owner's code with a header note naming the Zoo Garden file; re-theme its names and content. Zoo Pet content is never copied.
2. **Rules stay pure:** new rules go in `src/rules/` with Node tests. The whole-story simulation (`tests/sim.ts`) learns each new loop, so pacing stays checked.
3. **Translations:** every new string goes through `t()` with Vietnamese in `src/vi.ts` (the i18n test gates it).
4. **Speed:** no draw-call or triangle growth on Bao's deck beyond the budgets (design §16); new art is instanced or merged; the packed download stays under 3 MB, with late art loaded on demand.
5. **Phones:** text at least 11 px, taps at least 44 px, safe areas respected; the dock folds on small screens.
6. **Saves:** the save version goes up per phase, with a migration; old saves keep everything.

## 7. Suggested order

1. **Phase 1** (menus, minimap, journal): the quickest visible jump in quality.
2. **Phase 2** (goal ladder and daily loops): gives everything else a reason.
3. **Phase 3** (pets, animals, decorations) and **Phase 5's sky islets**, which build on the scooter and the owner's ideas.
4. **Phase 4** (fight), then **Phase 6** (modes); **Phase 7** throughout.

Total: roughly 3 weeks of work in seven shippable steps. The owner picks the order; each phase can start on its own.
