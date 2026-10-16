import * as T from 'three';
import type { PlaceId } from '../rules/content.ts';

/**
 * The look: a 4-step toon ramp under a hemisphere light and a sun, with flat colours from the models (no textures,
 * no tone mapping). Each place has one dominant hue (design §15); the finale is a very dark blue night where the
 * colour lives in the lights.
 */
const STEPS = [96, 172, 228, 255];
function ramp() {
  const data = new Uint8Array(STEPS.length * 4);
  STEPS.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new T.DataTexture(data, STEPS.length, 1);
  tex.minFilter = tex.magFilter = T.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  return tex;
}
export const TOON_RAMP = ramp();

export interface Look { skyTop: string; skyHorizon: string; sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number; fog: string; fogNear: number; fogFar: number; cloud: string; cloudShade: string; night: boolean }
export const LOOKS: Record<PlaceId | 'voyage', Look> = {
  dawnreach: { skyTop: '#1f74ff', skyHorizon: '#9fd8ff', sun: '#fff0d2', sunI: 2.5, hemiSky: '#e6f4ff', hemiGround: '#8fcf6a', hemiI: 1.45, fog: '#a8dcff', fogNear: 60, fogFar: 190, cloud: '#ffffff', cloudShade: '#a9b8f0', night: false },
  clover: { skyTop: '#2a7dff', skyHorizon: '#ffe0a0', sun: '#ffe9b8', sunI: 2.6, hemiSky: '#fff4dc', hemiGround: '#86c95a', hemiI: 1.45, fog: '#ffe6b8', fogNear: 60, fogFar: 200, cloud: '#ffffff', cloudShade: '#c7b8ee', night: false },
  reef: { skyTop: '#1690e8', skyHorizon: '#ffc2c8', sun: '#fff0e8', sunI: 2.5, hemiSky: '#e8fbff', hemiGround: '#5fc8c0', hemiI: 1.5, fog: '#ffd0d4', fogNear: 60, fogFar: 200, cloud: '#fff6f8', cloudShade: '#b6aef0', night: false },
  ember: { skyTop: '#3a56d6', skyHorizon: '#ffb070', sun: '#ffd2a0', sunI: 2.5, hemiSky: '#ffe2cc', hemiGround: '#d8664a', hemiI: 1.4, fog: '#ffbf8a', fogNear: 55, fogFar: 180, cloud: '#fff0e2', cloudShade: '#c49ad8', night: false },
  star: { skyTop: '#040a20', skyHorizon: '#0d1a44', sun: '#9cb2ff', sunI: 1.3, hemiSky: '#3a4f9a', hemiGround: '#0a0e26', hemiI: 1.2, fog: '#0b1638', fogNear: 45, fogFar: 150, cloud: '#26335e', cloudShade: '#0d1430', night: true },
  voyage: { skyTop: '#1f74ff', skyHorizon: '#b8e4ff', sun: '#fff0d2', sunI: 2.5, hemiSky: '#e6f4ff', hemiGround: '#8fcf6a', hemiI: 1.45, fog: '#b8e4ff', fogNear: 60, fogFar: 190, cloud: '#ffffff', cloudShade: '#a9b8f0', night: false },
};
/** Around Nana's cabin: always a clear blue day sky with white clouds (the owner's wish, 2026-10-16). */
export const CABIN_LOOK: Look = { ...LOOKS.dawnreach, skyTop: '#2a86ff', skyHorizon: '#bfe6ff', fog: '#cdeeff', fogNear: 70, fogFar: 220 };

/** The night of the prologue (very dark blue, black-blue cloud sea). */
export const NIGHT: Look = { ...LOOKS.star, skyTop: '#030817', skyHorizon: '#0a1636', fog: '#081130' };

