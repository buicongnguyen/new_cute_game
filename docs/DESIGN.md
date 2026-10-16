# Cloudback: game design (rules and numbers)

This is the rule book for the code. `src/rules/content.ts` holds the same numbers as data, and the tests in `tests/` check the promises made here: every gate can be reached, every item has a use, and no run gets stuck. If a number changes, change it here and in `content.ts`. Check 3 retuned many numbers, and `tests/progression.test.ts` checks them; `docs/REVIEW-LOG.md` explains why each changed.

## 1. One-page brief

- **Fantasy:** you live on the back of a young sky whale, grow its food, and fly it from isle to isle to free them from the Gloom.
- **Core verbs:** plant, feed, sail, ring (fight and free).
- **Core loop:** grow trees → feed Bao → sail → land and free the isle → rescue and trade → new crew and new seeds → Bao grows → farther isles.
- **Loop contract:** the player **plants and feeds** to **grow Bao and reach farther isles**, while **Gloom raids and tough Hives** push back. That earns **Notes, crew and glimmer**, which change **what to plant, what to make and where to sail next**.
- **The main trade-off:**
  - glimmer buys either better seeds (Bao grows faster) or better gear (fights get easier);
  - each patch holds either whale food, people food or craft trees.
- **Loop lengths:**
  - a moment lasts 5–30 s (a harvest, a fight, a cast);
  - an isle takes 8–15 min;
  - the story takes about 35–60 min for a real player. The scripted players in `tests/progression.test.ts` take about 25 min (attentive) and 49 min (casual, the worst case).
- **Fail and retry:** a fainted Keeper is pulled back up by Bao at full health. Nothing is lost. The Hive heals, but every faint in a Hive fight cracks its crust: it comes back 10% weaker, up to 30%. Groups that were not cleared come back.
- **Platforms:** phones first (upright and sideways), and desktop.
- **Camera:** a perspective follow camera, FOV 40, pitch 47°. It sits 19 m from the Keeper on Bao and 22 m on isles, and 1.28 times farther back on upright phones.
- **Speed:** the Keeper walks at 5.2 m/s.

## 2. Places and gates

Sky-map positions are in leagues (`content.ts PLACES`). A voyage costs **2 fullness per league**.

| Place | Map position | To get there you need | Leg from the previous place in the story |
|---|---|---|---|
| Dawnreach (open sky, start) | (0, 0) | — | — |
| Clover Rise | (13, −9) | Calf | 15.8 leagues: 32 fullness, 38 s |
| Lantern Reef | (−14, −28) | Young (passes the Wind Wall) | 33 leagues: 66 fullness, 54 s |
| Ember Peaks | (16, −46) | Adult (passes the Storm Belt) | 35 leagues: 70 fullness, 55 s |
| The Grey Star | (0, −66) | Great and all 3 Notes (the Deep Song) | 25.6 leagues: 51 fullness, 47 s |

- **Where Bao is:** Bao is always *at* one place, and can sail to any place it is allowed to reach. Dawnreach is only the start.
- **Voyage time:** `24 s + 0.9 s × leagues`, at most 75 s.
- **Hungry flights:** if fullness is below the cost, the voyage still happens. It takes twice as long, fullness drops to 0 and mood falls by 10. **Bao is never stranded.**
- **Why fullness matters:** the long legs (66 and 70) mean you feed Bao before you set off and keep some whale food rather than selling it all.

## 3. Bao the whale

| Stat | Range | Start | Notes |
|---|---|---|---|
| Fullness | 0–100 | 70 | Voyages spend it; whale food fills it. |
| Mood | 0–100 | 70 | Changes how fast trees grow; shown by Bao's eyes and hum. |
| Growth XP | 0 and up | 0 | Whale food and fish treats raise it. |
| Stage | Calf, Young, Adult, Great | Calf | Needs growth XP **and** the right Note. |

