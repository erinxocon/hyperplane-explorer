// The explorer page's state: you (viewer.js), the display frame V that everything is drawn and measured in, the view,
// volume view, and whether the world needs redrawing. Only the page imports it; it hands what shared modules need to
// them (see rubik/puzzle.js), so they never depend on this page. See CLAUDE.md,
// "Core model": controls and frame ops act on S; drawing reads V.
import { createViewer } from '../viewer.js';

// you: S, your frame (it keeps its identity for the page's life; reset refills it), and VOL, volume view's tween
export const you = createViewer();
export const S = you.S, VOL = you.vol;
export const VIEW = { mode: 'slice' };

// V shares P, R and F with S. Volume view turns it 90° in the U–A plane (U → A, A → −U), so the slice lies level, w
// shows as up and your own frame, with U locked to world y, is never touched. It is set once per redraw.
let V = S;
export const frame = () => V;
export const updateFrame = () => (V = you.frame());

// the world is redrawn at most once a frame, when something asked for it
let dirty = true;
export const redraw = () => { dirty = true; };
export const takeRedraw = () => { const d = dirty; dirty = false; return d; };
