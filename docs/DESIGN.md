# Cloudback: game design (rules and numbers)

This is the rule book for the code. `src/rules/content.ts` holds the same numbers as data. The tests in `tests/` check the promises made here: every gate can be reached, every item has a use, and no run gets stuck. If a number changes, change it here and in `content.ts`. The story is the owner's five chapters (`docs/STORY.md`); `docs/REVIEW-LOG.md` explains why each number is what it is.

## 1. One-page brief

- **Fantasy:** you are the captain of a young sky whale. You grow its food, fix up the home on its back, and fly it from land to land to free them from the Gloom. Then you take the fight to the Gloom's own fleet.
- **Core verbs:** plant, feed, sail, ring (fight and free).
- **Core loop:**
  1. Grow trees, feed Bao, ship, cook and fish.
  2. Sail to a land, free it and rescue friends.
  3. New crew, new markets and new seeds.
  4. Bao grows and reaches farther lands.
  5. With four Notes: board the Gloom's ships.
- **Loop contract:** the player **plants, feeds and fixes up the ship** to **grow Bao and reach farther lands**, while **Gloom raids and tough bosses** push back. That earns **Notes, crew, skills and glimmer**, which change **what to plant, what to repair and make, and where to sail next**.
- **Main trade-offs:**
  - glimmer buys either better seeds (Bao grows faster), gear (fights get easier) or room repairs (the ship earns more);
  - each planter box holds whale food, people food or craft trees;
  - spare goods go to the shipping crate now, or to a market later for more.
- **Loop lengths:**
  - a moment: 5–30 s (a harvest, a fight, a cast);
  - a land: 6–12 min; a boarding mission: 3–5 min.
  - The whole story is about 60–100 min for a real player. The scripted players in `tests/progression.test.ts` take about 34 min (attentive) and 63 min (casual, the worst case).
- **Fail and retry:**
  - A fainted Captain is pulled back up by Bao at full health, and nothing is lost.
  - The boss heals, but every faint at it cracks its crust, so it comes back 10% weaker, up to 30%.
  - Groups that were not cleared come back.
- **Platforms:** phones first (upright and sideways), and desktop.
- **Camera:** a perspective follow camera, FOV 40 and pitch 47°.
  - Distance from the Captain: 19 m on Bao, 22 m on lands, 21 m on a Gloom ship.
  - In the skiff it is low and close: 13 m at 17°.
  - On upright phones: a wider lens (47°), 1.22 times farther back.
- **Speed:** the Captain walks at 5.2 m/s.

## 2. Places and gates

Sky-map positions are in leagues (`content.ts PLACES`). A voyage costs **2 fullness per league**, ×0.85 once the Study is repaired.

| Place | Kind | Map position | To get there you need |
|---|---|---|---|
| Dawnreach (open sky, start) | — | (0, 0) | — |
| Clover Rise | land | (13, −9) | Calf |
| Lantern Reef | land | (−14, −28) | Young (passes the Wind Wall) |
| Ember Peaks | land | (16, −46) | Adult (passes the Storm Belt) |
| Frostfall | land | (−15, −62) | Great (passes the Frost Veil) |
| The Scout Sloop | Gloom ship | (14, −74) | all four Notes (the fleet shows itself) |
| The Warship | Gloom ship | (−8, −80) | the Scout Sloop freed |
| The Grey Star | Gloom ship (flagship) | (3, −98) | the Warship freed (in the Deep Mist) |

- **Where Bao is:** Bao is always *at* one place and can sail to any place it is allowed to reach. Dawnreach is only the start.
- **The fleet** is hidden on the sky map until Bao knows all four Notes.
- **Voyage time:** `24 s + 0.9 s × leagues`, at most 75 s.
- **Hungry flights:**
  - If fullness is below the cost, the voyage still happens; it takes twice as long, fullness drops to 0 and mood falls by 10.
  - **Bao is never stranded.**

## 3. Bao the whale

| Stat | Range | Start | Notes |
|---|---|---|---|
| Fullness | 0–100 | 70 | Voyages spend it; whale food fills it. |
| Mood | 0–100 | 70 | Changes how fast trees grow; shown by Bao's eyes and hum. |
| Growth XP | 0 and up | 0 | Whale food and fish treats raise it. |
| Stage | Calf, Young, Adult, Great | Calf | Needs growth XP **and** the right Note. |

