// 4D chess: the 4×4×4×4 board drawn as four 3D boards, one per layer along your ana axis, each on a stand styled
// after tri-dimensional chess. The rules are in rules.js; the computer opponent (ai.js) runs in worker.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { WHITE, BLACK, QUEEN, coords, newGame, legalMoves, play, undo, gameState, kingAt } from './rules.js';
import { PIECE_GEOMETRY, STAND, buildStand, buildFrame } from './models.js';
import '../styles.css';
import './chess.css';

const AXES = 'xyzw', FILES = 'abcd';
const NAME = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'unicorn', 5: 'rook', 6: 'queen', 7: 'king' };
const LETTER = { 1: 'P', 2: 'N', 3: 'B', 4: 'U', 5: 'R', 6: 'Q', 7: 'K' };
// Cells are named file and rank (x and z), then level (y) and layer (w): b2 y1 w3.
const cellName = i => { const [x, y, z, w] = coords(i); return `${FILES[x]}${z + 1} y${y + 1} w${w + 1}`; };

// Display layout. A 3D board is four 4×4 levels `level` apart, each set back `stagger` from the one below. The tri-d
// stand staggers them like Star Trek's tri-dimensional chess, so you can see into the lower levels; the plain frame
// stacks them straight up, further apart. The boards stand TOWER apart; Shadow nests them as seen by an eye EYE layers
// ana of the middle of the board.
const STYLES = { trek: { level: 1.6, stagger: 1.5 }, plain: { level: 2.4, stagger: 0 } };
const TOWER = 6.2, EYE = 6;
const middle = st => new THREE.Vector3(0, 1.5 * st.level, -1.5 * st.stagger);   // the middle of one 3D board
// The board axes shown as right, up and forward, by ana axis: w takes the place of the axis your slice hides.
const FRAMES = [[3, 1, 2], [0, 3, 2], [0, 1, 3], [0, 1, 2]];

