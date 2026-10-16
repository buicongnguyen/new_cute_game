# Story and logic review log

The story went through three drafts. After each draft, a logic check looked for holes: actions without a reason, rules that contradict each other, ways to get stuck, punishments that don't fit a cute game, and numbers that make a system meaningless. Every problem found is listed below with its fix. The fixes are in `docs/STORY.md` and `docs/DESIGN.md`.

## Draft 1: the owner's idea, extended

The owner's idea: a floating whale is the ship, people live on its back, trees grow food for the whale and for people, and the whale lands on isles where you trade, fight alien creatures and rescue people to bring aboard.

The first extension added: the whale grows in stages, three kinds of trees, the Gloom whose creatures are freed rather than killed, the song that breaks the Gloom, a pod to find at the end, rescued people with jobs, markets on isles, cloud fishing, and raids on the whale.

### Logic check 1 (12 problems)

| # | Problem | Fix in draft 2 |
|---|---|---|
| 1.1 | Why do trees grow on a whale at all? | World rule 1: whales carry gardens and gardens feed whales. The backfolk and the whales live together, so it is normal life, not a trick. |
| 1.2 | If song breaks the Gloom, why can't Bao just sing over every isle? | Each isle has a Hive that anchors the Gloom and holds a stolen Note. Song only cleanses an isle after its Hive is broken, and the Hive is shielded by Spires. That explains why the Keeper must go down. |
| 1.3 | Why are the song pieces on the isles? | The Grey Star stole the pod's song. It broke into Notes, and each Hive swallowed one. |
| 1.4 | Why does a child live on a calf with no family? | The prologue: Grand Hana pushed Bao up as the crust closed, with Nana Sumi and her grandchild on its back. |
| 1.5 | "Find the pod" had no place or ending. | The pod sleeps under the Grey Star in the Deep Mist. Diving there needs the Deep Song (all 3 Notes) and a Great whale. The finale boss is the Grey Heart. |
| 1.6 | Why are people in cages? | World rule 2: whatever stays still, the Gloom crusts. The people hid and kept still, so crystal cages grew around them. |
| 1.7 | Why would every rescued person move onto a small whale? | They don't. On each isle, one person stays to rebuild and opens a market at the landing, and the others (with a reason each) join the crew. |
| 1.8 | Why fight at all instead of sneaking to the boss? | The Spires power the Hive's shield, cages sit beside the Spires, and Spires wake Gloomlings near them. |
| 1.9 | Killing creatures clashes with a cute game. | Fighting means freeing: shells shatter and the animal inside hops out. The dropped *glimmer* is clean crystal, which islanders use for lanterns and as money. |
| 1.10 | Why would the Gloom attack the whale? | It hears the song. A scripted raid follows each freed isle, and small random raids come while any isle is still grey. |
| 1.11 | If people can eat whale food too, the tree types blur into one. | The three food kinds are kept apart: whale food only for Bao, people food only for people, craft only for crafting. Fish are the one shared item: a treat for Bao, or food for cooking. |
| 1.12 | What happens when you lose? | You faint, Bao pulls you up at full health, and you keep everything. The Hive heals, and groups that were not cleared return. |

## Draft 2: rules made concrete

Draft 2 named the characters (Bao, Nana Sumi, Pip, Mayor Olla, Old Kai, Mina, Granny Coal, Tam, Ria, Grand Hana), wrote the prologue and chapters 0–4, defined the three rules, the four Gloom forms and the Spire/cage/Hive structure of each isle, and gave first numbers for hunger, mood, growth, levels and prices.

### Logic check 2 (15 problems)

