import * as T from 'three';
import {
  DECK,
  ISLE_MAPS,
  isShip,
  type IsleId, type ItemId,
  type RoomId
} from '../rules/content.ts';
import { oreReady, wildReady } from '../rules/isle.ts';
import { count } from '../rules/state.ts';
import { type PanelKind } from '../ui/panels.ts';
import { flat } from '../world/combat.ts';
import { ROOM_DOORS, placementOf } from '../world/cottage.ts';
import { HOUSE } from '../world/house-plan.ts';
import { Interactable } from './shared.ts';
import { GameSystem } from './system.ts';

/** Interact behavior extracted without changing the original update order. */
export class InteractSystem extends GameSystem {
  update(dt: number) {
    const g = this.game;
    g.interactT += dt;
    if (g.interactT > .1 && (g.mode === 'deck' || g.mode === 'isle' || g.mode === 'house' || g.mode === 'skiff')) {
      g.interactT = 0; this.buildInteractables();
    }
  }

  // -------------------------------------------------------- interactables
  buildInteractables() {
    const s = this.game.state, list: Interactable[] = [];
    const add = (id: string, pos: T.Vector3, radius: number, label: string, icon: string, act: () => void) => list.push({ id, pos, radius, label, icon, act });
    if (this.game.mode === 'deck' && this.game.raid) {
      // Battle stations: only the gongs are on deck.
      DECK.gongs.forEach((g, i) => add(`gong${i}`, this.game.bao.at(g), 1.8, 'Ring the gong', '🔔', () => this.game.ringGong(i)));
    } else if (this.game.mode === 'deck') {
      const at = (p: readonly [number, number]) => this.game.bao.at(p);
      s.plots.forEach((p, i) => {
        const pos = at(DECK.plots[i]);
        if (p.crust > 0) add(`plot${i}`, pos, 1.3, 'Ring the crust', '🔔', () => { this.game.keeper.actor.lookAt(pos.x, pos.z); this.game.keeper.ring(false); });
        else if (!p.tree) add(`plot${i}`, pos, 1.2, 'Plant', '🌱', () => this.game.openPanel('plot', i));
        else if (p.phase === 'ripe' && p.tree !== 'golden') add(`plot${i}`, pos, 1.2, 'Harvest', '🧺', () => this.game.doHarvest(i));
        else add(`plot${i}`, pos, 1.1, 'Look', '👀', () => this.game.openPanel('plot', i));
      });
      for (let i = 0;i < s.whale.specks;i++) { const sp = this.game.bao.specks[i]; add(`speck${i}`, sp.position.clone(), 1.2, 'Brush', '🧹', () => this.game.doBrush(i)); }
      const whaleFood = (['starfig', 'glowplum', 'puffberry'] as ItemId[]).some(id => count(s, id) > 0);
      if (!s.story.flags.petted || !whaleFood) add('feed', at(DECK.feed), 1.6, 'Pat Bao', '🤚', () => this.game.doPet());
      else add('feed', at(DECK.feed), 1.6, 'Feed Bao', '🍓', () => this.game.doFeedAll());
      add('map', at(DECK.maptable), 1.6, 'Sky map', '🗺️', () => this.game.openPanel('map'));
      add('workbench', at(DECK.workbench), 1.6, 'Workbench', '🔨', () => this.game.openPanel('workbench'));
      add('crate', at(DECK.crate), 1.5, 'Shipping crate', '📦', () => this.game.openPanel('crate'));
      add('pantry', at(DECK.pantry), 1.4, 'Bag', '🎒', () => this.game.openPanel('bag'));
      add('hatch', at(DECK.hatch), 1.6, 'Go inside', '🚪', () => this.game.enterHouse());
      if (isShip(s.place) && !s.voyage) add('plank', at(this.game.bao.plankCalf()), 1.7, 'Board the ship', '⚔️', () => this.game.board());
      else add('rope', at(DECK.ropepost), 1.5, s.place === 'dawnreach' || s.voyage ? 'Rope' : 'Go down', '🪢', () => this.game.descend());
      add('lift', at(this.game.bao.liftCalf()), 1.6, 'Go fishing', '🎣', () => this.game.goFishing());
      if (s.gear.drone > 0) add('drone', at(DECK.dronePad), 1.6, 'Fly the scooter', '🛸', () => this.game.startDrone());
      for (const [id, a] of this.game.bao.crew) if (s.crew.includes(id) && a.root.visible) add(`crew-${id}`, a.root.position, 1.4, 'Talk', '💬', () => this.game.talk(id));
      for (const d of this.game.dews) if (d.alive) add('dew', d.o.position, 0, 'Catch', '✨', () => this.game.catchDew(d));
    } else if (this.game.mode === 'skiff') {
      // Casting is the context button; pulling the rope has its own button (HUD).
      if (this.game.fishing.state === 'off') add('cast', this.game.keeper.pos.clone(), 9, 'Cast', '🎣', () => this.game.startFishing());
    } else if (this.game.mode === 'house') {
      // The owner's cottage furniture, each with a Cloudback job.
      const at = (kit: string) => { const p = placementOf(kit); return p ? new T.Vector3(p.x, 0, p.z) : null; };
      const use = (id: string, kit: string, radius: number, label: string, icon: string, act: () => void) => { const p = at(kit); if (p) add(id, p, radius, label, icon, act); };
      add('ladder', new T.Vector3(0, 0, HOUSE.bounds.z1 - .7), 1.6, 'Climb up', '🪜', () => this.game.leaveHouse());
      use('bed', 'bed', 2.0, 'Rest', '🛏️', () => this.game.doRest());
      use('shelf', 'trophy_shelf', 1.8, 'The Notes', '🎵', () => this.game.openPanel('bao'));
      use('wardrobe', 'wardrobe', 1.7, 'Bag', '🎒', () => this.game.openPanel('bag'));
      if (s.rooms.kitchen) use('stove', 'stove', 1.6, 'Cook', '🍳', () => this.game.openPanel('kitchen'));
      if (s.rooms.craft) use('bench', 'workbench', 1.9, 'Workbench', '🔨', () => this.game.openPanel('workbench'));
      if (s.rooms.study) { use('globe', 'globe', 1.5, 'Sky map', '🗺️', () => this.game.openPanel('map')); use('desk', 'desk', 1.6, 'Journal', '📖', () => this.game.openPanel('journal')); }
      if (s.rooms.bath) use('bath', 'bathtub', 1.8, 'Take a bath', '🛁', () => this.game.doBath());
      for (const room of Object.keys(ROOM_DOORS) as RoomId[]) if (!s.rooms[room]) { const o = ROOM_DOORS[room].outside; add(`repair-${room}`, new T.Vector3(o.x, 0, o.z), 1.6, 'Repair', '🛠️', () => this.game.openPanel('repair', room)); }
      for (const [id, a] of this.game.cabin.crew) if (a.root.visible) add(`crew-${id}`, a.root.position, 1.4, 'Talk', '💬', () => this.game.talk(id));
    } else if (this.game.mode === 'isle' && this.game.isle) {
      const id = s.place as IsleId, map = ISLE_MAPS[id], v = this.game.isle;
      if (v.kind === 'ship') add('rope', new T.Vector3(map.landing[0] - .3, 0, map.landing[1]), 1.7, 'To Bao', '🐋', () => this.game.ascend());
      else {
        const rope = new T.Vector3(map.landing[0] + 1.2, v.height(map.landing[0], map.landing[1]), map.landing[1] - .6);
        add('rope', rope, 1.6, 'Climb up', '🪢', () => this.game.ascend());
      }
      for (const c of this.game.combat.cages) if (!c.open) add(`cage${c.captive ? 'f' : ''}${c.index}`, c.pos, 1.9, c.locked ? 'Locked' : 'Ring the cage', '🔔', () => { this.game.keeper.actor.lookAt(c.pos.x, c.pos.z); this.game.keeper.ring(false); });
      if (v.kind === 'land') {
        map.ore.forEach((o, i) => { if (oreReady(s, id, i)) add(`ore${i}`, v.ore[i].position, 1.8, 'Mine ore', '⛏️', () => this.game.doMine(i)); });
        map.wild.forEach((w, i) => { if (wildReady(s, id, i)) add(`wild${i}`, v.wild[i].position, 1.6, 'Pick', '🧺', () => this.game.doWild(i)); });
        if (map.market && v.market?.visible) add('market', v.market.position, 2.2, 'Trade', '🛍️', () => this.game.openPanel('market', id));
      }
    }
    this.game.interactables = list;
    // The context button shows the nearest thing in reach.
    let best: Interactable | null = null, bd = Infinity;
    // Talking to the crew loses ties to objects (people wander next to the hatch and the plots).
    for (const it of list) { if (!it.radius) continue; const d = flat(this.game.keeper.pos, it.pos), score = d + (it.id.startsWith('crew-') ? .7 : 0); if (d < it.radius && score < bd) { bd = score; best = it; } }
    this.game.nearby = best;
  }

