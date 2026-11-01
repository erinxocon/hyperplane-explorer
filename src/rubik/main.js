// The 4D Rubik's cube page: the puzzle (cube.js is the model, puzzle.js draws it and runs its panel) alone in the world
// the walker (walk.js) makes. You walk around it, slice it and twist it. Like every shared module, puzzle.js takes what
// it needs from the page as arguments; the walker is that `ctx`.
import * as THREE from 'three';
import { createWalker } from '../walk.js';
import { createPuzzle } from './puzzle.js';

function main() {
  const walker = createWalker({ what: 'the puzzle' });
  if (!walker) return;
  // its place in the world: straight ahead of where you start
  const o = { name: 'Rubik’s 3⁴', color: '#9a62e8', center: [0, 0.1, 5, 0], pitch: 0.62, size: 0.9, group: new THREE.Group() };
  walker.scene.add(o.group);
  const puzzle = createPuzzle(o, walker);
  walker.frameOn(o.center, 1.0, 0);
  walker.run([o], {
    mode: puzzle.explain,
    volume: puzzle.updatePanel,   // Face this layer reads differently in volume view
    tick(dt) { if (puzzle.step(dt)) walker.redraw(); },
  });
}

main();