| # | Problem | Fix in draft 3 |
|---|---|---|
| 2.1 | Hunger dropping while the game is closed punishes players for being away. | Only voyages spend hunger, and mood changes only during play. |
| 2.2 | Mood never fell, so after an hour it was always full and meant nothing. | Mood drifts toward 50 by 1 point per minute of play, and each speck on Bao pulls it down. Brushing, petting, treats and songs push it up. |
| 2.3 | If a full whale refused food, players would have to fly pointless voyages to grow Bao. | Bao always eats. Hunger stops at 100, but growth XP still counts. |
| 2.4 | Growth from XP alone let a player out-feed the story and reach the last isle first. | Each stage needs growth XP **and** a Note, and each Note comes from the isle the stage before can reach. |
| 2.5 | Early XP needs (80/200/450) were met in two minutes, so feeding didn't matter. | Raised to 150/650/1500, so feeding Bao runs alongside each chapter (checked by the simulation in `tests/progression.test.ts`). |
| 2.6 | The only crafter was on the last isle, which meant no upgrades for two chapters. | Nana runs the Workbench (tiers I–II) from the start; Tam adds tiers III–IV. |
| 2.7 | Markets opened only after the Hive fell, so trading couldn't help you win an isle. | A market opens as soon as its camp person is rescued, even on a grey isle. |
| 2.8 | A rescued follower could be lost if the Keeper fainted. | Followers walk to the rope by themselves. |
| 2.9 | Uprooting a tree destroyed it, which punished trying a new layout. | Uprooting returns the seed. |
| 2.10 | A player who sold or uprooted everything could get stuck with no seeds and no money. | Nana's free-seed rule (design §13), with tests. |
| 2.11 | Crew joining isle landings made civilians into fighters and doubled the AI work. | The crew stay on Bao and hide in Nana's hut during raids. Chime Posts (towers built by Tam and the Keeper) help defend. |
| 2.12 | A raid while the Keeper was down on an isle would wreck the garden unfairly. | Raids happen only during voyages, and the voyage waits until the raid is over. |
| 2.13 | Loading a save made on an isle could drop you mid-fight. | Loading always starts on Bao, hovering at the isle you were on. |
| 2.14 | Mallet III needed ore before you could get any. | Ore rocks are on Reef and Ember, Tam (tiers III–IV) is on Ember, and ore is also sold at the Ember Market, so the order holds. |
| 2.15 | Lava that hurts would need fire rules, armour and warnings for one isle. | The lava is decoration that glows. Ember's danger is the Flyers and the Forgehive. |

## Draft 3: detail and numbers

Draft 3 added:
- dialogue beats for every chapter;
- the gates (Wind Wall, Storm Belt, Deep Mist);
- the complete tree, item, recipe, meal, enemy, Hive and raid tables, with the source and use of every item;
- the stuck-run rules;
- the controls, the look and the budgets.

### Logic check 3: independent review and simulation

This check was done in two independent ways:
1. A reviewer who had not seen the earlier drafts read `STORY.md` and `DESIGN.md` looking for contradictions, dead items, unreachable gates, bad pacing and tone problems.
2. Code: `tests/economy.test.ts` checks that every item has a source and a use, and that every gate can be reached. `tests/progression.test.ts` plays the whole story with a scripted player, using the real rules and the real clock, from the first seed to the Grey Heart. It checks that the run never gets stuck, that every stage gate opens, and that the total play time falls in the target range.

The problems found and their fixes are listed in the next section.

### Logic check 3: findings and fixes

The reviewer read the draft before the rules code existed, so it checked the numbers with its own small simulations. Some of its numbers were already out of date, but every problem it describes was real or would have become real. The scripted players then re-checked the fixes against the real rules.

**Contradictions between the story and the rules**

| # | Problem | Fix |
|---|---|---|
| 3.1 | Five tutorial seeds for four moss patches. | Two Puffberry and two Ropevine seeds. |
| 3.2 | STORY said the Clamhive cannot be hurt while closed; DESIGN said 15%. | Both now say: blows barely scratch it while closed; it gapes open right after each attack. |
| 3.3 | The Forgehive's "lava lines" hurt, although the story says lava is harmless decoration. | They are violet crystal cracks now, made of Gloom. |
| 3.4 | Rescued crew followed the Keeper, which meant escorting civilians into boss arenas. | Freed people walk to the rope (crew) or to the landing (camp) on their own. |
| 3.5 | The Grey Star has no Spires and the Grey Heart holds no Note, yet the story said "every isle". | STORY lists Spires and Hives for Clover, the reef and Ember, and adds a Grey Heart row. |
| 3.6–3.9 | The free-seed promise was too broad; Kai's market had no place; the voyage-cost column was misleading; the load rule was missing. | All reworded or added (DESIGN §2, §13). |

**Story logic**

| # | Problem | Fix |
|---|---|---|
| 3.10 | The crew "hide in the hut", but the Gloom crusts whatever keeps still (rule 2). | The crew bang pots and ring bells in the hut. Nana: "Hide, but never keep still!" |
| 3.11 | Bao holds a Note but never sings on grey isles. | Nana explains that a standing Hive drinks every song near it. In the finale Bao is too loud to drink, but needs a breath between songs, which is why there are 20 s between songs. |
| 3.12 | "Gloom forms leave" would carry the animals inside away with them. | The song shatters every remaining shell. Raiders that give up pop in the sunlight and float off as animals. |
| 3.13 | A cage could stay closed on a freed isle. | The song opens every remaining cage. |
| 3.14 | Smaller gaps. | Animals were crusted because they froze in fright. Leftover Gloom is the dust that still lies in quiet corners. Tam sets up an anvil. The Golden Seed drifts down from Hana's moss. The Keeper's parents wake on Hana's back in the ending. |

**Economy**