| Stage | Growth XP needed | Note needed | Moss patches | Back scale | Unlocks |
|---|---|---|---|---|---|
| Calf | 0 | — | 4 | 1.00 | Clover Rise |
| Young | 120 | Note of Dawn | 6 | 1.18 | the Wind Wall (Lantern Reef) |
| Adult | 380 | Note of Tide | 8 | 1.34 | the Storm Belt (Ember Peaks) |
| Great | 760 | Note of Ember | 10 | 1.50 | the Deep Song dive (the Grey Star, with all 3 Notes) |

- **Growing up:** when both needs are met, Bao's card shows **Grow!** and a short ceremony plays. Growth XP keeps counting.
- **Bao always eats:** fullness stops at 100, but growth XP still counts.
- **Mood:** it comes from care, not from food.

| Mood | Tree growth speed |
|---|---|
| 80 and up, Joyful | ×1.25 |
| 50–79, Content | ×1.00 |
| 25–49, Grumpy | ×0.85 |
| below 25, Sad | ×0.70 |

| Mood changes | |
|---|---|
| Fish treat | +6 (Cloud Koi +20) |
| A pat | +5, once every 60 s |
| Brushing a speck | +4 |
| A freed isle (the song) | +20 |
| Each 60 s of play | 1 point toward 50 |
| Each speck on Bao, every 60 s | −1 |
| A hungry voyage | −10 |
| A lost raid | −12 |

Mood never changes while the game is closed.

- **Gloom specks:**
  - **Where Bao is:** at a crusted isle a speck lands every 40 s, up to 5. Elsewhere one lands every 180 s, up to 2.
  - **While the Keeper is away** (down on an isle), Nana brushes all but 2.
  - **Brushing** one gives +4 mood and +2 glimmer.

## 4. Trees (the garden)

Trees are perennial: plant a seed once and the tree fruits again and again. Uprooting gives the seed back. Times are seconds at mood ×1.00 with no Gardener.

| Tree | Kind | First fruit | Regrow | Yield | Seed source | Seed price |
|---|---|---|---|---|---|---|
| Puffberry | Whale food | 40 | 35 | 3 | Start ×2, every market | 5 |
| Ropevine | Craft (Fibre) | 50 | 45 | 2 | Start ×2, every market | 6 |
| Cloudpear | People food | 80 | 60 | 2 | Clover Market | 10 |
| Chimewood | Craft | 100 | 80 | 2 | Clover Market | 14 |
| Glowplum | Whale food | 120 | 90 | 2 | Clover Market | 28 |
| Honeybun | People food | 130 | 100 | 2 | Reef Market | 18 |
| Starfig | Whale food | 200 | 150 | 2 | Reef Market | 55 |
| Golden tree | Decoration | 600 | — | — | Drifts down from the moss on Grand Hana's back (the ending) | — |

- **The better trees are better per patch.** Growth XP per tree per minute is 15 (Puffberry), 20 (Glowplum) and 36 (Starfig).
- **Pip the Gardener:**
  - growth ×1.2;
  - Pip harvests every ripe tree into the pantry every 8 s, **but only while the Keeper is on Bao**.
- **While the Keeper is away** (down on an isle, or the game is closed), each tree ripens once and waits. Ripe fruit never piles up and never rots.
- The garden grows on the real clock.
- **Raids:** a tree crusted in a raid loses its ripe fruit and stops growing until it is rung 3 times.

## 5. Items, sources and uses

The pantry and the bag are the same inventory. `tests/economy.test.ts` checks that every item has a source and a use, and that no market sells anything for less than any market buys it.

