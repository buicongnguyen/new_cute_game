/**
 * Follow-camera maths without three.js types (copy the result into `camera.position`).
 * Rules from references/controls-and-camera.md:
 * - dead zone → soft zone: small moves inside the dead zone don't move the camera;
 * - horizontal damping λ ≈ 5 per second, vertical slower; height locked while airborne;
 * - look-ahead ≈ velocity × 0.35 s, capped (15–20 % of the view);
 * - `snap` on cuts and teleports, so the camera never sweeps across the world;
 * - portrait: keep the horizontal FOV, not the vertical one.
 */
import { damp } from './feel.ts';

export interface Vec3 { x: number; y: number; z: number }

export class FollowRig {
  focus: Vec3 = { x: 0, y: 0, z: 0 };
  private groundY = 0;
  options = { deadZone: .6, lambdaXZ: 5, lambdaY: 2.5, lookAheadSeconds: .35, maxLookAhead: 3 };
  constructor(options: Partial<FollowRig['options']> = {}) { this.options = { ...this.options, ...options }; }

  /** Jump straight to a target (scene start, teleport, cut). */
  snap(target: Vec3) { this.focus = { ...target }; this.groundY = target.y; }

  /** `dt` in REAL seconds (the camera keeps moving during hit-stop). */
  update(dt: number, target: Vec3, velocity: Vec3 = { x: 0, y: 0, z: 0 }, grounded = true) {
    const o = this.options;
    const ahead = { x: velocity.x * o.lookAheadSeconds, z: velocity.z * o.lookAheadSeconds };
    const length = Math.hypot(ahead.x, ahead.z);
    if (length > o.maxLookAhead) { ahead.x *= o.maxLookAhead / length; ahead.z *= o.maxLookAhead / length; }
    const goalX = target.x + ahead.x, goalZ = target.z + ahead.z;
    // Inside the dead zone, hold still; outside it, chase only the part beyond the zone.
    const dx = goalX - this.focus.x, dz = goalZ - this.focus.z, distance = Math.hypot(dx, dz);
    if (distance > o.deadZone) {
      const excess = (distance - o.deadZone) / distance;
      this.focus.x = damp(this.focus.x, this.focus.x + dx * excess, o.lambdaXZ, dt);
      this.focus.z = damp(this.focus.z, this.focus.z + dz * excess, o.lambdaXZ, dt);
    }
    if (grounded) this.groundY = target.y;
    this.focus.y = damp(this.focus.y, this.groundY, o.lambdaY, dt);
    return this.focus;
  }
}

/** Vertical FOV that keeps a fixed horizontal FOV on narrow (portrait) screens. */
export function verticalFovForAspect(baseVerticalFovDeg: number, aspect: number, designAspect = 16 / 9) {
  if (aspect >= designAspect) return baseVerticalFovDeg;
  const toRad = Math.PI / 180, horizontal = 2 * Math.atan(Math.tan(baseVerticalFovDeg * toRad / 2) * designAspect);
  return 2 * Math.atan(Math.tan(horizontal / 2) / aspect) / toRad;
}

/** Camera offsets for classic 2.5D angles: yaw 45°, pitch 35.264° (true isometric) or 30° (2:1 dimetric). */
export function isoOffset(distance: number, pitchDeg = 35.264, yawDeg = 45): Vec3 {
  const p = pitchDeg * Math.PI / 180, y = yawDeg * Math.PI / 180;
  return { x: Math.sin(y) * Math.cos(p) * distance, y: Math.sin(p) * distance, z: Math.cos(y) * Math.cos(p) * distance };
}
