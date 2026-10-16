import type { CrewId } from './rules/content.ts';

/** Story lines (docs/STORY.md, the owner's five chapters). Each scene plays once; `who` picks the name and colour on the speech card. */
export type Speaker = CrewId | 'bao' | 'gloom' | 'keeper' | 'folk';
export interface Line { who: Speaker; text: string }

export const PROLOGUE: string[] = [
  'For as long as anyone remembers, a pod of sky whales sang across the Cloud Sea at night.',
  'Then the Grey Star fell. Its Gloom crusted the lands grey and broke the whales’ song into four Notes.',
  'Hives of crystal swallowed the Notes. The pod sank into the Deep Mist, and the Gloom began to build a fleet.',
  'Grand Hana pushed her only calf up through the clouds. “Fly, little one.”',
  'Two backfolk clung to the calf’s back: old Nana Sumi, and you, her grandchild.',
];

export const SCENES: Record<string, Line[]> = {
  // Chapter 1: "Wake up, Captain".
  wake: [
    { who: 'nana', text: 'Morning, Captain.' },
    { who: 'keeper', text: '…Captain?' },
    { who: 'nana', text: 'Bao chose you, child. A whale calf bonds with one keeper, and its keeper is its captain. This ship is yours now. I’m too old to steer, so I’ll be your first mate.' },
    { who: 'nana', text: 'The old place is dusty, mind: the stove is cold and the other rooms are boarded up. We’ll fix her up, room by room. Now climb the ladder and meet your ship.' },
  ],
  deck_first: [{ who: 'nana', text: 'Here she is: your deck. Planter boxes, the map table at the bow, the workbench, the shipping crate, the rope post and the fishing lift. Go and give Bao a pat at the bow.' }],
  met_bao: [
    { who: 'bao', text: '♪ Mmmmm… ♪' },
    { who: 'nana', text: 'There. Now you’ve met your ship properly.' },
    { who: 'nana', text: 'A ship needs a garden, a kitchen and a full whale before it sails. Let’s get to work, Captain: plant these seeds in the planter boxes.' },
  ],
  intro: [{ who: 'nana', text: 'Morning, Captain. Bao is waiting for you.' }],
  // Chapter 2: "The ship's economy".
  planted: [{ who: 'nana', text: 'Good. They grow while you walk about. Your grandpa used to fish the cloud sea from a little skiff, you know.' }],
  harvested: [{ who: 'nana', text: 'Ripe already! Take the berries to Bao’s head and let it eat.' }],
  fed: [{ who: 'bao', text: '♪ Mmm-mmm! ♪' }, { who: 'nana', text: 'See? A happy whale grows. And every ship needs coin: put something spare in the shipping crate. The sky-post finches carry it off and bring glimmer back.' }],
  shipped: [{ who: 'nana', text: 'Honest little birds, those finches. Markets on the lands pay more for what they like. Now, the kitchen: three Fibre and a little glimmer will fix it up. Ropevine gives Fibre.' }],
  room_kitchen: [{ who: 'nana', text: 'Listen to that stove crackle! Two Cloudpears make a Pear Tart, and a tart keeps you going on the lands.' }],
  cooked: [{ who: 'nana', text: 'Smells like home. Now catch us a fish: step onto the lift at Bao’s side and it lowers you to the skiff.' }],
  skiff_first: [{ who: 'nana', text: 'The sky fish swim deep down here. Cast your line, wait for the bobber to dip, then reel! Pull the rope when you want to come back up.' }],
  fished: [{ who: 'nana', text: 'A fine catch! Fish make Bao happy, and the markets love them. Every place has its own school: give them a little time and they come back.' }],
  room_craft: [{ who: 'tam', text: 'A proper craft room! The tools are cheaper to run in here, and there’s space for the fine work: lines, lanterns, keepsakes.' }],
  room_craft_nana: [{ who: 'nana', text: 'A proper craft room! Making things costs less glimmer in here, and there’s space for the fine work: lines, lanterns, keepsakes.' }],
  room_study: [{ who: 'nana', text: 'Your grandpa’s charts! With these, Bao finds the shorter winds: every voyage costs less fullness.' }],
  room_bath: [{ who: 'nana', text: 'A hot bath! Have a nap, then a soak, and you’ll feel Fresh: your mallet rings harder for a while.' }],
  cabin: [{ who: 'nana', text: 'Welcome home, Captain. Rest in the bed whenever you are tired. The Notes we win back will glow on that shelf.' }],
  speck: [{ who: 'nana', text: 'The Gloom followed us up. Brush that speck off Bao before it itches.' }],
  rope: [{ who: 'nana', text: 'You can’t help anyone from up here. Clover Rise is near: its folk always kept a lantern lit for us. I don’t see it lit. Use the map table on Bao’s head.' }],
  // Chapter 3: "Landing and rescue".
  conch: [{ who: 'nana', text: 'Take my conch, child. Blow it anywhere down there and Bao will lower the rope to you. Only not near a Hive: its hush swallows the sound.' }],
  arrive_clover: [{ who: 'nana', text: 'Oh… the lantern is dark. The whole meadow is grey. Slide down the rope, child. Carefully.' }, { who: 'gloom', text: '…stay still… stay quiet…' }],
  rescue_olla: [{ who: 'olla', text: 'Captain! Bless your bell. I’ll set up shop right here. Everyone needs a market, even when the whole world’s gone grey.' }, { who: 'olla', text: 'Those Spires on the hills feed the dome over the Hive. Break them and the dome will fall.' }],
  rescue_pip: [{ who: 'pip', text: 'A WHALE? A real one? With a GARDEN? I’m coming. I’m a gardener. I’m a very good gardener. I’ll wait for you up there!' }],
  board_pip: [{ who: 'pip', text: 'I’ll keep the trees growing fast and pick the fruit for you. Leave it to me!' }],
  spires_down: [{ who: 'gloom', text: '…no… the hush… the hush is breaking…' }],
  freed_clover: [{ who: 'bao', text: '♪ Aaa-ooooo! ♪' }, { who: 'nana', text: 'One Note. Your mother is somewhere under all that grey, little one. We’ll find the rest.' }],
  can_grow: [{ who: 'nana', text: 'The Note hums inside Bao. When it has eaten enough, it can grow. Tap Grow on Bao’s card!' }],
  grown_1: [{ who: 'nana', text: 'Look at you! A Young whale. Strong enough for the Wind Wall around Lantern Reef.' }],
  raid_first: [{ who: 'nana', text: 'Gloom ships! It heard the song. Battle stations: the garden goes below, the gongs come up. Crew, down the hatch, and keep those pots ringing! Hide, but never keep still!' }, { who: 'nana', text: 'Knock them overboard, Captain! Ring the gongs to blast them to the edge. Keep them off the hatch!' }],
  raid_won: [{ who: 'nana', text: 'It will hear every song. Good. Let it hear us. Maybe it’s lonely.' }],
  raid_lost: [{ who: 'nana', text: 'They crusted some trees below deck. Ring the crust off and they will grow again.' }],
  arrive_reef: [{ who: 'nana', text: 'Lantern Reef. The lanterns used to light the whole sea at night.' }, { who: 'nana', text: 'While a Hive stands, it drinks every song sung near it. Break it, and then Bao can sing.' }],
  rescue_kai: [{ who: 'kai', text: '…Thank you… I’ll stay with my boats. Bring me fish stories. And people food: my neighbours will come out of hiding hungry. I sell bait pots for that skiff of yours, too.' }],
  rescue_ria: [{ who: 'ria', text: 'I saw your whale from my lighthouse for an hour before you came down. You need a lookout. I am a lookout.' }],
  rescue_mina: [{ who: 'mina', text: 'You have a whale and a kitchen and only ONE recipe? Unacceptable. I’m coming aboard.' }],
  board_mina: [{ who: 'mina', text: 'I’ll teach you Fish Buns and Sky Stew, and I’ll leave a meal in your bag every morning. Don’t thank me. Eat.' }],
  freed_reef: [{ who: 'bao', text: '♪ Ooo-aaa-oooo! ♪' }, { who: 'nana', text: 'Two Notes. Bao can grow to Adult now, strong enough for the Storm Belt.' }],
  grown_2: [{ who: 'nana', text: 'An Adult whale! The Storm Belt around Ember Peaks won’t stop us now.' }],
  arrive_ember: [{ who: 'nana', text: 'Ember Peaks. The forges are cold. Watch the sky for Flyers, and those Shellbacks: hit them from behind.' }],
  rescue_coal: [{ who: 'coal', text: 'Took you long enough. I’ll sell you ore and starfigs, and I won’t overcharge. Much.' }],
  rescue_tam: [{ who: 'tam', text: 'A forge on a whale… I could make chime posts that sing. And a much better mallet. I’ll set up an anvil by your Workbench.' }],
  freed_ember: [{ who: 'bao', text: '♪ Ooo-aaa-ooo-AAA! ♪' }, { who: 'nana', text: 'Dawn, Tide, Ember. Three Notes of Hana’s song. Grow, little one: the last one waits beyond the Frost Veil.' }],
  grown_3: [{ who: 'nana', text: 'A Great whale! Nothing in the sky is bigger, except your mother. Take us through the Frost Veil to Frostfall.' }],
  arrive_frost: [{ who: 'nana', text: 'Frostfall. Snow and warm lanterns, once. Now listen… nothing at all. Something here swallows every sound.' }, { who: 'gloom', text: '…hush… hush…' }],
  rescue_bram: [{ who: 'bram', text: 'Ho ho! Frozen stiff and now I’m free! I’ll open the inn’s market again: warm cocoa for the cold, and I pay well for good craft goods.' }, { who: 'bram', text: 'Our Juno is locked in her workshop up by the first Spire. Break that Spire and the door will give.' }],
  rescue_juno: [{ who: 'juno', text: 'Finally! Do you know how long I’ve been fixing the same bolt in the dark? A whale, you say? With a lift? I can make that lift twice as fast.' }],
  board_juno: [{ who: 'juno', text: 'Right. A faster lift, a boarding plank and a cannon that fires bells. Nobody boards a Gloom ship without my plank.' }],
  hush_first: [{ who: 'nana', text: 'That bell eats every sound! Inside its silence your mallet does nothing. Ring the three echo bells around it to crack the silence, then strike!' }],
  freed_frost: [{ who: 'bao', text: '♪ Ooo-aaa-ooo-AAA-ooo! ♪' }, { who: 'nana', text: 'All four Notes. That’s the Deep Song, the one Hana sang every night.' }],
  // Chapter 4 runs alongside: friends at work. Chapter 5: "Taking the fight to the Gloom".
  fleet: [
    { who: 'ria', text: 'Ships, Captain! Three of them rising out of the Deep Mist: sky beasts, crusted grey, with decks on their backs like Bao! And the biggest one… it carries the Grey Star.' },
    { who: 'juno', text: 'Plank’s ready, cannon’s loaded. Their holds are full of our people. Let’s go and get them back.' },
    { who: 'nana', text: 'Then we take the fight to the Gloom. Pick two of the crew to board with you, Captain.' },
  ],
  arrive_sloop: [{ who: 'ria', text: 'The Scout Sloop! Its captain is a crab in a crystal hat. Mind that anchor!' }],
  board_first: [{ who: 'nana', text: 'Knock its raiders overboard through the gaps in the rails, free the families in the hold, then deal with its captain. Your crew mates fight beside you.' }],
  barnacle_first: [{ who: 'juno', text: 'When that anchor sticks in the deck, the crab is stuck too: hit it then! And hop over the chain when it sweeps.' }],
  family: [{ who: 'folk', text: 'Thank you, Captain! We were so cold down there. Take this, please, and we’ll ride home on your whale!' }],
  freed_sloop: [{ who: 'bao', text: '♪ Aaa-oooo! ♪' }, { who: 'nana', text: 'Its crust shattered, and the poor beast is free! Look at its colours. The Warship is next.' }],
  arrive_warship: [{ who: 'ria', text: 'The Warship! That poor beast carries a crystal serpent, coiled up in the middle of its deck.' }],
  wyrm_first: [{ who: 'tam', text: 'See those glowing knots on its coils? Ring all three and it’ll flop down dizzy. Then hit its head!' }],
  freed_warship: [{ who: 'bao', text: '♪ Ooo-aaa! ♪' }, { who: 'nana', text: 'Two beasts free. Only the Grey Star is left, and the pod is sleeping under it.' }],
  arrive_star: [{ who: 'nana', text: 'There… the pod. Sleeping under the crystal, and the Grey Star riding above them on the biggest beast of all.' }, { who: 'gloom', text: '…hush, little whale… stay still… forever…' }, { who: 'nana', text: 'With the whole song, Bao is too loud for it to drink. But a whale needs a breath between songs. Strike when Bao sings! And mind your feet: that deck is listing.' }],
  heart_song: [{ who: 'bao', text: '♪ Aaaa-ooo! ♪' }],
  ending: [
    { who: 'bao', text: '♪ Mama? ♪' },
    { who: 'nana', text: 'Look, child! On Hana’s back, in the moss… your mum and dad are waking up. They’re waving!' },
    { who: 'nana', text: 'Whales carry gardens. Gardens feed whales. And, it turns out, whales carry each other.' },
  ],
  faint: [{ who: 'nana', text: 'Up you come! Bao pulled you back. Rest, eat something, and try again. A better mallet or coat from the Workbench helps; sell spare goods if you are short of glimmer.' }],
  faint_hive: [{ who: 'nana', text: 'Bao hummed at that foe while you climbed up. Its crust is cracked now: it will be a little weaker next time.' }],
  nana_gift: [{ who: 'nana', text: 'Out of seeds? Here, I always keep one in my pocket.' }],
  conch_hush: [{ who: 'nana', text: 'I can’t hear the conch, child! The hush near that foe swallows it. Step away first.' }],
};