| Item | Sources | Uses | Sell price |
|---|---|---|---|
| Puffberry (whale food) | Tree, wild bushes on Clover | Feed Bao: +12 full, +3 growth | 1 |
| Glowplum (whale food) | Tree | Feed Bao: +22 full, +15 growth | 10 |
| Starfig (whale food) | Tree, Ember Market (45) | Feed Bao: +35 full, +45 growth | 24 |
| Cloudpear (people food) | Tree, wild trees on the reef, Nana's lunch (3 at the start) | Eat +25 HP; cooking; Bao's flower crown | 4 |
| Honeybun (people food) | Tree | Eat +45 HP; cooking | 8 |
| Fibre (craft) | Ropevine | Rope, Coat, Good Line, lantern string | 3 |
| Chimewood (craft) | Tree | Mallet, Chime Post, golden bell | 6 |
| Ore (craft) | Ore rocks (2 each; reef ×2, Ember ×4; back after 10 min), Ember Market (16) | Mallet III, Coat III, golden bell | 6 |
| Puff Minnow, Sun Carp, Star Ray, Cloud Koi | Cloud fishing | Treat for Bao (+5 full, +4 growth, +6 mood; Koi +15 growth, +20 mood); cooking | 2 / 5 / 10 / 25 |
| Pear Tart, Fish Bun, Sky Stew (meals) | Mina's Kitchen | Eat (§6) | — |
| Seeds | Markets, the start, Nana's safety net, Grand Hana | Plant | — |
| Glimmer (money) | Freeing Gloom forms, Spires, Hives, rescues, specks, selling, raids, sky dew | Seeds, gear, posts, keepsakes, ore | — |
| Notes (3) | Hives | Bao's growth, the Deep Song | — |

- **Markets** buy at the sell price, ×1.5 (rounded) for what they like:
  - Clover (Mayor Olla) likes fish;
  - the reef (Old Kai) likes people food;
  - Ember (Granny Coal) likes whale food.
- **Each market sells:**
  - Clover: Puffberry, Ropevine, Cloudpear, Chimewood and Glowplum seeds;
  - Reef: Puffberry, Ropevine, Honeybun and Starfig seeds;
  - Ember: Puffberry and Ropevine seeds, Ore and Starfig fruit.

## 6. Workbench and Kitchen

**Workbench.** Nana makes the basic recipes. Tam sets up an anvil there once he is aboard and makes the Smith recipes.

| Recipe | Cost | Effect |
|---|---|---|
| Climbing Rope | 3 Fibre | Go down to isles (made once) |
| Mallet II | 4 Chimewood, 30 glimmer | Damage ×1.4 |
| Mallet III (Tam) | 6 Chimewood, 6 Ore, 150 glimmer | Damage ×2.2 |
| Coat II (after the rope) | 6 Fibre, 30 glimmer | +40 max HP |
| Coat III (Tam) | 10 Fibre, 6 Ore, 150 glimmer | +120 max HP |
| Good Line (after the rope) | 4 Fibre, 20 glimmer | Bite window +0.35 s, rare fish ×1.5 |
| Chime Post | 3 Chimewood, 15 glimmer | A raid tower on one of 4 post spots. Each ring (every 1.2 s, 3.5 m) deals half the Keeper's ring damage and slows Gloom forms by 40% for 1 s. ×1.5 with Tam. |
| Lantern string (keepsake) | 4 Fibre, 80 glimmer | Paper lanterns around Bao's back |
| Flower crown for Bao (keepsake) | 2 Cloudpear, 150 glimmer | Bao wears flowers |
| Golden bell (keepsake, Tam) | 4 Ore, 4 Chimewood, 300 glimmer | The mallet shines gold |

**Kitchen** (Mina). A meal heals; a buff lasts 150 s.

| Meal | Ingredients | Heal | Buff |
|---|---|---|---|
| Pear Tart | 2 Cloudpear | 90 | — |
| Fish Bun | 1 Honeybun, 1 fish | 70 | +20% damage |
| Sky Stew | 1 Cloudpear, 2 fish (cheapest first) | 50 | −25% damage taken |

**Quick Eat** picks the smallest food that covers the missing health, or the biggest food if none does.

## 7. The Keeper

- **Level** comes from XP, up to level 15. Cumulative XP for levels 2–15: 40, 100, 190, 300, 440, 600, 800, 1040, 1320, 1650, 2080, 2600, 3200, 3900.
- **Max HP** = 100 + 15 × (level − 1) + Coat.
- **Damage per ring** = (10 + 2 × (level − 1)) × Mallet × buffs.
- **Ring:** every 0.55 s, in a 2.0 m arc in front. It fires by itself when a Gloom form is within 2.2 m. Space and the Ring button also ring.
- **Chime Spin:** 2.8 m all around, ×1.6 damage, 6 s cooldown.
- **Hop:** a 4.5 m dash, invulnerable for 0.3 s, 3.5 s cooldown.
- **After a hit:** invulnerable for 0.8 s.
- **Healing:** 2 HP per second on Bao's back, but not during a raid and never on isles.

