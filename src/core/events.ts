import type { GameState } from '../rules/state.ts';
import type { FishId, ItemId, PlaceId, TreeId } from '../rules/content.ts';

export interface GameEvents {
  harvested: { plot: number; item: ItemId; count: number };
  planted: { plot: number; tree: TreeId };
  sold: { item: ItemId; count: number; glimmer: number; via: 'crate' | 'market' };
  built: { kind: 'recipe' | 'room' | 'upgrade'; id: string };
  cooked: { meal: ItemId; count: number };
  caught: { fish: FishId; place: PlaceId };
  freed: { kind: 'form' | 'crew' | 'family'; id: string; place: PlaceId };
  bossFreed: { place: PlaceId; boss: string };
  landed: { from: PlaceId; to: PlaceId };
  departed: { from: PlaceId; to: PlaceId };
  chapter: { chapter: number };
  goal: { text: string; target: string | null; index?: number };
  raidWon: { waves: number };
  islet: { id: string };
  pet: { id: string; action: 'petted' | 'befriended' };
}

/** Synchronous, ordered delivery; subscriptions added during an emission wait until the next one. */
export class EventBus<Events extends object = GameEvents> {
  private listeners = new Map<keyof Events, Set<(payload: any) => void>>();
  on<K extends keyof Events>(name: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, set = new Set());
    set.add(fn);
    return () => { set.delete(fn); if (!set.size && this.listeners.get(name) === set) this.listeners.delete(name); };
  }
  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    const set = this.listeners.get(name);
    for (const listener of [...set ?? []]) if (set?.has(listener)) listener(payload);
  }
}

// Never serialized, never shared between games or simulations. Rules emit only for observed states.
const buses = new WeakMap<GameState, EventBus>();
export function eventsFor(state: GameState): EventBus {
  let bus = buses.get(state);
  if (!bus) buses.set(state, bus = new EventBus());
  return bus;
}
export function emitState<K extends keyof GameEvents>(state: GameState, name: K, payload: GameEvents[K]) {
  buses.get(state)?.emit(name, payload);
}