const c1 = new T.Color(), c2 = new T.Color();
export function mixLook(a: Look, b: Look, k: number): Look {
  const mix = (x: string, y: string) => '#' + c1.set(x).lerp(c2.set(y), k).getHexString();
  const num = (x: number, y: number) => x + (y - x) * k;
  return { skyTop: mix(a.skyTop, b.skyTop), skyHorizon: mix(a.skyHorizon, b.skyHorizon), sun: mix(a.sun, b.sun), sunI: num(a.sunI, b.sunI), hemiSky: mix(a.hemiSky, b.hemiSky), hemiGround: mix(a.hemiGround, b.hemiGround), hemiI: num(a.hemiI, b.hemiI), fog: mix(a.fog, b.fog), fogNear: num(a.fogNear, b.fogNear), fogFar: num(a.fogFar, b.fogFar), cloud: mix(a.cloud, b.cloud), cloudShade: mix(a.cloudShade, b.cloudShade), night: k > .5 ? b.night : a.night };
}

/** The shared Gloom uniform: 1 = the isle is crusted grey-violet, 0 = free and vivid (design §15). */
export const GLOOM = { value: 1 };

const toonCache = new Map<string, T.Material>();
/**
 * The toon twin of a glTF material, shared by name across files (the `pal_*` contract), so one colour is one material
 * and the scene batches well. `gloom` adds the isle tint.
 */
export function toonOf(source: T.Material, gloom = false): T.Material {
  const key = `${source.name || source.uuid}|${gloom ? 'g' : ''}`;
  const hit = toonCache.get(key);
  if (hit) return hit;
  const std = source as T.MeshStandardMaterial;
  const toon = new T.MeshToonMaterial({
    color: std.color?.clone() ?? new T.Color('#ffffff'), gradientMap: TOON_RAMP,
    emissive: std.emissive?.clone() ?? new T.Color(0), emissiveIntensity: std.emissiveIntensity ?? 1,
    transparent: !!std.transparent, opacity: std.opacity ?? 1, side: std.side ?? T.FrontSide, vertexColors: !!std.vertexColors,
    depthWrite: !std.transparent,
  });
  toon.name = source.name;
  if (source.name.startsWith('glow_')) toon.emissiveIntensity = Math.max(.8, Math.min(1.6, std.emissiveIntensity || 1));
  if (gloom) addGloom(toon);
  toonCache.set(key, toon);
  return toon;
}

export function addGloom<M extends T.Material>(m: M): M {
  m.onBeforeCompile = shader => {
    shader.uniforms.uGloom = GLOOM;
    shader.fragmentShader = 'uniform float uGloom;\n' + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float gl = dot(gl_FragColor.rgb, vec3(.299, .587, .114));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(gl * .78, gl * .74, gl * .92) + vec3(.03, .015, .07), uGloom * .86);`);
  };
  m.customProgramCacheKey = () => 'gloom';
  return m;
}

export function makeToon(color: string, opts: { emissive?: string; gloom?: boolean; transparent?: boolean; opacity?: number; vertexColors?: boolean } = {}) {
  const m = new T.MeshToonMaterial({ color, gradientMap: TOON_RAMP, emissive: opts.emissive ?? '#000000', transparent: !!opts.transparent, opacity: opts.opacity ?? 1, vertexColors: !!opts.vertexColors });
  if (opts.gloom) addGloom(m);
  return m;
}

/** Lights and fog for the world, re-pointed when the place (or the voyage blend) changes. */
export class Lighting {
  hemi = new T.HemisphereLight('#ffffff', '#88cc66', 1.4);
  sun = new T.DirectionalLight('#ffffff', 2.4);
  fog = new T.Fog('#a8dcff', 60, 190);
  look: Look = LOOKS.dawnreach;
  constructor(scene: T.Scene) {
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = this.fog;
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -16; cam.right = 16; cam.top = 16; cam.bottom = -16; cam.near = 1; cam.far = 90;
    this.sun.shadow.bias = -.0008; this.sun.shadow.normalBias = .03;
  }
  apply(look: Look) {
    this.look = look;
    this.hemi.color.set(look.hemiSky); this.hemi.groundColor.set(look.hemiGround); this.hemi.intensity = look.hemiI;
    this.sun.color.set(look.sun); this.sun.intensity = look.sunI;
    this.fog.color.set(look.fog); this.fog.near = look.fogNear; this.fog.far = look.fogFar;
  }
  /** The sun follows the camera target so its shadow box covers the view. */
  follow(x: number, y: number, z: number) {
    this.sun.position.set(x + 16, y + 34, z + 12);
    this.sun.target.position.set(x, y, z);
    this.sun.target.updateMatrixWorld();
  }
}