## 8. Gloom forms and Hives

Base numbers; the isle's tier multiplies them.

| Form (freed animal) | HP | Damage | Speed | Attack | XP | Glimmer |
|---|---|---|---|---|---|---|
| Gloomling (puffbun) | 30 | 6 | 2.4 | Bump at 1.1 m (0.3 s wind-up, 1.3 s cooldown) | 8 | 2 |
| Spitter (hopfrog) | 26 | 8 | 1.6 | Shard: 0.6 s wind-up line, 9 m/s, range 8 m | 10 | 3 |
| Rammer (rockgoat) | 90 | 14 | 1.8 (charges at 9) | Charge line: 0.8 s wind-up, 7 m | 24 | 6 |
| Flyer (skylark) | 40 | 10 | 3.2 | Dive circle: 0.7 s wind-up, radius 1.6 m | 14 | 4 |
| Spire | 120 | — | — | Wakes a Gloomling every 7 s while you are within 13 m, at most 3. **Woken Gloomlings give nothing**: they were only napping. | 30 | 10 |

| Tier | HP | Damage | Rewards | Recommended level |
|---|---|---|---|---|
| Clover | ×1.0 | ×0.8 | ×1.0 | 1 |
| Reef | ×1.9 | ×1.5 | ×1.6 | 5 |
| Ember | ×3.0 | ×1.8 | ×2.4 | 9 |
| Star | ×4.4 | ×2.4 | ×3.2 | 13 |

**Hives.** A Hive's HP is final (not multiplied by tier), but its move damage is multiplied by the tier's damage factor.
- **Shield:** a Hive is shielded while any Spire stands. Blows glance off it with a bell sound.
- **Moves:** every 3.4 s it winds up a move, telegraphed for at least 0.6 s.
- **Faints:** each faint during its fight cracks it 10%, up to 30%.

| Hive | HP | Moves (base damage) | XP / glimmer |
|---|---|---|---|
| Thornhive (Clover) | 480 | Thorn ring (14; stand inside 2.4 m or outside 7.5 m), spike lines ×3 (12), wakes 2 Gloomlings | 150 / 80 |
| Clamhive (Reef) | 1500 | Pearl volley (5 shards, 10), tide ring (16; inside 3.4 m or outside 9 m). Blows barely scratch it while closed (15%); right after each move it gapes open for 4 s, so hit it then. | 300 / 160 |
| Forgehive (Ember) | 3000 | Ground slam on your spot (20, radius 3.4), violet crystal cracks ×2 (18), calls 2 Flyers | 520 / 280 |
| Grey Heart (Star) | 5000 | All of the above. Takes 40% damage, except for 5 s after each of Bao's songs (every 20 s), when it takes 140%. Each song heals the Keeper by 40. | 900 / 500 |

## 9. Isles

Each isle is an irregular disc about 70 m across, with cliffs you cannot fall off. It has:
- **the Landing,** where the rope comes down, with the camp;
- **3–4 Gloom groups,** each cleared when every form in it is freed;
- **Spires,** each beside a group;
- **cages,** opened with 3 rings;
- **the Hive,** in an arena at the far end.

| Isle | Groups | Spires | Cages | Extras |
|---|---|---|---|---|
| Clover Rise | 3 (4 Gloomlings; 3 Gloomlings + 2 Spitters; 3 Spitters + 2 Gloomlings) | 2 | Olla (landing), Pip (Spire 1) | 2 wild Puffberry bushes, windmills |
| Lantern Reef | 4 (3 Gloomlings + 2 Spitters; 1 Rammer + 3 Gloomlings; 2 Spitters + 1 Rammer; 2 Rammers + 2 Spitters) | 2 | Kai (the shore landing), Ria (the lighthouse rocks), Mina (Spire 2) | 2 ore rocks, 2 wild Cloudpear trees, lanterns |
| Ember Peaks | 4 (2 Flyers + 3 Gloomlings; Rammer + 2 Spitters + Flyer; 2 Rammers + 2 Flyers; 3 Spitters + 2 Flyers + Rammer) | 3 | Coal (landing), Tam (the cold forge) | 4 ore rocks, glowing lava (decoration only), forges |
| The Grey Star | 2 (4 Gloomlings + 2 Spitters; 2 Rammers + 2 Flyers) and the Heart | 0 | — | the sleeping pod |