| Stage | Growth XP needed | Note needed | Planter boxes | Back scale | Unlocks |
|---|---|---|---|---|---|
| Calf | 0 | — | 4 | 1.00 | Clover Rise |
| Young | 120 | Note of Dawn | 6 | 1.30 | the Wind Wall (Lantern Reef) |
| Adult | 380 | Note of Tide | 8 | 1.55 | the Storm Belt (Ember Peaks) |
| Great | 760 | Note of Ember | 10 | 1.80 | the Frost Veil (Frostfall); with the Note of Frost, the fleet |

- **Growing up:** when both needs are met, Bao's card shows **Grow!** and a short ceremony plays. Growth XP keeps counting.
- **Bao always eats:** fullness stops at 100, but growth XP still counts. **Mood** comes from care, not from food.

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
| A freed land or ship (the song) | +20 |
| Each 60 s of play | 1 point toward 50 |
| Each speck on Bao, every 60 s | −1 |
| A hungry voyage | −10 |
| A lost raid | −12 |

Mood never changes while the game is closed.

- **Gloom specks:**
  - At a crusted place a speck lands every 40 s, up to 5; elsewhere one every 180 s, up to 2.
  - While the Captain is away, Nana brushes all but 2.
  - Brushing one gives +4 mood and +2 glimmer.

## 4. Trees (the garden)

Trees are perennial: plant a seed once and the tree fruits again and again. Uprooting gives the seed back. Times are seconds at mood ×1.00, with no Gardener and Gardening level 1.

| Tree | Kind | First fruit | Regrow | Yield | Seed source | Seed price |
|---|---|---|---|---|---|---|
| Sprout Bean | Craft (coin) | 15 | 12 | 2 beans (crate 2 ✦ each) | Start ×2 | 3 |
| Puffberry | Whale food | 40 | 35 | 3 | Start ×2, every market | 5 |
| Ropevine | Craft (Fibre) | 50 | 45 | 2 | Start ×2, every market | 6 |
| Cloudpear | People food | 80 | 60 | 2 | Clover Market | 10 |
| Chimewood | Craft | 100 | 80 | 2 | Clover and Frost Markets | 14 |
| Glowplum | Whale food | 120 | 90 | 2 | Clover Market | 28 |
| Honeybun | People food | 130 | 100 | 2 | Reef Market | 18 |
| Starfig | Whale food | 200 | 150 | 2 | Reef Market | 55 |
| Golden tree | Decoration | 600 | — | — | Drifts down from the moss on Grand Hana's back (the ending) | — |

- **The better trees are better per box.** Growth XP per tree per minute is 15 (Puffberry), 20 (Glowplum) and 36 (Starfig).
- **Pip the Gardener:** growth ×1.2, and Pip harvests every ripe tree into the pantry every 8 s, **but only while the Captain is on Bao** (the deck, the cottage or the skiff).
- **While the Captain is away** (down on a land or a ship, or the game is closed), each tree ripens once and waits. Ripe fruit never piles up and never rots.
- **Clock:** the garden grows on the real clock.
- **Raids:** a tree crusted in a raid loses its ripe fruit and stops growing until it is rung 3 times.

## 5. Items, sources and uses

The pantry and the bag are the same inventory. `tests/economy.test.ts` checks that every item has a source and a use, and that no market sells anything for less than any market buys it.

| Item | Sources | Uses | Sell price |
|---|---|---|---|
| Puffberry (whale food) | Tree, wild bushes on Clover | Feed Bao: +12 full, +3 growth | 1 |
| Glowplum (whale food) | Tree | Feed Bao: +22 full, +15 growth | 10 |
| Starfig (whale food) | Tree, Ember Market (45), a family's gift | Feed Bao: +35 full, +45 growth | 24 |
| Cloudpear (people food) | Tree, wild trees on the reef, Nana's lunch (3 at the start) | Eat +25 HP; cooking; Bao's flower crown | 4 |
| Honeybun (people food) | Tree | Eat +45 HP; cooking | 8 |
| Warm Cocoa (people food) | Frost Market (15), a family's gift | Eat +70 HP | 6 |
| Fibre (craft) | Ropevine | Rope, kitchen and study repairs, Coat, Good Line, lantern string | 3 |
| Chimewood (craft) | Tree | Mallet, Chime Post, craft room and study repairs, golden bell | 6 |
| Ore (craft) | Ore rocks (2 each; back after 10 min), Ember Market (16), a family's gift | Mallet III, Coat III, bathroom repair, golden bell | 6 |
| Puff Minnow, Sun Carp, Star Ray, Cloud Koi | Fishing from the skiff | Treat for Bao (+5 full, +4 growth, +6 mood; Koi +15 growth, +20 mood); cooking | 2 / 5 / 10 / 25 |
| Pear Tart, Fish Bun, Sky Stew (meals) | The cottage kitchen | Eat (§6) | — |
| Seeds | Markets, the start, Nana's safety net, families' gifts, Grand Hana | Plant | — |
| Glimmer (money) | Freeing Gloom forms, Spires, bosses, rescues, families, specks, the crate, selling, raids, sky dew | Seeds, gear, posts, repairs, keepsakes, ore, the bait pot | — |
| Notes (4) | The four lands' bosses | Bao's growth, the Deep Song (the fleet) | — |