| # | Problem | Fix |
|---|---|---|
| 3.15 | Puffberry beat the expensive whale-food trees on every measure. | Growth per tree per minute is now 15 / 20 / 36 (Puffberry / Glowplum / Starfig), and Puffberry sells for 1. |
| 3.16 | Pip harvested while the Keeper was down on an isle, which made the garden an endless tap. | Pip works only while the Keeper is on Bao. While you are away, each tree ripens once and waits. |
| 3.17 | Fishing earned 4–5 times more than fighting, without limit. | A school of 6 bites per place, refilling one every 40 s, and fish prices of 2 / 5 / 10 / 25. |
| 3.18 | Each whale food arrived after the stage it was needed for. | Glowplum seeds are sold at Clover and Starfig seeds on the reef. |
| 3.19 | The Ember Market's Starfig fruit had no price, which risked a buy-and-sell loop. | It costs 45 (it sells for 36). A test now checks that no market sells anything for less than any market buys it. |
| 3.20 | Glimmer and XP piled up after the ending. | Keepsakes at the Workbench: lanterns, a flower crown, a golden bell. |
| 3.21 | Smaller gaps. | 2 ore per rock. Start with 20 glimmer. The Pear Tart heals 90. Prices ×1.5 are rounded. |

**Progression and gating**

| # | Problem | Fix |
|---|---|---|
| 3.22 | Random raids were too big for "small raids". | One wave of 2 + 2 per freed isle, and never on the Deep Song dive. |
| 3.23 | Spires were an endless XP farm. | Gloomlings a Spire or a Hive wakes give nothing: they were only napping. |
| 3.24 | Fibre could be spent before the rope was made. | Coat II and the Good Line unlock after the rope. |
| 3.25 | The scripted casual player could not beat the Forgehive and faint-looped forever. | Each faint in a Hive fight cracks its crust (−10%, at most −30%). Nana says so, and her faint tip mentions upgrades and selling fruit. |

**Pacing**

| # | Problem | Fix |
|---|---|---|
| 3.26 | Growth XP was met long before each Note (first numbers), then, after the fixes above, became a 13–29 minute wall. | The thresholds were calibrated with the gate switched off and set just above Bao's natural growth: **120 / 380 / 760**. Attentive players wait about a minute at most; casual players never wait. |
| 3.27 | Hive fights were too short late on. | Final Hive HP 480 / 1,500 / 3,000 / 5,000, with move damage written down (DESIGN §8). |
| 3.28 | The Keeper levelled too fast. | Recommended levels are met at every isle without hitting the cap before the finale: the scripted players arrive at levels 1 / 6 / 10–11 / 13–14 against recommended 1 / 5 / 9 / 13. |
| 3.29 | The story was shorter than the first target (60–90 min). | The target is now 35–60 min for a real player (scripted: 25 and 49 min). Errands per isle are a future idea. |

**Fun and clarity**

| # | Problem | Fix |
|---|---|---|
| 3.30 | Hunger never mattered. | It is now **Fullness**, the voyage fuel, at 2 per league. The long legs (66 and 70) need planning, and sky dew gives only +1. |
| 3.31 | Mood was always Joyful. | Whale food gives no mood. Mood comes from fish treats, pats (+5 every 60 s), brushing and songs. |
| 3.32 | Specks punished the player while away. | Nana brushes all but 2 while the Keeper is down on an isle. |
| 3.33 | Raids were trivial, or unfair. | Drop spots are marked 1.2 s ahead. Crusting takes 5 s, and a crusted tree loses its ripe fruit. No healing during raids. Spitters aggro from 7 m. |
| 3.34 | Chime Posts did not scale. | Half the Keeper's ring damage, plus a 40% slow. |
| 3.35 | Tam and Ria joined too late to matter. | Ria moved to Lantern Reef. Tam's gear is three tiers (Mallet III ×2.2, Coat III +120). |
| 3.36 | Quick Eat wasted buff meals. | It picks the smallest food that covers the missing health. |

**Tone**

| # | Problem | Fix |
|---|---|---|
| 3.37 | A few words were wrong for all ages. | A retired blacksmith (not a widow), honey buns, Rammer (not Brute), "Nobody is ever killed", "Let it hear us. Maybe it's lonely.", "even when the whole world's gone grey". "…hush, little whale…" is kept for the finale. |

**Results** (`tests/progression.test.ts`, real rules)

| Player | Story length | Faints | Bao's waits for growth (min) | Level at Clover / Reef / Ember / Star |
|---|---|---|---|---|
| Attentive | 24.6 min | 1 | 1.2, 1.2, 0 | 1 / 6 / 11 / 14 |
| Casual (worst case) | 49 min | 6, each followed by an upgrade or a crack | 0.1, 0.1, 0.1 | 1 / 6 / 10 / 13 |