- **Rescued people walk off on their own.**
  - Crew go to the rope and climb up to Bao.
  - Camp people walk to the landing and open their market straight away, even on a grey isle.
  - Nobody has to be escorted, and nobody is lost if the Keeper faints.
- **Freeing an isle:**
  - the Hive breaks and Bao sings;
  - the song shatters every shell still on the isle and opens every cage still standing;
  - the grey fades to colour over 3 s.
- **Leftover Gloom:** after the ending, the Gloom's dust still lies in quiet corners. One small group returns to a freed isle every 30 minutes of play.

## 10. Raids on Bao

- **When:**
  - **Scripted:** one on the first voyage after each Note isle is freed.
  - **Random:** 20% of later voyages while anything is still grey, but never on the Deep Song dive.
  - Raids start 40% of the way through the voyage, and the voyage waits until the raid is over.
- **Size:**
  - a scripted raid has 2 waves of `4 + 2 × isles freed`;
  - a random raid has 1 wave of `2 + 2 × isles freed`.
  - Raiders are forms already met on the newest freed isle, at that isle's tier × 0.8.
- **Warning:** 3 s, or 10 s with Ria the Lookout. Drop spots are marked 1.2 s before each wave lands.
- **What they do:**
  - Raiders walk to the nearest clean tree, and crust it after 5 s of touching it.
  - They attack the Keeper when the Keeper is closer than 3 m (Spitters from 7 m).
  - The crew climb down the hatch to Nana's cabin, banging pots and ringing bells. Hiding is fine; keeping still is not.
  - A Keeper who is in the cabin when a raid starts is sent up on deck.
- **Endings:**
  - **Win:** all waves freed, +25 glimmer per wave.
  - **Lose:** after 100 s the rest pop in the sunlight and float off as animals. Crusted trees stay crusted, and mood −12.
  - **The Keeper faints:** the raid is lost.

## 11. Sailing extras

- **Sky dew:** a small cloud drifts past about every 6 s. Tap it for +1 fullness, +1 mood and +1 glimmer.
- **Treasure cloud** (with Ria): one per voyage, +15 glimmer.

## 12. Cloud fishing

- **Where:** at the tail, while hovering or sailing.
- **How:** cast, then wait 2–6 s for a bite. Press **Reel** within the bite window.
- **Bite window:** Minnow 0.9 s, Carp 0.8 s, Ray 0.65 s, Koi 0.5 s, plus 0.35 s with the Good Line.
- **The school:** each place has 6 bites, refilling one every 40 s of play. When the school is empty, the fish are hiding.
- **What bites:**

| Waters | Minnow | Carp | Ray | Koi |
|---|---|---|---|---|
| Dawnreach, Clover | 60 | 30 | 9 | 1 |
| Reef | 40 | 35 | 20 | 5 |
| Ember, the Star | 30 | 35 | 25 | 10 |

The Good Line makes Ray and Koi 1.5 times as likely.

## 12b. Bao's deck and Nana's cabin

