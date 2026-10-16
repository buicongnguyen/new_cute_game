import { STAGES, LEVEL_XP } from '../src/rules/content.ts';
import { simulate } from '../tests/sim.ts';
const st = STAGES as unknown as { xp: number }[];
const keep = st.map(x => x.xp);
st[1].xp = 0; st[2].xp = 0; st[3].xp = 0;
for (const prof of ['attentive', 'casual'] as const) {
  const r = simulate('cal', 300, prof);
  console.log(prof, 'minutes', r.minutes, r.log.filter(l => /freed|arrive/.test(l)).join(' | '));
}
st.forEach((x, i) => x.xp = keep[i]);
void LEVEL_XP;
