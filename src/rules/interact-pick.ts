// Ported from cute_game/src/interact-pick.ts; Cloudback uses doors, plots and crew instead of pond priorities.
export interface PickTarget { id: string; pos: { x: number; z: number }; radius: number }
/** Distance wins broadly; facing resolves nearby overlaps, with a small doorway preference. */
export function interactScore(target: PickTarget, x: number, z: number, facing: number): number {
  const dx = target.pos.x - x, dz = target.pos.z - z, distance = Math.hypot(dx, dz);
  if (!(target.radius > 0) || distance >= target.radius) return Infinity;
  const toward = distance > .0001 ? (Math.sin(facing) * dx + Math.cos(facing) * dz) / distance : 1;
  const doorway = target.id === 'hatch' || target.id === 'ladder';
  return distance + .8 * (1 - toward) + (target.id.startsWith('crew-') ? .7 : 0)
    - (doorway && toward > .6 ? .8 : 0);
}
export function pickInteractable<T extends PickTarget>(targets: readonly T[], x: number, z: number, facing: number): T | null {
  let best: T | null = null, score = Infinity;
  for (const target of targets) {
    const candidate = interactScore(target, x, z, facing);
    if (candidate < score) { best = target; score = candidate; }
  }
  return best;
}
