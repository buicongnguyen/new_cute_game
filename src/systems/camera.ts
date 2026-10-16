import * as T from 'three';
import { verticalFovForAspect } from '../core/camera.ts';
import { damp } from '../core/feel.ts';
import {
  BELOW
} from '../rules/content.ts';
import { CABIN_LOOK, LOOKS, mixLook, type Look } from '../world/look.ts';
import { CAMERA } from './shared.ts';
import { GameSystem } from './system.ts';

/** Camera behavior extracted without changing the original update order. */
export class CameraSystem extends GameSystem {
  update(realDt: number) {     // Camera: follow the Captain (low and close in the skiff, so Bao's belly shows overhead).
    const aspect = this.game.canvas.clientWidth / Math.max(1, this.game.canvas.clientHeight);
    const skiff = this.game.mode === 'skiff' || this.game.mode === 'ride';
    const base = this.game.mode === 'drone' ? CAMERA.deck * 1.1 : skiff ? CAMERA.skiff : this.game.mode === 'isle' ? (this.game.isle?.kind === 'ship' ? CAMERA.ship : CAMERA.isle) : this.game.mode === 'house' ? CAMERA.house : CAMERA.deck * (1 + .38 * Math.max(0, this.game.bao.half()[1] / 8 - 1));
    const dist = base * this.game.zoom * (aspect < .8 ? CAMERA.portrait : 1);
    const k = this.game.keeper.pos;
    this.game.focus.x = damp(this.game.focus.x, k.x, 7, realDt); this.game.focus.z = damp(this.game.focus.z, k.z, 7, realDt); this.game.focus.y = damp(this.game.focus.y, k.y, this.game.mode === 'ride' ? 12 : 4, realDt);
    const cin = this.game.cinematic;
    if (cin) {
      const a = this.game.loop.realTime * cin.spin, pr = cin.pitch * Math.PI / 180;
      this.game.camera.position.set(Math.sin(a) * Math.cos(pr) * cin.dist, Math.sin(pr) * cin.dist - 2, Math.cos(a) * Math.cos(pr) * cin.dist);
      this.game.camera.lookAt(0, -3, 0);
    } else {
      const pr = (skiff ? CAMERA.skiffPitch : CAMERA.pitch) * Math.PI / 180, lift = skiff ? 1.6 : .6;
      if (skiff) {
        // Low and outboard, looking up past the skiff at Bao's belly and the lift rope that holds the boat to the ship.
        this.game.camera.position.set(this.game.focus.x + dist * .55, this.game.focus.y + Math.sin(pr) * dist + lift, this.game.focus.z + dist * .8);
        this.game.camera.lookAt(this.game.focus.x - 2.5, this.game.focus.y + 4.2, this.game.focus.z);
      } else {
        this.game.camera.position.set(this.game.focus.x, this.game.focus.y + Math.sin(pr) * dist + lift, this.game.focus.z + Math.cos(pr) * dist);
        this.game.camera.lookAt(this.game.focus.x, this.game.focus.y + lift, this.game.focus.z);
      }
    }
    const sh = this.game.fx.trauma.offset(this.game.loop.realTime);
    this.game.camera.rotateY(sh.yaw * Math.PI / 180); this.game.camera.rotateX(sh.pitch * Math.PI / 180); this.game.camera.rotateZ(sh.roll * Math.PI / 180);
    this.game.lighting.follow(this.game.focus.x, this.game.focus.y, this.game.focus.z);
  }

  /** Camera distance factor: closer 0.75, farther up to 1.6 (wheel, pinch). */
  setZoom(z: number) { this.game.zoom = Math.min(1.6, Math.max(.75, z)); }

  applyLook() {
    const s = this.game.state;
    let look: Look;
    if (this.game.frozenLook) look = this.game.frozenLook;
    else if (this.game.mode === 'house') look = CABIN_LOOK;
    else if (s.voyage) { const a = LOOKS[s.voyage.from], b = LOOKS[s.voyage.to], k = Math.min(1, s.voyage.elapsed / s.voyage.duration); look = mixLook(mixLook(a, LOOKS.voyage, Math.min(1, k * 3)), b, Math.max(0, (k - .55) / .45)); }
    else look = LOOKS[s.place];
    if (look === this.game.lastLook) return;
    this.game.lastLook = look;
    // Halfway through a voyage the ground below turns into the destination's.
    this.game.sky.setBelow(this.game.mode === 'house' ? 'clouds' : s.voyage ? BELOW[s.voyage.elapsed / s.voyage.duration > .5 ? s.voyage.to : s.voyage.from] : BELOW[s.place]);
    this.game.lighting.apply(look); this.game.sky.apply(look);
    this.game.renderer.setClearColor(look.fog);
    const sea = this.game.skiff.getObjectByName('cloud-sea') as T.Mesh | undefined;
    if (sea) (sea.material as T.MeshLambertMaterial).color.set(look.cloud);
  }

  snapCamera() { const k = this.game.keeper.pos; this.game.focus.copy(k); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.game.renderer.setPixelRatio(this.game.governor.ratio);
    this.game.renderer.setSize(w, h, false);
    this.game.canvas.style.width = `${w}px`; this.game.canvas.style.height = `${h}px`;
    this.game.camera.aspect = w / h;
    this.game.camera.fov = w / h < .8 ? CAMERA.portraitFov : verticalFovForAspect(CAMERA.fov, w / h, 16 / 10);
    this.game.camera.updateProjectionMatrix();
  }
}