/** What crew say when you talk to them (a few each, in turn). */
export const CHATTER: Record<CrewId, string[]> = {
  nana: ['Pat Bao, brush its specks and treat it to sky fish: a happy whale makes the trees grow faster.', 'Every room we fix up gives the ship another job. The kitchen first, then the rest.', 'Whales carry gardens. Gardens feed whales.'],
  pip: ['I’ve got the trees! You go ring some crystals.', 'Glowplums make Bao grow so fast. If only we had seeds…', 'On a boarding I push them to the rails. Leave the shoving to me!'],
  mina: ['Fish Buns make you hit harder. Sky Stew makes you tougher.', 'A Pear Tart a day keeps the Gloom away. Probably.', 'Take me boarding and I’ll keep you fed in the fight.'],
  tam: ['Chime posts ring by themselves when the Gloom comes aboard, and slow the raiders down.', 'Ore and chimewood: that’s what a good mallet wants.', 'On their decks I ring hard. Very hard.'],
  ria: ['I’ll shout before any Gloom ship gets close.', 'Treasure cloud off the side! Tap it when you see it.', 'Gloom ships board over planks. Meet them at the edge and push!'],
  juno: ['The lift’s twice as fast now. You’re welcome.', 'The cannon fires bells, not balls. The Gloom hates a good chime.', 'Without my plank, nobody boards anything.'],
  olla: ['Fish! Clover folk love fish.'], kai: ['People food for the reef folk, please. And try a bait pot: the fish bite sooner.'], coal: ['Whale food sells well here. Don’t ask why.'],
  bram: ['Cocoa warms you better than any coat.', 'Craft goods sell well up here: we build with everything.'],
};
