import type { CrewId } from './rules/content.ts';

/** Story lines (docs/STORY.md). Each scene plays once; `who` picks the name and colour on the speech card. */
export type Speaker = CrewId | 'bao' | 'gloom' | 'keeper';
export interface Line { who: Speaker; text: string }

export const PROLOGUE: string[] = [
  'For as long as anyone remembers, a pod of sky whales sang across the Cloud Sea at night.',
  'Then the Grey Star fell. Its Gloom crusted the isles grey, and it stole the whales’ song.',
  'The song broke into Notes, and Hives of crystal swallowed them. The pod sank into the Deep Mist.',
  'Grand Hana pushed her only calf up through the clouds. “Fly, little one.”',
  'Two backfolk clung to the calf’s back: old Nana Sumi, and you, her grandchild.',
];

export const SCENES: Record<string, Line[]> = {
  intro: [
    { who: 'nana', text: 'Well. We’re alive. And this one is hungry.' },
    { who: 'bao', text: '♪ Mmmmm… ♪' },
    { who: 'nana', text: 'Whales carry gardens, child. Gardens feed whales. Plant these seeds in the glowing moss.' },
  ],
  planted: [{ who: 'nana', text: 'Good. They grow while you walk about. Your grandpa caught sky fish off the tail, you know.' }],
  harvested: [{ who: 'nana', text: 'Ripe already! Take the berries to Bao’s head and let it eat.' }],
  fed: [{ who: 'bao', text: '♪ Mmm-mmm! ♪' }, { who: 'nana', text: 'See? A happy whale grows. Now: Ropevine gives fibre. Twist a Climbing Rope at the Workbench.' }],
  cabin: [{ who: 'nana', text: 'Welcome home, child. Rest in the bed whenever you are tired. The Notes we win back will glow on that shelf.' }],
  speck: [{ who: 'nana', text: 'The Gloom followed us up. Brush that speck off Bao before it itches.' }],
  rope: [{ who: 'nana', text: 'You can’t help anyone from up here. Clover Rise is near: its folk always kept a lantern lit for us. Use the map table on Bao’s head.' }],
  arrive_clover: [{ who: 'nana', text: 'Oh… the lantern is dark. The whole meadow is grey. Slide down the rope, child. Carefully.' }, { who: 'gloom', text: '…stay still… stay quiet…' }],
  rescue_olla: [{ who: 'olla', text: 'Keeper! Bless your bell. I’ll set up shop right here. Everyone needs a market, even when the whole world’s gone grey.' }, { who: 'olla', text: 'Those Spires on the hills feed the dome over the Hive. Break them and the dome will fall.' }],
  rescue_pip: [{ who: 'pip', text: 'A WHALE? A real one? With MOSS? I’m coming. I’m a gardener. I’m a very good gardener. I’ll wait for you up there!' }],
  board_pip: [{ who: 'pip', text: 'I’ll keep the trees growing fast and pick the fruit for you. Leave it to me!' }],
  spires_down: [{ who: 'gloom', text: '…no… the hush… the hush is breaking…' }],
  freed_clover: [{ who: 'bao', text: '♪ Aaa-ooooo! ♪' }, { who: 'nana', text: 'One Note. Your mother is somewhere under all that grey, little one. We’ll find the rest.' }],
  can_grow: [{ who: 'nana', text: 'The Note hums inside Bao. When it has eaten enough, it can grow. Tap Grow on Bao’s card!' }],
  grown_1: [{ who: 'nana', text: 'Look at you! A Young whale. Strong enough for the Wind Wall around Lantern Reef.' }],
  raid_first: [{ who: 'nana', text: 'Gloom ships! It heard the song. Battle stations: the garden goes below, the gongs come up. Crew, down the hatch, and keep those pots ringing! Hide, but never keep still!' }, { who: 'nana', text: 'Knock them overboard, child! Ring the gongs to blast them to the edge. Keep them off the hatch!' }],
  raid_won: [{ who: 'nana', text: 'It will hear every song. Good. Let it hear us. Maybe it’s lonely.' }],
  raid_lost: [{ who: 'nana', text: 'They crusted some trees below deck. Ring the crust off and they will grow again.' }],
  arrive_reef: [{ who: 'nana', text: 'Lantern Reef. The lanterns used to light the whole sea at night.' }, { who: 'nana', text: 'While a Hive stands, it drinks every song sung near it. Break it, and then Bao can sing.' }],
  rescue_kai: [{ who: 'kai', text: '…Thank you… I’ll stay with my boats. Bring me fish stories. And people food: my neighbours will come out of hiding hungry.' }],
  rescue_ria: [{ who: 'ria', text: 'I saw your whale from my lighthouse for an hour before you came down. You need a lookout. I am a lookout.' }],
  rescue_mina: [{ who: 'mina', text: 'You have a whale and no kitchen? Unacceptable. I’m coming aboard.' }],
  board_mina: [{ who: 'mina', text: 'Bring me pears, buns and fish, and I’ll make meals that keep you going down there.' }],
  freed_reef: [{ who: 'bao', text: '♪ Ooo-aaa-oooo! ♪' }, { who: 'nana', text: 'Two Notes. Bao can grow to Adult now, strong enough for the Storm Belt.' }],
  grown_2: [{ who: 'nana', text: 'An Adult whale! The Storm Belt around Ember Peaks won’t stop us now.' }],
  arrive_ember: [{ who: 'nana', text: 'Ember Peaks. The forges are cold. Watch the sky for Flyers.' }],
  rescue_coal: [{ who: 'coal', text: 'Took you long enough. I’ll sell you ore and starfigs, and I won’t overcharge. Much.' }],
  rescue_tam: [{ who: 'tam', text: 'A forge on a whale… I could make chime posts that sing. And a much better mallet. I’ll set up an anvil by your Workbench.' }],
  freed_ember: [{ who: 'bao', text: '♪ Ooo-aaa-ooo-AAA! ♪' }, { who: 'nana', text: 'Dawn, Tide, Ember. That’s the song Hana sang every night. Grow, little one, and we can dive.' }],
  grown_3: [{ who: 'nana', text: 'A Great whale, and the whole Deep Song. Take us down to the Grey Star.' }],
  arrive_star: [{ who: 'nana', text: 'There… the pod. Sleeping under the crystal. Hana is in the middle.' }, { who: 'gloom', text: '…hush, little whale… stay still… forever…' }, { who: 'nana', text: 'With the whole song, Bao is too loud for it to drink. But a whale needs a breath between songs. Strike when Bao sings!' }],
  heart_song: [{ who: 'bao', text: '♪ Aaaa-ooo! ♪' }],
  ending: [
    { who: 'bao', text: '♪ Mama? ♪' },
    { who: 'nana', text: 'Look, child! On Hana’s back, in the moss… your mum and dad are waking up. They’re waving!' },
    { who: 'nana', text: 'Whales carry gardens. Gardens feed whales. And, it turns out, whales carry each other.' },
  ],
  faint: [{ who: 'nana', text: 'Up you come! Bao pulled you back. Rest, eat something, and try again. A better mallet or coat from the Workbench helps; sell spare fruit at a market if you are short of glimmer.' }],
  faint_hive: [{ who: 'nana', text: 'Bao hummed at that Hive while you climbed up. Its crust is cracked now: it will be a little weaker next time.' }],
  nana_gift: [{ who: 'nana', text: 'Out of seeds? Here, I always keep one in my pocket.' }],
};

/** What crew say when you talk to them on the deck (a few each, in turn). */
export const CHATTER: Record<CrewId, string[]> = {
  nana: ['Pat Bao, brush its specks and treat it to sky fish: a happy whale makes the trees grow faster.', 'Brush the Gloom specks off. They make Bao grumpy.', 'Whales carry gardens. Gardens feed whales.'],
  pip: ['I’ve got the trees! You go ring some crystals.', 'Glowplums make Bao grow so fast. If only we had seeds…', 'Starfigs! Starfigs are the best whale food in the sky.'],
  mina: ['Fish Buns make you hit harder. Sky Stew makes you tougher.', 'A Pear Tart a day keeps the Gloom away. Probably.', 'My honey buns are the best in the sky. Ask anyone.'],
  tam: ['Chime posts ring by themselves when the Gloom comes aboard, and slow the raiders down.', 'Ore and chimewood: that’s what a good mallet wants.'],
  ria: ['I’ll shout before any Gloom ship gets close.', 'Treasure cloud off the side! Tap it when you see it.', 'Gloom ships board over planks. Meet them at the edge and push!'],
  olla: ['Fish! Clover folk love fish.'], kai: ['People food for the reef folk, please.'], coal: ['Whale food sells well here. Don’t ask why.'],
};