- **The shipping crate** on deck pays the basic price at once: 75% of the sell price, rounded down, at least 1 glimmer. Sky-post finches carry the goods away.
- **Markets** pay the sell price, ×1.5 (rounded) for what they like:

| Market | Owner | Likes | Sells |
|---|---|---|---|
| Clover | Mayor Olla | fish | Puffberry, Ropevine, Cloudpear, Chimewood and Glowplum seeds |
| Reef | Old Kai | people food | Puffberry, Ropevine, Honeybun and Starfig seeds; the **bait pot** (60): bites come 40% sooner from the skiff |
| Ember | Granny Coal | whale food | Puffberry and Ropevine seeds, Ore and Starfig fruit |
| Frost | Bram | craft goods | Puffberry, Ropevine and Chimewood seeds, Warm Cocoa |

## 6. Home, skills, workbench and kitchen

### 6a. Home repairs (chapter 2)

Nana's cottage below deck starts dusty. Four rooms are boarded up: a plank barricade across the doorway and dust sheets over the furniture. A repair takes both away and opens the room's job.

| Room | Cost | Job |
|---|---|---|
| Kitchen | 3 Fibre, 15 glimmer | Cook meals at the stove |
| Craft room | 4 Chimewood, 40 glimmer | Workbench glimmer costs −20%; the Good Line and the keepsakes; the cottage workbench |
| Study | 2 Chimewood, 4 Fibre, 60 glimmer | Voyages cost 15% less fullness; the globe (sky map) and the desk (journal) |
| Bathroom | 2 Ore, 80 glimmer | A bath after a nap makes you **Fresh**: +15% damage for 5 minutes |

Each repair gives 10 Crafting XP.

### 6b. Life skills (chapter 2)

Everything you do trains a skill, up to level 10. The skill XP needed for levels 2–10 is 10, 25, 45, 70, 100, 140, 190, 250 and 320, cumulative.