  /** True while play is running (no panel, no speech, no scene change): HUD buttons act only then (code review 10). */
  live() { return !(this.game.panels.open || this.game.hud.talking || this.game.mode === 'cut' || this.game.mode === 'ride' || this.game.frozen); }

  /** Use the nearest thing, measured now (not at the last frame), so a press right after a move hits what is in reach. */
  useNearby() { if (this.game.mode === 'deck' || this.game.mode === 'isle' || this.game.mode === 'house' || this.game.mode === 'skiff') this.game.buildInteractables(); const n = this.game.nearby; if (n && !this.game.paused) n.act(); }

  // ----------------------------------------------------------------- pointer
  bindPointer() {
    let down: { x: number; y: number; id: number; t: number } | null = null;
    this.game.canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() }; });
    this.game.canvas.addEventListener('pointerup', e => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 12 || this.game.paused || this.game.mode === 'cut' || this.game.mode === 'ride') return;
      this.game.tap(e.clientX, e.clientY);
    });
    this.game.canvas.addEventListener('wheel', e => { e.preventDefault(); this.game.setZoom(this.game.zoom * (1 + Math.sign(e.deltaY) * .08)); }, { passive: false });
    // Two fingers on the canvas pinch the camera in and out (phones had no zoom before).
    const touches = new Map<number, { x: number; y: number }>();
    let pinch0 = 0, zoom0 = 1;
    const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    this.game.canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) { pinch0 = spread(); zoom0 = this.game.zoom; down = null; } });
    this.game.canvas.addEventListener('pointermove', e => { if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2 && pinch0 > 10) this.game.setZoom(zoom0 * pinch0 / Math.max(10, spread())); });
    for (const ev of ['pointerup', 'pointercancel'] as const) this.game.canvas.addEventListener(ev, e => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; });
  }

  /** A tap picks the nearest thing on screen (in pixels, so small things stay easy to hit), else walks there. */
  tap(cx: number, cy: number) {
    const rect = this.game.canvas.getBoundingClientRect(), v = new T.Vector3();
    const pickR = 48 * Math.min(1.4, Math.max(.8, rect.height / 800));
    let best: { d: number; act: () => void } | null = null;
    const consider = (pos: T.Vector3, lift: number, act: () => void) => {
      v.copy(pos); v.y += lift; v.project(this.game.camera);
      if (v.z > 1) return;
      const x = rect.left + (v.x * .5 + .5) * rect.width, y = rect.top + (-v.y * .5 + .5) * rect.height, d = Math.hypot(x - cx, y - cy);
      if (d < pickR && (!best || d < best.d)) best = { d, act };
    };
    for (const it of this.game.interactables) {
      // In the skiff the two buttons are the whole job; a tap there is a cast or a reel, never a walk.
      if (this.game.mode === 'skiff') continue;
      consider(it.pos, it.id === 'dew' ? 0 : .6, () => {
        if (it.id === 'dew') { it.act(); return; }
        if (flat(this.game.keeper.pos, it.pos) <= it.radius) it.act();
        else this.game.keeper.walkTo(it.pos.x, it.pos.z, () => it.act(), Math.max(.6, it.radius - .5));
      });
    }
    for (const f of this.game.combat.forms) if (!f.dead) consider(f.pos, .6, () => this.game.keeper.walkTo(f.pos.x, f.pos.z, null, 1.6));
    if (best) { (best as { act: () => void }).act(); return; }
    if (this.game.mode === 'skiff') { if (this.game.fishing.state === 'off') this.game.startFishing(); return; }
    // Walk to the ground point under the tap.
    const ndc = new T.Vector2((cx - rect.left) / rect.width * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    const ray = new T.Raycaster(); ray.setFromCamera(ndc, this.game.camera);
    const plane = new T.Plane(new T.Vector3(0, 1, 0), -this.game.keeper.pos.y), hit = new T.Vector3();
    if (ray.ray.intersectPlane(plane, hit)) { this.game.keeper.walkTo(hit.x, hit.z); this.game.fx.ring(hit, '#ffffff', .2, .7, .3, .6); }
  }

  openPanel(kind: PanelKind, arg: unknown = null) {
    this.game.keys.blocked = true;
    this.game.hud.releaseStick();
    this.game.panels.show(kind, arg);
  }
}
