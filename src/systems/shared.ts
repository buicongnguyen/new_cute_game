import * as T from 'three';
import {
  type CrewId, type FishId, type HelperId
} from '../rules/content.ts';
import { Actor } from '../world/actors.ts';
import { BeastShipView } from '../world/beast-ship.ts';
import { IsleView } from '../world/isle-view.ts';
import { makeToon } from '../world/look.ts';
export type Mode = 'deck' | 'isle' | 'house' | 'skiff' | 'ride' | 'drone' | 'cut';
export type PlaceView = IsleView | BeastShipView;
export interface Ship { ship: T.Object3D; plank: T.Object3D; out: T.Vector3; rim: T.Vector3; dock: T.Vector3; centre: T.Vector3; k: number; leaving: boolean }
export interface Interactable { id: string; pos: T.Vector3; radius: number; label: string; icon: string; act: () => void; auto?: boolean }
export interface Follower { who: CrewId; actor: Actor; boarding: boolean; t: number }
export interface Helper { id: HelperId; actor: Actor; t: number; heal: number; side: number }
export interface Family { actors: Actor[]; cage: number; t: number }
export interface Shell { mesh: T.Object3D; from: T.Vector3; to: T.Vector3; t: number; deck: boolean }
export const CAMERA = { fov: 40, portraitFov: 47, pitch: 47, deck: 19, isle: 22, house: 19, ship: 21, skiff: 15, skiffPitch: 6, portrait: 1.22 };
export const ISLE_BELOW = new T.Vector3(30, -28, -18);
export const GOLD = makeToon('#ffc83a', { emissive: '#5a3a00' });
export const RAIDER_GLOOM = { value: 1 };
export const FISH_IDS: FishId[] = ['puff_minnow', 'sun_carp', 'star_ray', 'cloud_koi', 'sun_carp', 'puff_minnow', 'star_ray'];
export const PUFF = new T.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: .45, fog: true });
export const BELL_GEO = (() => { const g = new T.CylinderGeometry(.12, .3, .42, 12, 1, true); g.translate(0, -.1, 0); return g; })();
export function makeGloomCloud(raft = false) {
  const g = new T.Group(), dark = makeToon('#5e5878'), light = makeToon('#8c86a8');
  if (raft) { const deck = new T.Mesh(new T.CylinderGeometry(3.2, 2.6, .5, 18), dark); deck.scale.z = 1.5; deck.position.y = -.25; g.add(deck); }
  const lumps: [number, number, number, number][] = [[0, 0, 0, 2.6], [2.2, -.3, .6, 1.9], [-2.1, -.2, -.4, 2], [.6, .9, -.8, 1.7], [-.8, -.6, 1.4, 1.6]];
  lumps.forEach(([x, y, z, r], i) => { const m = new T.Mesh(new T.IcosahedronGeometry(r, 2), i % 2 ? light : dark); m.position.set(x, raft ? y - 2.6 : y, z); g.add(m); });
  const eye = new T.Mesh(new T.SphereGeometry(.55, 14, 10), makeToon('#b26bff', { emissive: '#8a3dff' })); eye.position.set(-1.2, .5, 2.2); g.add(eye);
  g.visible = raft;
  return g;
}