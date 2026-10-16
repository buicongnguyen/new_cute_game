import { t } from '../i18n.ts';
import {
  HOME
} from '../rules/content.ts';
import { maxHp } from '../rules/keeper.ts';
import { play } from '../sfx.ts';
import { type Ground } from '../world/combat.ts';
import { placementOf } from '../world/cottage.ts';
import { GameSystem } from './system.ts';

/** House behavior extracted without changing the original update order. */
export class HouseSystem extends GameSystem {
  update(dt: number) { this.game.cabin.update(dt, this.game.keeper.pos); }

  // -------------------------------------------------------------- scenes
  /**
   * Down the hatch into Nana's cottage (Zoo Garden's house), which floats in the open sky (the owner's wish: no black
   * void). `bed`: a new captain wakes up in the patchwork bed (chapter 1).
   */
  enterHouse(spawn: 'door' | 'bed' = 'door') {
    if (this.game.raid) { this.game.hud.toast(t('Not now: the Gloom is aboard!'), 'warn'); return; }
    const go = () => {
      this.game.setMode('house');
      this.game.stopFishing();
      this.game.bao.root.visible = false; this.game.skiff.visible = false;
      for (const [, v] of this.game.isles) v.group.visible = false;
      this.game.sky.hole = null;
      this.game.syncCabin();
      this.game.cabin.group.visible = true;
      const g = this.game.cabinGround();
      this.game.keeper.bounds = g; this.game.combat.ground = g;
      if (spawn === 'bed') { const bed = placementOf('bed'); this.game.keeper.place((bed?.x ?? -8) + 1.25, (bed?.z ?? -6.7) + .9); this.game.keeper.actor.facing = Math.PI * .8; }
      else { const at = this.game.cabin.spawn(); this.game.keeper.place(at.x, at.z); }
      this.game.snapCamera(); this.game.applyLook();
      if (spawn === 'door') this.game.scene_('cabin');
    };
    if (spawn === 'bed') { go(); return; }
    this.game.bao.openHatch();
    this.game.cut(go);
  }

  syncCabin() { this.game.cabin.sync(this.game.state.notes, this.game.state.crew, this.game.state.rooms); }

  cabinGround(): Ground { const c = this.game.cabin; return { height: () => 0, clamp: p => c.clamp(p), get blockers() { return c.blockers; } } as Ground; }

  leaveHouse() { this.game.cut(() => this.game.enterDeck(false, 'hatch')); }

  /** A nap in Nana's bed: full health, a saved game, and Bao's lullaby. */
  doRest() {
    if (!this.game.live()) return;
    const s = this.game.state;
    const veil = this.game.uiRoot.querySelector('#veil') as HTMLElement;
    veil.classList.add('on');
    play('hum');
    setTimeout(() => {
      s.hero.hp = maxHp(s);
      this.game.napped = true;
      this.game.save();
      veil.classList.remove('on');
      this.game.hud.toast(s.rooms.bath ? t('You napped while Bao hummed a lullaby. Now a hot bath!') : t('You napped while Bao hummed a lullaby. Fully rested!'), 'good');
    }, 650);
  }

  /** After a nap, a bath makes the Captain Fresh (the repaired bathroom). */
  doBath() {
    const s = this.game.state;
    if (!this.game.napped) { this.game.hud.toast(t('Have a nap in the bed first, then a bath.'), 'info'); return; }
    this.game.napped = false;
    s.hero.freshUntil = s.playSeconds + HOME.fresh.seconds;
    play('splash'); this.game.fx.sparkle(this.game.keeper.pos.clone().setY(1.2), '#bfe8ff', 18);
    this.game.hud.toast(t('Fresh! Your mallet rings harder for 5 minutes.'), 'good');
  }
}
