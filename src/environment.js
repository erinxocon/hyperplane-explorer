// Reflections from a soft-lit room, for chrome and glossy materials. Its own module so the explorer, which has no
// chrome, doesn't download three.js's RoomEnvironment.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GPU } from './utils.js';

export function roomEnvironment(renderer, scene) {
  const make = Generator => {
    const pmrem = new Generator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  };
  // WebGPU's device comes up asynchronously, so its reflections arrive a moment later
  if (renderer.isWebGPURenderer) renderer.init().then(() => make(GPU.PMREMGenerator));
  else make(THREE.PMREMGenerator);
}
