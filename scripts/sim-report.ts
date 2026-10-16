import { simulate } from '../tests/sim.ts';
for (const seed of (process.argv[2] ?? 'a,b,c').split(',')) {
  const r = simulate(seed, 300, (process.argv[4] ?? 'attentive') as never);
  console.log(`== seed ${seed}: ended=${r.ended} minutes=${r.minutes} faints=${r.faints} raids=${r.raids} nanaGifts=${r.nanaGifts} growWaits=${JSON.stringify(r.growWaits)}`);
  console.log('arrivals', JSON.stringify(r.arrivals));
  console.log('freed', JSON.stringify(r.freedAt));
  if (process.argv[3] === 'log') console.log(r.log.join('\n'));
}
