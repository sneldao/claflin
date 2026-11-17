/**
 * The broker's body — a VRM avatar seated at the night desk, lip-synced
 * from ElevenLabs character alignment riding the scene-drive bus.
 *
 * Loaded on demand by lib/night-desk-scene.ts (dynamically imported) so
 * the room's payload budget is untouched until the desk has a live call.
 * Everything here is presentation: the mouth moves from alignment
 * timings or an aggregate volume level, never from order state, and
 * nothing in this module can sign, submit or record.
 *
 * Honesty rules carried over from the desk: the avatar reads the market,
 * it does not perform obedience — speech animates only what the call
 * actually says.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { MouthScheduler, type MouthViseme } from './desk/avatar-mouth';
import { onSceneDrive } from './desk/scene-drive';

const AVATAR_URL = '/avatars/hetty.vrm';

/** Room calibration: the desk runs ~4.4x human scale, floor at y = -3.45. */
const AVATAR_SCALE = 4.4;
const AVATAR_POSITION = new THREE.Vector3(-2.0, -3.45, -1.0);
const AVATAR_ROTATION_Y = 0.6;

const BLINK_INTERVAL_MIN_MS = 2500;
const BLINK_INTERVAL_MAX_MS = 6000;
const BLINK_DURATION_MS = 130;

export interface NightDeskAvatarController {
  /** 'ready' once the VRM is on the scene; 'failed' keeps the room silent. */
  readonly status: 'idle' | 'loading' | 'ready' | 'failed';
  /** Per-frame tick. Returns the scene's unsettled contribution. */
  update(deltaSeconds: number, nowMs: number): number;
  dispose(): void;
}

export function createNightDeskAvatar(
  scene: THREE.Scene,
  opts: {
    camera: THREE.PerspectiveCamera;
    reducedMotion: boolean;
    /** Wake the scene's on-demand render loop. */
    schedule: () => void;
  },
): NightDeskAvatarController {
  let status: NightDeskAvatarController['status'] = 'loading';
  let vrm: VRM | null = null;
  let disposed = false;

  const scheduler = new MouthScheduler();
  const lookTarget = new THREE.Object3D();
  lookTarget.position.copy(opts.camera.position);
  scene.add(lookTarget);

  /* Blink state: next blink deadline plus the in-progress one. */
  let nextBlinkAt = nowSeed() + BLINK_INTERVAL_MIN_MS;
  let blinkEndsAt = 0;
  function nowSeed() {
    return performance.now();
  }

  function poseSeated(model: VRM) {
    const humanoid = model.humanoid;
    const set = (name: Parameters<typeof humanoid.getNormalizedBoneNode>[0], x: number, y: number, z: number) => {
      const node = humanoid?.getNormalizedBoneNode(name);
      if (node) node.rotation.set(x, y, z);
    };
    /* Seated: thighs flat to the floor, shins down, hands toward the desk. */
    set('leftUpperLeg', -1.5, 0.1, 0.08);
    set('rightUpperLeg', -1.5, -0.1, -0.08);
    set('leftLowerLeg', 1.45, 0, 0);
    set('rightLowerLeg', 1.45, 0, 0);
    set('leftUpperArm', -0.55, 0, -0.12);
    set('rightUpperArm', -0.55, 0, 0.12);
    set('leftLowerArm', -0.5, 0, 0);
    set('rightLowerArm', -0.5, 0, 0);
  }

  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));
  loader.load(
    AVATAR_URL,
    gltf => {
      if (disposed) return;
      const model = gltf.userData.vrm as VRM | undefined;
      if (!model) {
        status = 'failed';
        return;
      }
      VRMUtils.rotateVRM0(model);
      model.scene.scale.setScalar(AVATAR_SCALE);
      model.scene.position.copy(AVATAR_POSITION);
      model.scene.rotation.y = AVATAR_ROTATION_Y;
      poseSeated(model);
      if (model.lookAt) {
        model.lookAt.target = lookTarget;
      }
      scene.add(model.scene);
      vrm = model;
      status = 'ready';
      opts.schedule();
    },
    undefined,
    () => {
      if (!disposed) status = 'failed';
    },
  );

  const unsubscribe = onSceneDrive(event => {
    if (event.type === 'speech') {
      scheduler.scheduleChunk(performance.now(), event.chars, event.charStartsMs, event.charDurationsMs);
      opts.schedule();
    } else if (event.type === 'speech-activity') {
      scheduler.driveLevel(event.level, performance.now());
      opts.schedule();
    } else if (event.type === 'speech-end') {
      scheduler.clear();
      opts.schedule();
    }
  });

  function update(deltaSeconds: number, nowMs: number): number {
    if (status !== 'ready' || !vrm) return 0;
    const dtMs = deltaSeconds * 1000;

    /* Mouth from the alignment scheduler. */
    const weights = scheduler.sample(nowMs, dtMs);
    const expressions = vrm.expressionManager;
    if (expressions) {
      for (const viseme of ['aa', 'ee', 'ih', 'oh', 'ou'] as MouthViseme[]) {
        expressions.setValue(viseme, weights[viseme]);
      }
      /* Blink: closed during the blink window, else follow the scheduler. */
      let blink = 0;
      if (nowMs >= nextBlinkAt) {
        if (!blinkEndsAt) blinkEndsAt = nowMs + BLINK_DURATION_MS;
      }
      if (blinkEndsAt) {
        blink = nowMs < blinkEndsAt ? 1 : 0;
        if (nowMs >= blinkEndsAt) {
          blinkEndsAt = 0;
          nextBlinkAt = nowMs + BLINK_INTERVAL_MIN_MS + Math.random() * (BLINK_INTERVAL_MAX_MS - BLINK_INTERVAL_MIN_MS);
        }
      }
      expressions.setValue('blink', blink);
    }

    /* Idle life: breath and a small head sway, unless the house is still. */
    if (!opts.reducedMotion) {
      const t = nowMs / 1000;
      const head = vrm.humanoid?.getNormalizedBoneNode('head');
      if (head) {
        head.rotation.x = Math.sin(t * 0.9) * 0.02;
        head.rotation.y = Math.sin(t * 0.6) * 0.03;
      }
      const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
      if (spine) spine.rotation.x = Math.sin(t * 1.2) * 0.012;
    }

    /* Follow the active room camera so the broker keeps eye contact. */
    lookTarget.position.copy(opts.camera.position);

    vrm.update(deltaSeconds);

    return scheduler.speaking(nowMs) ? 1 : blinkEndsAt ? 0.01 : 0;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    scheduler.clear();
    if (vrm) {
      VRMUtils.deepDispose(vrm.scene);
      if (vrm.scene.parent) vrm.scene.parent.remove(vrm.scene);
      vrm = null;
    }
    scene.remove(lookTarget);
    status = 'failed';
  }

  return {
    get status() {
      return status;
    },
    update,
    dispose,
  };
}