function main() {
  const view = document.getElementById('view');
  const css = getComputedStyle(document.documentElement), tok = n => css.getPropertyValue(n).trim();
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // mode: slice | stack | shadow. ana: the board axis your slice is perpendicular to. layer: where along it you are.
  // stand: trek | plain, remembered per browser.
  let stand = 'trek';
  try { if (localStorage.getItem('chess4d-stand') === 'plain') stand = 'plain'; } catch (_) {}
  const S = { mode: 'stack', ana: 3, layer: 0, opponent: 'computer', stand };
  const style = () => STYLES[S.stand];
  let game = newGame(), log = [], state = 'play', lastMove = null;
  let selected = -1, targets = new Map(), hover = -1, thinking = false, token = 0;

  /* ---------- scene ---------- */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch (e) { view.insertAdjacentHTML('beforeend', '<div class="err">WebGL is not available in this browser, so the board cannot be drawn.</div>'); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  view.prepend(renderer.domElement);
  const scene = new THREE.Scene(), BG = new THREE.Color(tok('--ground'));
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 34, 80);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;   // reflections for the chrome
  scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x1a2230, 0.3));
  const sun = new THREE.DirectionalLight(0xffffff, 0.55);
  sun.position.set(5, 14, 9);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 3; controls.maxDistance = 70;
  let orbited = false, camTween = null;
  controls.addEventListener('start', () => { orbited = true; camTween = null; });

  const std = (c, o) => new THREE.MeshStandardMaterial({ color: new THREE.Color(tok(c)), ...o });
  const flat = (c, opacity) => new THREE.MeshBasicMaterial({ color: new THREE.Color(tok(c)), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const MAT = {
    light: std('--tile-light', { roughness: 0.4, metalness: 0.1, envMapIntensity: 0.35 }), dark: std('--tile-dark', { roughness: 0.35, metalness: 0.4, envMapIntensity: 0.5 }),
    chrome: std('--chrome', { roughness: 0.16, metalness: 1 }), glass: std('--glass', { roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false }),
    white: std('--white-piece', { roughness: 0.35, metalness: 0.05, envMapIntensity: 0.7 }), black: std('--black-piece', { roughness: 0.28, metalness: 0.45 }),
    frame: new THREE.LineBasicMaterial({ color: new THREE.Color(tok('--muted')), transparent: true, opacity: 0.55 }),
    move: flat('--move', 0.9), capture: flat('--capture', 0.95), sel: flat('--accent', 0.95), last: flat('--last', 0.35), check: flat('--check', 0.95), hover: flat('--ink', 0.7),
  };

  // 256 tiles, drawn as two instanced meshes, dark and light; a1 y1 w1 is dark, as a1 is in chess. A tile's color is
  // the parity of x + y + z + w, which bishops keep. Each tile eases as a stand-in Object3D that is never drawn.
  const TILE = new THREE.BoxGeometry(0.92, 0.05, 0.92).translate(0, -0.025, 0);
  const tileSets = [MAT.dark, MAT.light].map(mat => {
    const m = new THREE.InstancedMesh(TILE, mat, 128);
    m.frustumCulled = false;
    m.userData.cells = [];
    scene.add(m);
    return m;
  });
  const tiles = Array.from({ length: 256 }, (_, i) => {
    const o = new THREE.Object3D(), set = tileSets[coords(i).reduce((a, b) => a + b) % 2];
    Object.assign(o.userData, { cell: i, set, n: set.userData.cells.push(i) - 1 });
    return o;
  });
  // Each 3D board has both the tri-d stand and the plain frame; the one not chosen shrinks away.
  const stands = [0, 1, 2, 3].flatMap(k => {
    const trek = buildStand({ ...STYLES.trek, chrome: MAT.chrome, glass: MAT.glass }), plain = buildFrame({ ...STYLES.plain, line: MAT.frame });
    trek.userData = { tower: k, style: 'trek' };
    plain.userData = { tower: k, style: 'plain' };
    scene.add(trek, plain);
    return [trek, plain];
  });
  // the rail along ana that the four stands are mounted on, shown in Stack
  const rail = new THREE.Group();
  {
    const len = 3 * TOWER + 2.4, y = STAND.foot - 0.02;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 20), MAT.chrome);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(STAND.colX, y, middle(STYLES.trek).z);
    rail.add(bar);
    for (const s of [-1, 1]) rail.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), MAT.chrome).translateX(STAND.colX + s * len / 2).translateY(y).translateZ(bar.position.z));
    scene.add(rail);
  }

  /* ---------- placement ---------- */
  // Where tower k goes: sideways offset x and scale s. Slice hides every tower but yours; Shadow nests them about
  // their common middle, scaled as a 4D eye ana of the board sees them.
  function tower(k) {
    if (S.mode === 'shadow') return { x: 0, s: EYE / (EYE - (k - 1.5)) };
    if (S.mode === 'slice') return { x: (k - S.layer) * TOWER, s: k === S.layer ? 1 : 0 };
    return { x: (k - 1.5) * TOWER, s: 1 };
  }
  // The target position and scale for something on cell i, `lift` above its tile.
  function place(i, lift = 0) {
    const st = style(), mid = middle(st), c = coords(i), [r, u, f] = FRAMES[S.ana], t = tower(c[S.ana]);
    const pos = new THREE.Vector3(c[r] - 1.5, c[u] * st.level + lift, -(c[f] - 1.5) - c[u] * st.stagger);
    pos.sub(mid).multiplyScalar(t.s).add(mid);
    pos.x += t.x;
    return { pos, s: t.s };
  }

  const pieces = new Map(), dying = [];
  function syncPieces() {
    for (const m of pieces.values()) scene.remove(m);
    pieces.clear();
    game.board.forEach((p, i) => {
      if (!p) return;
      const m = new THREE.Mesh(PIECE_GEOMETRY[Math.abs(p)], p > 0 ? MAT.white : MAT.black);
      m.rotation.y = (p > 0 ? 0 : Math.PI) + 1.1;   // turned so knights and unicorns show their profile, each side facing the other
      m.userData.cell = i;
      pieces.set(i, m);
      scene.add(m);
      snap(m);
    });
  }

  // Markers: the last move, check, the selected piece, where it can go, and the cell under the pointer.
  const markers = new THREE.Group();
  scene.add(markers);
  const DOT = new THREE.CircleGeometry(0.16, 28).rotateX(-Math.PI / 2);
  const RING = new THREE.RingGeometry(0.33, 0.43, 36).rotateX(-Math.PI / 2);
  const PAD = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
  const hoverMark = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), MAT.hover);
  hoverMark.visible = false;
  scene.add(hoverMark);
  function refreshMarkers() {
    markers.clear();
    const mark = (geo, mat, cell, lift) => { const m = new THREE.Mesh(geo, mat); m.userData.cell = cell; m.userData.lift = lift; markers.add(m); snap(m); };
    if (lastMove) { mark(PAD, MAT.last, lastMove.from, 0.004); mark(PAD, MAT.last, lastMove.to, 0.004); }
    if (state === 'check' || state === 'checkmate') mark(RING, MAT.check, kingAt(game.board, game.turn), 0.012);
    if (selected >= 0) mark(RING, MAT.sel, selected, 0.012);
    for (const [to, m] of targets) mark(m.captured ? RING : DOT, m.captured ? MAT.capture : MAT.move, to, 0.016);
  }

  // Everything eases toward a target position and scale, so moves, view changes and new slices all animate.
  const movers = () => [...tiles, ...stands, ...pieces.values(), ...markers.children, ...(hover >= 0 ? [hoverMark] : [])];
  function aim(o) {
    const u = o.userData;
    if (u.tower === undefined) { u.target = place(u.cell, u.lift || 0); return; }
    const t = tower(u.tower), mid = middle(STYLES[u.style]);
    u.target = u.style === S.stand ? { pos: mid.multiplyScalar(1 - t.s).setX(t.x), s: t.s } : { pos: mid.setX(t.x), s: 0 };
  }
  function snap(o) { aim(o); o.position.copy(o.userData.target.pos); o.scale.setScalar(o.userData.target.s); o.visible = o.scale.x > 0.01; }
  function retarget() {
    for (const o of movers()) aim(o);
    rail.visible = S.mode === 'stack' && S.stand === 'trek';
    // in Shadow the boards nest, so the squares go see-through to show the boards inside
    const see = S.mode === 'shadow';
    for (const m of [MAT.light, MAT.dark]) if (m.transparent !== see) { m.transparent = see; m.opacity = see ? 0.45 : 1; m.depthWrite = !see; m.needsUpdate = true; }
  }
  function ease(dt) {
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 9);
    for (const o of movers()) {
      const t = o.userData.target;
      o.position.lerp(t.pos, k);
      const s = o.scale.x + (t.s - o.scale.x) * k;
      o.scale.setScalar(Math.abs(s - t.s) < 1e-3 ? t.s : s);
      o.visible = o.scale.x > 0.04;   // nearly gone: hide it rather than leave a speck
    }
    for (const o of tiles) { o.updateMatrix(); o.userData.set.setMatrixAt(o.userData.n, o.matrix); }
    for (const m of tileSets) m.instanceMatrix.needsUpdate = true;
    for (let n = dying.length - 1; n >= 0; n--) {   // captured pieces shrink away
      const m = dying[n];
      m.scale.multiplyScalar(1 - k);
      if (m.scale.x < 0.02) { scene.remove(m); dying.splice(n, 1); }
    }
  }

  /* ---------- game ---------- */
  const over = () => state === 'checkmate' || state === 'stalemate' || state === 'draw';
  const humanTurn = () => S.opponent === 'two' || game.turn === WHITE;
  const mine = i => !over() && !thinking && humanTurn() && game.board[i] * game.turn > 0;
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => {
    if (e.data.token !== token) return;   // the position changed while it was thinking
    thinking = false;
    if (e.data.move) move(e.data.move); else refresh();
  };
  function think() {
    if (S.opponent !== 'computer' || game.turn !== BLACK || over()) return;
    thinking = true;
    worker.postMessage({ board: game.board, turn: game.turn, token: ++token });
    refresh();
  }
  function move(m) {
    const text = `${LETTER[Math.abs(m.piece)]} ${cellName(m.from)} ${m.captured ? '×' : '→'} ${cellName(m.to)}${m.promo ? ' =Q' : ''}`;
    play(game, m);
    state = gameState(game);
    log.push(text + (state === 'checkmate' ? '#' : state === 'check' ? '+' : ''));
    const mover = pieces.get(m.from), victim = pieces.get(m.to);
    if (victim) { pieces.delete(m.to); dying.push(victim); }
    pieces.delete(m.from);
    pieces.set(m.to, mover);
    mover.userData.cell = m.to;
    if (m.promo) mover.geometry = PIECE_GEOMETRY[QUEEN];
    aim(mover);
    lastMove = m; selected = -1; targets = new Map();
    refresh();
    think();
  }
  // After a new game or undo: rebuild the pieces in place, and let the computer move if it's its turn.
  function reset() {
    token++; thinking = false;
    lastMove = game.history.length ? game.history[game.history.length - 1].m : null;
    state = gameState(game); selected = -1; targets = new Map();
    syncPieces();
    refresh();
    think();
  }
  function takeBack() {
    if (!game.history.length) return;
    undo(game); log.pop();
    if (S.opponent === 'computer' && game.turn === BLACK && game.history.length) { undo(game); log.pop(); }   // and your own move
    reset();
  }
  function click(i) {
    if (targets.has(i)) { move(targets.get(i)); return; }
    if (i >= 0 && i !== selected && mine(i)) { selected = i; targets = new Map(legalMoves(game.board, game.turn).filter(m => m.from === i).map(m => [m.to, m])); }
    else { selected = -1; targets = new Map(); }
    refresh();
  }

  /* ---------- panel ---------- */
  const $ = id => document.getElementById(id);
  const hudStatus = $('hud-status'), hudHover = $('hud-hover'), stateEl = $('state');
  const layerBtns = [...$('layers').children];
  layerBtns.forEach(b => { b.innerHTML = '<span></span><span class="badge"></span>'; });
  const VIEW_DESC = {
    slice: '<b>Slice</b> shows only the 3D board your slice is in. Moves into other layers leave it: with a piece selected, the layer buttons count its moves in each layer. Q and E step kata and ana.',
    stack: '<b>Stack</b> shows all four 3D boards side by side, kata on the left and ana on the right, like the panels of a 4D scan. The gaps between them are only for display: neighboring boards are one step apart.',
    shadow: '<b>Shadow</b> is a 4D perspective projection: the eye is ana of the board, so the four 3D boards nest inside each other, kata smallest in the middle and ana largest outside.',
  };
  const press = (id, v) => { for (const b of $(id).children) b.setAttribute('aria-pressed', String(b.dataset.v === v)); };
  function refresh() {
    const side = game.turn === WHITE ? 'White' : 'Black', other = game.turn === WHITE ? 'Black' : 'White';
    const text = state === 'checkmate' ? `Checkmate · ${other} wins` : state === 'stalemate' ? 'Stalemate · draw' : state === 'draw' ? 'Draw'
      : thinking ? 'Computer is thinking…' : state === 'check' ? `${side} is in check` : `${side} to move`;
    stateEl.textContent = hudStatus.textContent = text;
    stateEl.classList.toggle('on', state !== 'play' || thinking);
    hudStatus.classList.toggle('check', state === 'check' || state === 'checkmate');
    press('view-mode', S.mode); press('ana', String(S.ana)); press('opponent', S.opponent); press('stand', S.stand);
    const A = AXES[S.ana], counts = [0, 0, 0, 0];
    for (const to of targets.keys()) counts[coords(to)[S.ana]]++;
    layerBtns.forEach((b, k) => {
      b.firstChild.textContent = `${A} ${k + 1}`;
      b.lastChild.textContent = counts[k] || '';
      b.setAttribute('aria-pressed', String(k === S.layer));
      b.classList.toggle('here', !!lastMove && coords(lastMove.to)[S.ana] === k);
      b.title = (counts[k] ? `${counts[k]} move${counts[k] > 1 ? 's' : ''} for the selected piece in this layer. ` : '') + (lastMove && coords(lastMove.to)[S.ana] === k ? 'The last move landed here.' : '');
    });
    $('view-desc').innerHTML = VIEW_DESC[S.mode];
    $('slice-note').textContent = `Your slice is perpendicular to ${A}, so the board shows as four 3D boards, ${A} = 1 to 4 from left to right${S.ana === 3 ? '' : `, with w in ${A}’s place on screen`}. Moves along ${A} jump between boards. Pick another axis to cut the same position another way.`;
    $('opp-note').textContent = S.opponent === 'computer' ? 'The computer plays black. It looks two moves ahead and follows captures through.' : 'Take turns on this device.';
    $('undo').disabled = !game.history.length;
    const ol = $('moves');
    ol.innerHTML = log.map((t, n) => `<li class="${n % 2 ? 'b' : 'w'}" value="${(n >> 1) + 1}">${t}</li>`).join('');
    ol.scrollTop = ol.scrollHeight;
    const taken = { [WHITE]: [], [BLACK]: [] };
    for (const { m } of game.history) if (m.captured) taken[Math.sign(m.piece)].push(LETTER[Math.abs(m.captured)]);
    $('captured').innerHTML = [WHITE, BLACK].filter(c => taken[c].length).map(c => `<span>${c > 0 ? 'White' : 'Black'} has taken ${taken[c].join(' ')}</span>`).join('');
    refreshMarkers();
    retarget();
  }

  /* ---------- input ---------- */
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), el = renderer.domElement;
  function pick(e) {
    const r = el.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([...[...pieces.values()].filter(o => o.visible && o.scale.x > 0.5), ...tileSets], false)
      .map(h => ({ cell: h.object.isInstancedMesh ? h.object.userData.cells[h.instanceId] : h.object.userData.cell, piece: !h.object.isInstancedMesh }));
    // Shadow nests the boards, so look through the outer ones: a cell you can move to first, then a piece, then any cell
    const first = f => hits.find(f)?.cell;
    return (S.mode === 'shadow' ? first(h => targets.has(h.cell)) ?? first(h => h.piece) : undefined) ?? first(() => true) ?? -1;
  }
  function setHover(i) {
    if (i === hover) return;
    hover = i;
    hoverMark.visible = i >= 0;
    if (i >= 0) { hoverMark.userData.cell = i; hoverMark.userData.lift = 0.008; snap(hoverMark); }
    el.style.cursor = i >= 0 && (targets.has(i) || mine(i)) ? 'pointer' : '';
    const p = i >= 0 ? game.board[i] : 0;
    hudHover.textContent = i < 0 ? '' : cellName(i) + (p ? ` · ${p > 0 ? 'white' : 'black'} ${NAME[Math.abs(p)]}` : '');
  }
  let downAt = null;
  el.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  el.addEventListener('pointerup', e => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) click(pick(e)); downAt = null; });
  el.addEventListener('pointermove', e => { if (!e.buttons) setHover(pick(e)); });
  el.addEventListener('pointerleave', () => setHover(-1));

  function setMode(m) { if (m === S.mode) return; S.mode = m; refresh(); frameCamera(); }
  function setLayer(k) { S.layer = Math.max(0, Math.min(3, k)); refresh(); }
  $('view-mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
  $('ana').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.ana = +b.dataset.v; refresh(); } });
  $('layers').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setLayer(+b.dataset.v); });
  $('opponent').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    S.opponent = b.dataset.v; token++; thinking = false;
    refresh();
    think();
  });
  $('stand').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || b.dataset.v === S.stand) return;
    S.stand = b.dataset.v;
    try { localStorage.setItem('chess4d-stand', S.stand); } catch (_) {}
    refresh();
    frameCamera();
  });
  $('new-game').addEventListener('click', () => { game = newGame(); log = []; reset(); });
  $('undo').addEventListener('click', takeBack);
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const m = { Digit1: 'slice', Digit2: 'stack', Digit3: 'shadow' }[e.code];
    if (m) setMode(m);
    else if (e.code === 'KeyE') setLayer(S.layer + 1);
    else if (e.code === 'KeyQ') setLayer(S.layer - 1);
    else if (e.code === 'Escape') click(-1);
  });

  /* ---------- camera and loop ---------- */
  // Each view looks at the middle of a board, moved by `at` (sideways, up), from direction `dir`, just far enough to
  // fit half-extents `fit` (width, height). The plain frame is taller and shallower, so it is framed lower down.
  const FRAMING = {
    trek: {
      stack: { at: [-0.7, -0.5], dir: [0, 0.72, 1], fit: [12.9, 5.2] },
      slice: { at: [-0.3, -0.4], dir: [0.35, 0.7, 1], fit: [4.8, 5.7] },
      shadow: { at: [-0.4, -0.2], dir: [0.3, 0.7, 1], fit: [6.4, 8.6] },
    },
    plain: {
      stack: { at: [0, -0.3], dir: [0, 0.6, 1], fit: [13.6, 6.2] },
      slice: { at: [0, -0.2], dir: [0.35, 0.6, 1], fit: [3.8, 6.2] },
      shadow: { at: [0, 0], dir: [0.3, 0.6, 1], fit: [5.8, 8.8] },
    },
  };
  function frameCamera(dur = 0.9) {
    const F = FRAMING[S.stand][S.mode], mid = middle(style()), at = new THREE.Vector3(F.at[0], mid.y + F.at[1], mid.z), dir = new THREE.Vector3(...F.dir).normalize();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), d = 1.06 * Math.max(F.fit[0] / (t * camera.aspect), F.fit[1] / t);
    camTween = { t: 0, dur: reduceMotion ? 0 : dur, fromT: controls.target.clone(), fromP: camera.position.clone(), toT: at, toP: at.clone().addScaledVector(dir, d) };
    if (!camTween.dur) { controls.target.copy(at); camera.position.copy(camTween.toP); controls.update(); camTween = null; }
  }
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!orbited) frameCamera(0);
  }
  const tagEls = [...$('tower-tags').children], _v = new THREE.Vector3();
  function placeTags() {
    const w = view.clientWidth, h = view.clientHeight;
    tagEls.forEach((tag, k) => {
      const g = stands[2 * k + (S.stand === 'trek' ? 0 : 1)], show = S.mode !== 'shadow' && g.scale.x > 0.5;
      tag.hidden = !show;
      if (!show) return;
      _v.set(0, S.stand === 'trek' ? STAND.foot - 0.5 : -0.8, 2.4).multiplyScalar(g.scale.x).add(g.position).project(camera);
      tag.textContent = `${AXES[S.ana]} ${k + 1}`;
      tag.classList.toggle('here', k === S.layer);
      tag.style.transform = `translate(${((_v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - _v.y) / 2 * h).toFixed(1)}px) translate(-50%, 0)`;
    });
  }

  // For the smoke test: where a cell, or the piece on it, is on screen.
  window.chess4d = {
    cellOnScreen(name) {
      const i = tiles.findIndex((_, j) => cellName(j) === name), o = pieces.get(i) || tiles[i];
      const v = o.position.clone();
      v.y += pieces.has(i) ? 0.25 * o.scale.x : 0;
      v.project(camera);
      const r = el.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    },
  };

  syncPieces();
  refresh();
  for (const o of movers()) snap(o);
  new ResizeObserver(resize).observe(view);
  resize();
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ease(dt);
    if (camTween) {
      const ct = camTween;
      ct.t = ct.dur ? Math.min(1, ct.t + dt / ct.dur) : 1;
      const e = ct.t < 0.5 ? 2 * ct.t * ct.t : 1 - Math.pow(-2 * ct.t + 2, 2) / 2;
      controls.target.lerpVectors(ct.fromT, ct.toT, e);
      camera.position.lerpVectors(ct.fromP, ct.toP, e);
      if (ct.t >= 1) camTween = null;
    }
    controls.update();
    placeTags();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
