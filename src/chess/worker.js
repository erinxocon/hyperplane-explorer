// Runs the computer's search off the main thread, so the board keeps animating while it thinks.
import { chooseMove } from './ai.js';

self.onmessage = e => {
  const { board, turn, token } = e.data;
  self.postMessage({ move: chooseMove(new Int8Array(board), turn), token });
};