- **The deck** is a wooden ship deck on Bao's back, with green weed only at the edges. Garden trees grow in wooden planter boxes; their number is the stage's patch count (4, 6, 8, 10).
- **The hatch** (a round hole with a wooden gate) leads down to Nana's cottage. It reuses the owner's house from Zoo Garden: six rooms, the same plan and furniture kit. It hangs under Bao like an airship gondola: a wooden hull, and green weed on the walls. In the cottage:
  - **the bed:** rest to full health, and the game saves;
  - **the trophy shelf:** the Notes Bao holds glow above it, and it opens Bao's card;
  - **the stove:** the Kitchen once Mina is aboard;
  - **the craft-room workbench:** the Workbench;
  - **the study globe:** the sky map;
  - **the study desk:** the journal;
  - **the wardrobe:** the bag;
  - **the ladder at the front door:** back up on deck;
  - **the crew:** they spend time at home here (Nana by the fire, Mina in the kitchen, Tam at the workbench, Pip with the plants, Ria in the study) and you can talk to them.
- **Around the cabin** the game always shows a clear blue day sky with clouds, never a black void.
- **What still runs:** the cabin counts as being on Bao (Pip harvests, health comes back, you can sail from the map).

## 13. Rules that keep you from getting stuck

1. **No whale-food tree, no whale-food seed and under 5 glimmer:** Nana gives a Puffberry seed.
2. **No rope, no Ropevine (tree or seed), under 3 Fibre and under 6 glimmer:** Nana gives a Ropevine seed.
3. **Fullness too low:** the voyage just takes longer.
4. **Fainting:**
   - You keep everything.
   - Broken Spires and cleared groups stay so.
   - Rescued people board anyway.
   - A Hive you fainted at comes back cracked (up to −30% HP).
5. **No glimmer:** sell fruit at any market, or brush specks.
6. **Every stage gate** (XP plus a Note) can be met: each Note comes from an isle the stage before can reach.
7. **Loading** always starts on Bao, hovering where you were. A voyage in progress finishes.
8. **Saves** are written every 10 s, when the tab is hidden, and after every important event. Old saves are migrated, never thrown away.

## 14. Controls

| Action | Phone | Desktop |
|---|---|---|
| Move | Drag on the left half (a floating stick appears), or tap the ground | WASD or the arrow keys; click |
| Interact | Tap the thing, or the context button | F or Enter; click |
| Ring | Automatic when near; Ring button | Space |
| Chime Spin | Button | Q |
| Hop | Button | E or Shift |
| Quick Eat | Button | R |
| Map, Bag, Journal, Settings | Top buttons | — |
| Close a panel | ✕ | Esc |

- Touch targets are at least 44 CSS px; the action buttons are 64 px.
- Text is never smaller than 11 px, and nothing scrolls sideways.
- Controls stay inside the screen's safe areas.

## 15. Look

- **Shapes:** round and chunky, with soft bevels; toy-like and readable. The bar is stylized console quality: vivid and warm, never pastel.
- **One dominant hue per isle:**
  - Clover: green and gold;
  - the reef: teal and coral pink;
  - Ember: red and orange;
  - the Star: night blue, with the colour in its lights.
- **The Gloom** is grey-violet crystal with glowing violet eyes, a hue that no isle uses.
- **The day sky:** saturated blue, a golden sun, and clouds with warm tops and cool undersides.
- **Gloom tint:** one shared shader uniform (`uGloom`, 0–1) turns every scenery material grey-violet. Freeing an isle animates it to 0 in about 3 s, and it costs nothing per frame afterwards.
- **Lighting:** a 4-step toon ramp under hemisphere and sun lights, with flat model colours and no tone mapping. There is no per-frame glow or blur on phones.

## 16. Budgets (phones first)

| Scene | Draw calls | Triangles |
|---|---|---|
| Bao's back | ≤ 140 | ≤ 120k |
| An isle | ≤ 200 | ≤ 160k |

- **Download before play:** ≤ 3 MB. The models total about 2.5 MB.
- **Instancing:** scenery and clouds are instanced.
- **Shadows:**
  - Characters and Gloom forms have soft blob shadows.
  - The sun shadow map covers trees, props and Hives near the camera.
- **Quality governor:** Auto, Sharp, Balanced or Battery saver, stored per device.

## 17. Saves and settings

- **Save:** key `cloudback:save:main`, a versioned envelope with chained migrations. Settings → Save code exports and imports a text code.
- **Settings:** English or Tiếng Việt, sound and music volume, screen shake, graphics, replay the prologue, start over.