| Skill | Trained by | Perk per level above 1 |
|---|---|---|
| Gardening | +2 per harvest (Pip's too) | Growth +2%; a bonus fruit at 4% |
| Fishing | +4 per catch | Bite window +0.03 s; rare fish (Ray, Koi) +6% likelier |
| Cooking | +5 per meal | Meals heal +4%; a second portion at 5% |
| Crafting | +6 per recipe, +10 per repair | Workbench glimmer costs −3% |

- Chances never use dice: the fraction is banked each time and pays out whole, so a 36% bonus gives 9 bonus fruits in 25 harvests.
- Fighting still raises the Captain's level.

### 6c. Workbench

Nana makes the basic recipes. Tam sets up an anvil at the deck workbench once he is aboard and makes the Smith recipes. Glimmer costs below are before the craft room and the Crafting perk.

| Recipe | Cost | Effect |
|---|---|---|
| Climbing Rope | 3 Fibre | Go down to the lands (made once) |
| Mallet II | 4 Chimewood, 30 glimmer | Damage ×1.4 |
| Mallet III (Tam) | 6 Chimewood, 6 Ore, 150 glimmer | Damage ×2.2 |
| Coat II (after the rope) | 6 Fibre, 30 glimmer | +40 max HP |
| Coat III (Tam) | 10 Fibre, 6 Ore, 150 glimmer | +120 max HP |
| Good Line (rope and craft room) | 4 Fibre, 20 glimmer | Bite window +0.35 s, rare fish ×1.5 |
| Chime Post | 3 Chimewood, 15 glimmer | A raid tower on one of 4 post spots. Each ring (every 1.2 s, 3.5 m) deals half the Captain's ring damage and slows Gloom forms by 40% for 1 s. ×1.5 with Tam. |
| Lantern string (keepsake; rope and craft room) | 4 Fibre, 80 glimmer | Paper lanterns around Bao's back |
| Flower crown for Bao (keepsake; craft room) | 2 Cloudpear, 150 glimmer | Bao wears flowers |
| Golden bell (keepsake, Tam) | 4 Ore, 4 Chimewood, 300 glimmer | The mallet shines gold |

### 6d. Kitchen

The repaired cottage kitchen cooks the Pear Tart; Mina teaches the other two. A meal heals (more with Cooking), and a buff lasts 150 s.

| Meal | Ingredients | Heal | Buff |
|---|---|---|---|
| Pear Tart | 2 Cloudpear | 90 | — |
| Fish Bun (Mina) | 1 Honeybun, 1 fish | 70 | +20% damage |
| Sky Stew (Mina) | 1 Cloudpear, 2 fish (cheapest first) | 50 | −25% damage taken |

- **Mina's breakfast:** once every "day" of play (20 minutes), Mina leaves a Fish Bun in your bag.
- **Quick Eat** picks the smallest food that covers the missing health, or the biggest food if none does.

### 6e. Building out the ship (the owner)

The first goal after the first harvest: quick Sprout Beans (15 s) pay for the **side decks**. Wooden decks bolted round Bao's rim widen the walkable oval and add planter boxes. Growth works like volume: every stage and every extension costs much more than the last and adds less room. A Great whale with all three has a 27 × 36 m deck, the size of Zoo Garden's safe area (radius 18 m), and it grows no further.

| Extension | Cost | Oval grows (calf m) | Boxes |
|---|---|---|---|
| Side decks | 6 Sprout Beans, 20 glimmer | +1.6 across | +2 |
| Bow and stern decks | 4 Chimewood, 4 Fibre, 90 glimmer | +2.6 across, +1.2 long | +2 |
| Grand deck | 4 Ore, 4 Chimewood, 250 glimmer | +3.2 across, +2.0 long | +2 |

The camera moves back as the deck grows. The wheel or a two-finger pinch zooms from 0.75× to 1.6×.

## 7. The Captain

- **Level** comes from XP, up to level 20. Cumulative XP for levels 2–20: 40, 100, 190, 300, 440, 600, 800, 1040, 1320, 1650, 2080, 2600, 3200, 3900, 4800, 5900, 7200, 8700 and 10400.
- **Max HP** = 100 + 15 × (level − 1) + Coat.
- **Damage per ring** = (10 + 2 × (level − 1)) × Mallet × buffs (a meal's +20% and the bath's Fresh +15% can both be on).
- **Ring:** every 0.55 s, in a 2.0 m arc in front. It fires by itself when a target is within 1.95 m, so it never swings at nothing. Space and the Ring button also ring.
- **Chime Spin:** 2.8 m all around, ×1.6 damage, 6 s cooldown.
- **Hop:** a 4.5 m dash, invulnerable for 0.3 s, 3.5 s cooldown.
- **After a hit:** invulnerable for 0.8 s.
- **Healing:** 2 HP per second on Bao (deck, cottage, skiff), but not during a raid and never on lands or ships.

## 8. Gloom forms and bosses

Base numbers; the place's tier multiplies them.

| Form (freed animal) | HP | Damage | Speed | Attack | XP | Glimmer |
|---|---|---|---|---|---|---|
| Gloomling (puffbun) | 30 | 6 | 2.4 | Bump at 1.1 m (0.3 s wind-up, 1.3 s cooldown) | 8 | 2 |
| Spitter (hopfrog) | 26 | 8 | 1.6 | Shard: 0.6 s wind-up line, 9 m/s, range 8 m | 10 | 3 |
| Rammer (rockgoat) | 90 | 14 | 1.8 (charges at 9) | Charge line: 0.8 s wind-up, 7 m | 24 | 6 |
| Flyer (skylark) | 40 | 10 | 3.2 | Dive circle: 0.7 s wind-up, radius 1.6 m | 14 | 4 |
| Shellback (pebbleturtle) | 70 | 12 | 1.5 | Shield bash at 1.3 m (0.45 s, 1.8 s cooldown). **Its front shield takes 15% of a plain ring**, and it turns only 1.8 rad/s, so step round behind it, or Spin. | 18 | 5 |
| Puffcap (mushpup) | 40 | 10 | 2.0 | Swells for 1.2 s when within 2.2 m, then bursts in a 2.6 m ring that hurts you and **throws every other form 3 m**, overboard if near a rail. A ring cannot stop the swell. 4.5 s to swell again. | 14 | 4 |
| Spire | 120 | — | — | Wakes a Gloomling every 7 s while you are within 13 m, at most 3. **Woken Gloomlings give nothing**: they were only napping. | 30 | 10 |

| Tier | Places | HP | Damage | Rewards | Recommended level |
|---|---|---|---|---|---|
| 0 | Clover | ×1.0 | ×0.8 | ×1.0 | 1 |
| 1 | Reef | ×1.9 | ×1.5 | ×1.6 | 5 |
| 2 | Ember | ×3.0 | ×1.8 | ×2.4 | 9 |
| 3 | Frostfall, the Scout Sloop | ×3.7 | ×2.1 | ×2.8 | 13 |
| 4 | The Warship, the Grey Star | ×4.4 | ×2.4 | ×3.2 | 15 |

**Bosses.**
- **HP:** a boss's HP is final (not multiplied by tier), but its move damage is multiplied by the tier's damage factor.
- **Shield:** a land's Hive is shielded while any Spire stands; a ship's captain while any raider group stands. Blows glance off with a bell sound.
- **Moves:** every 3.4 s it winds up a move, telegraphed for at least 0.6 s.
- **Faints:** each faint during its fight cracks it 10%, up to 30%.
- **Ships:** Juno's chime cannon softens a ship captain's crust by 10% as Bao comes alongside.

| Boss | HP | Its trick | Moves (base damage) | XP / glimmer |
|---|---|---|---|---|
| Thornhive (Clover) | 480 | Stand close or far | Thorn ring (14; safe within its radius + 1.15 m, or outside 7.5 m), spike lines ×3 (12), wakes 2 Gloomlings | 150 / 80 |
| Clamhive (Reef) | 1500 | Takes 15% while shut; it gapes for 1.9 s after each move | Pearl volley (5 shards, 10), tide ring (16, safe inside or outside 9 m) | 300 / 160 |
| Forgehive (Ember) | 3000 | It slams where you stand | Slam (20, radius 3.4), crystal cracks ×2 (18), calls 2 Flyers | 520 / 280 |
| Hush Bell (Frostfall) | 3200 | **Silent**: takes nothing until you ring its three **echo bells** (one ring each), which cracks it for 8 s at ×1.25; then the bells go quiet again. Its **domes of silence** (radius 3.2 m, 6 s) stop your mallet inside them. | Silence dome on your spot, frost ring (16, 8.5 m), ice shards ×6 (11), calls 2 Puffcaps | 640 / 340 |
| Captain Barnacle (the Scout Sloop) | 2800 | Its shell takes 40%; each **anchor throw** sticks in the deck and holds it 3.5 s, when it takes 150% | Anchor throw (22, radius 2.2), **chain sweep** (16, a ring out to 8.5 m that a hop clears), calls 2 Gloomlings | 560 / 360 |
| Coilwyrm (the Warship) | 3400 | Untouchable while coiled; ring the three **knots** on its coils (2 rings each) and it flops down dizzy for 7 s at ×1.4; then the knots grow back | Head strike (20, radius 2), spat shards ×3 (12), coil-lash ring (16) | 700 / 420 |
| Grey Heart (the Grey Star) | 5000 | Takes 40%, except for 5 s after each of Bao's songs (every 20 s), when it takes 140%; each song heals you 40. **The deck lists** toward one rail and then the other every 12 s, sliding everyone 0.9 m/s (raiders through the gaps) | Thorn rings, pearl volleys, slams, spike lines and tide rings | 900 / 500 |

## 9. Lands

Each land is an irregular disc about 70 m across, with cliffs you cannot fall off. It has:
- **the landing,** where the rope comes down, with the camp;
- **3–4 Gloom groups,** each cleared when every form in it is freed;
- **Spires,** each beside a group;
- **cages,** opened with 3 rings;
- **the boss,** in an arena at the far end.

| Land | Groups | Spires | Cages | Extras |
|---|---|---|---|---|
| Clover Rise | 3 | 2 | Olla (landing), Pip (Spire 1) | 2 wild Puffberry bushes, windmills |
| Lantern Reef | 4 | 2 | Kai (landing), Ria (the lighthouse rocks), Mina (Spire 2) | 2 ore rocks, 2 wild Cloudpear trees, lanterns |
| Ember Peaks | 4 (Shellbacks join) | 3 | Coal (landing), Tam (the cold forge) | 4 ore rocks, glowing lava (decoration only), forges |
| Frostfall | 4 (Shellbacks and Puffcaps) | 3 | Bram (landing), Juno (**locked** in her workshop until Spire 1 breaks) | 2 ore rocks, snow pines, ice, the ice-hut workshop, snow lanterns |

- **Getting down and back:** the rope at the landing, both ways. **Nana's conch** (first given on the first landing; the 🐚 button or C) makes Bao lower the rope where you stand, anywhere except within 13 m of a standing boss.
- **Rescued people walk off on their own.**
  - Crew go to the rope and climb up to Bao.
  - Camp people walk to the landing and open their market straight away, even on a grey land.
  - Nobody has to be escorted, and nobody is lost if the Captain faints.
- **Freeing a land:**
  - the boss breaks and Bao sings;
  - the song shatters every shell still standing and opens every cage;
  - the grey fades to colour over 3 s.
- **Leftover Gloom:** after the ending, the Gloom's dust still lies in quiet corners: one small group returns to a freed land every 30 minutes of play.

## 9b. The Gloom fleet (chapter 5)

**The ships.** The Gloom's ships are sky creatures it has crusted over, each with a flat **oval** deck on its back, like Bao's (the owner: no masts, nothing tall in the middle). The deck is 22 × 32 m, with the head toward the bow. A rail runs all round it with **six gaps**, at ±40°, ±90° and ±140° from the bow. The hold hatch is near the bow.

**A mission:**
1. **Sail to the ship.** Bao comes alongside, and Juno's cannon softens the captain's crust (−10% HP).
2. **Board.** You need Juno (her plank). Step onto the plank from Bao's starboard rail and pick **two crew mates**.
3. **Fight across the deck.** Its raider groups (2 per ship) guard the captain. Rings push hard on a deck (1.15 m, Spin 2.1 m). A raider knocked through a rail gap goes overboard and is freed; a solid rail stops it.
4. **Free the families** in two cages by the hold (3 rings each). Each family gives 30 glimmer × the tier's rewards, 30 XP × rewards and a gift:
   - the Sloop: a Starfig seed and 3 Ore;
   - the Warship: 2 Warm Cocoa and a Glowplum seed;
   - the Grey Star: a Cloud Koi and a Honeybun seed.
   The families walk over the plank to Bao. A beaten captain frees any family still caged.
5. **Beat the captain** (§8). The crust shatters off the creature, and its colours pour back over 3 s. Walk back over the plank, or blow the conch.

**Crew mates** fight beside you and are never hurt.
- **What they all do:** they follow you, and every 1.6 s they ring a raider within 2.4 m at a share of your ring damage.

| Crew mate | Share | Extra |
|---|---|---|
| Pip | 0.35 | Pushes raiders 1.6× as far |
| Mina | 0.30 | Heals you 10 HP every 10 s |
| Tam | 0.60 | — |
| Ria | 0.35 | Her rings slow raiders like a Chime Post |

**Juno's chime cannon** (on Bao's stern, from Juno's rescue) fires a ringing bell every 7 s at the thickest crowd of Gloom forms. It hits in a 2.8 m blast for 0.8× your ring damage and pushes them 2.6 m. It fires on Bao's deck in a raid and onto the enemy deck during a boarding.

## 10. Raids on Bao

- **When:**
  - **Scripted:** one on the first voyage after each Note land is freed (4 in all).
  - **Random:** 20% of later voyages while anything is still grey, never on the way to the Grey Star.
  - Raids start 40% of the way through the voyage, and the voyage waits until the raid is over.
- **Size:**
  - a scripted raid has 2 waves of `4 + 2 × lands freed`;
  - a random raid has 1 wave of `2 + 2 × lands freed`;
  - either way, at most 10 per wave.
  - Raiders are forms already met on the newest freed land, at that land's tier × 0.8.
- **It is a ship battle** (the owner's design, 2026-10-16):
  - Small crusted sky creatures come alongside: 2 for a scripted raid, 1 for a random one, each on a different side. Each lays a boarding plank to Bao's rim.
  - **Battle stations:** every planter, tree and fitting sinks below the deck and is not drawn during the fight. The hatch, any Chime Posts, Juno's cannon and two **gongs** stay up.
  - **The crew** climb down the hatch, banging pots. Hiding is fine; keeping still is not. A Captain in the cottage or the skiff is brought up on deck.
- **Warning:** the raiders' creatures glide in for 3 s, or 10 s with Ria the Lookout. Then the raiders walk over the planks one after another (every 0.9 s per plank).
- **What raiders do:**
  - They head for the **hatch**. One standing on it for 5 s crusts a tree stored below deck, and keeps doing so while it stays.
  - They attack the Captain when closer than 3 m (Spitters from 7 m).
- **Fighting back:**
  - **Overboard is the best way:** a raider pushed past the gunwale falls, is freed, and gives +1 glimmer.
  - **Gongs:** 0.6× your ring damage and a 3.4 m throw for every raider within 4.8 m; 6 s to stop humming.
  - **Chime Posts** ring by themselves and slow raiders. **No healing** on deck during a raid.
- **Endings:**
  - **Win:** all waves freed or overboard, +25 glimmer per wave.
  - **Lose:** after 100 s, or if the Captain faints. The rest pop in the sunlight; crusted trees stay crusted until rung clean; mood −12.

## 11. Sailing extras

- **Sky dew:** a small cloud drifts past about every 6 s. Tap it for +1 fullness, +1 mood and +1 glimmer.
- **Treasure cloud** (with Ria): one per voyage, +15 glimmer.

## 12. Fishing from the skiff

- **The trip:** the lift on Bao's starboard rail lowers you 16 m in 2.4 s (1.2 s with Juno) through the clouds to a little **skiff on the sea**, with rocks, buoys and fish swimming under the surface. **Pull the rope** to go back up.
- **The game:** Zoo Garden's fishing (rules/reel.ts, the owner's code):
  1. Cast, then wait 2–5.5 s. Bait comes ×1.7 faster, a better rod sooner.
  2. A fish swims up and nibbles 1–4 times. Pressing early scares it off.
  3. It bites: hook it within 1.4 s + 0.6 × rod quality.
  4. **Hold Reel** to bring it in. Tension builds, faster while the fish surges.
  5. When the bar fills, the line strains ("Let go!") and may snap: 45%, or 25% with the Good Line. Seven seconds of slack loses the fish.
- **Rod quality:** 0.3, +0.3 with the Good Line, +0.03 per Fishing level.
- **How hard each fish fights:** Minnow 0.15, Carp 0.3, Ray 0.5, Koi 0.75.
- **The school:** each place has 6 bites, refilling one every 40 s of play.

| Waters | Minnow | Carp | Ray | Koi |
|---|---|---|---|---|
| Dawnreach, Clover | 60 | 30 | 9 | 1 |
| Reef | 40 | 35 | 20 | 5 |
| Ember, Frostfall, the fleet | 30 | 35 | 25 | 10 |

## 11b. What Bao flies over

Far below the clouds lies a green forest (Clover, Ember), the sea (Reef, Frostfall), or nothing but cloud tops when Bao flies high (Dawnreach, the fleet). Halfway through a voyage it changes to the destination's.

## 12b. Bao's deck and Nana's cottage

- **The deck** is a wooden ship deck on Bao's back, with green weed only at the edges. It holds:
  - planter boxes (the stage's count: 4, 6, 8, 10);
  - the map table at the bow, the workbench, the shipping crate and the pantry;
  - the rope post, the fishing lift and the hatch;
  - Juno's cannon at the stern, and the boarding plank (out when a Gloom ship is alongside).
- **The hatch** (a round hole with a wooden gate) leads down to Nana's cottage. It reuses the owner's house from Zoo Garden: six rooms, the same plan and furniture kit. It hangs under Bao on a wooden hull with green weed on the walls, always in a clear blue day sky.
- **In the cottage:**
  - **the bed:** you wake up here in chapter 1; rest to full health (and the game saves); after a nap, a bath makes you Fresh;
  - **the trophy shelf:** the four Notes glow above it; it opens Bao's card;
  - **the wardrobe:** the bag;
  - **the ladder** at the front door: back up on deck;
  - **the boarded doorways:** the Repair button;
  - **once repaired:** the stove (the kitchen), the craft-room workbench, the study's globe (sky map) and desk (journal), and the bathtub;
  - **the crew:** they spend time at home in their rooms (in the living room while a room is still boarded up), and you can talk to them.
- **What counts as "on Bao":** the deck, the cottage and the skiff (Pip harvests, health comes back, you can sail).

## 13. Rules that keep you from getting stuck

1. **No whale-food tree, no whale-food seed and under 5 glimmer:** Nana gives a Puffberry seed.
2. **No Ropevine (tree or seed), under 3 Fibre and under 6 glimmer, while the rope or the kitchen still needs Fibre:** Nana gives a Ropevine seed.
3. **The first Pear Tart is a lesson, never a lock:** without two Cloudpears the goal card skips it.
4. **The kitchen's glimmer:** the crate turns anything spare into glimmer at once.
5. **Fullness too low:** the voyage just takes longer.
6. **Fainting:**
   - You keep everything.
   - Broken Spires and cleared groups stay so; rescued people and freed families stay free.
   - A boss you fainted at comes back cracked (up to −30% HP).
7. **Juno and the fleet:** Juno's cage stands on Frostfall, and breaking the Hush Bell opens every cage there, so the fleet (which needs the fourth Note) can always be boarded.
8. **Every stage gate** (XP plus a Note) can be met: each Note comes from a land the stage before can reach.
9. **Loading:**
   - It always starts on Bao, hovering where you were.
   - A voyage in progress carries on, and a raid it was in starts again.
   - A new captain starts in the cottage bed.
10. **Saves:**
    - Written every 10 s, when the tab is hidden, and after every important event.
    - Old saves are migrated, never thrown away.
    - Version 1 saves (the three-isle story) keep a working kitchen if the rope was made; an unfinished old Grey Star starts fresh.

## 14. Controls

| Action | Phone | Desktop |
|---|---|---|
| Move | Drag on the left half (a floating stick appears), or tap the ground | WASD or the arrow keys; click |
| Interact | Tap the thing, or the context button | F or Enter; click |
| Ring | Automatic when near; Ring button | Space |
| Chime Spin | Button | Q |
| Hop | Button | E or Shift |
| Quick Eat | Button | R |
| Nana's conch | 🐚 button (lands and ships) | C |
| Skiff: cast, reel | Cast or Reel button, or tap anywhere | F |
| Skiff: back up | Pull the rope button | — |
| Map, Bag, Journal, Settings | Top buttons | — |
| Close a panel | ✕ | Esc |

- **Sizes:** touch targets are at least 44 CSS px, and the action buttons are 64 px. Text is never smaller than 11 px, and nothing scrolls sideways. Controls stay inside the screen's safe areas.
- **Focus:** a HUD button gives the keyboard focus back after a click, so F and Space keep working.

## 15. Look

- **Shapes:** round and chunky, with soft bevels; toy-like and readable. The bar is stylized console quality: vivid and warm, never pastel.
- **One dominant hue per place:**
  - Clover: green and gold;
  - the reef: teal and coral pink;
  - Ember: red and orange;
  - Frostfall: white snow and pale blue ice (never violet);
  - the fleet: a pink-violet dusk, darkening to the Grey Star's night.
- **The Gloom** is grey-violet crystal with glowing violet eyes, a hue no place uses.
- **Gloom tint:** one shader uniform (`uGloom`, 0–1) turns scenery grey-violet. Freeing a land animates it to 0 in about 3 s, and it costs nothing per frame afterwards. Each Gloom ship-creature has its own uniform, so it is freed on its own.
- **Lighting:** a 4-step toon ramp under hemisphere and sun lights, flat model colours and no tone mapping. There is no per-frame glow or blur on phones.

## 16. Budgets (phones first)

| Scene | Draw calls | Triangles |
|---|---|---|
| Bao's back | ≤ 140 | ≤ 120k |
| A land or a Gloom ship | ≤ 200 | ≤ 160k |

- **Download before play:** ≤ 3 MB. The models are compressed (meshopt) at build time.
- **Instancing:** scenery and clouds are instanced.
- **Shadows:** characters and Gloom forms have soft blob shadows; the sun shadow map covers trees, props and bosses near the camera.
- **Quality governor:** Auto, Sharp, Balanced or Battery saver, stored per device.

## 17. Saves and settings

- **Save:** key `cloudback:save:main`, a versioned envelope (version 2) with chained migrations. Settings → Save code exports and imports a text code.
- **Settings:** English or Tiếng Việt, sound and music volume, screen shake, graphics, replay the prologue, start over.
