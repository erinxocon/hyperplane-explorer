// Hyperplane Explorer: a 3D slice (or stack, or shadow) of a 4D world.
// See CLAUDE.md for the model and conventions before changing anything here.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { add, sub, mul, dot, lerp, ease, ident, rot, mm, mv, slerp } from './math4d.js';
import { tesseract, cell16, cell24, cell5, duoprism, cell600, klein, spunKlein, mobius4 } from './shapes.js';
import { createViewer, bindControls } from './viewer.js';
import { tok, createFloor, createMarker, depthShade, tubeMatrix, knobMatrix } from './scenery.js';
import { createReadout, createCompass, drawRulerRow, stackLabels as labelsFor, stackOffs, placeStackTags } from './hud.js';
import { createPuzzle } from './rubik/puzzle.js';
import GLOBE_VS from './shaders/globe.vert.glsl?raw';
import GLOBE_FS from './shaders/globe.frag.glsl?raw';
import SURF_VS from './shaders/earth-cap.vert.glsl?raw';
import SURF_FS from './shaders/earth-cap.frag.glsl?raw';
import EARTH_GLSL from './shaders/earth-surface.glsl?raw';
import landMaskUrl from './assets/land-mask.png';
import './styles.css';

function main() {
  const view = document.getElementById('view');

  const WORLD = [
    { name: 'Tesseract', color: '#eaa23c', center: [0, 0, 5, 0], scale: 1, shape: tesseract(), orient: ident() },
    { name: '24-cell', color: '#4fc1a6', center: [5.6, 0, 9.5, 0.4], scale: 1.05, shape: cell24(), orient: mm(rot(0, 3, 0.5), rot(1, 2, 0.3)) },
    { name: 'Earth', color: '#5f9fd8', center: [-4.4, 0.2, 7.5, 0], radius: 1.75, thick: 0.3, globe: true },
    { name: '16-cell', color: '#e3728f', center: [0, 0, 5, -3.2], scale: 1.5, shape: cell16(), orient: mm(rot(2, 3, 0.6), rot(0, 1, 0.4)) },
    { name: 'Rubik’s 3⁴', color: '#9a62e8', center: [3.4, 0.1, 2.6, 0], pitch: 0.62, size: 0.9, puzzle: true },
    { name: '5-cell', color: '#7fa9ff', center: [3.0, 0, 12.5, -0.3], scale: 1.35, shape: cell5(), orient: rot(0, 3, 0.3) },
    { name: 'Glome', color: '#f0d26e', center: [0, 0, 5, 3.2], radius: 1.35 },
    { name: '600-cell', color: '#d98ae0', center: [-3.4, 0, 2.2, 3.0], scale: 1.7, shape: cell600(), orient: mm(rot(0, 3, 0.35), rot(1, 2, 0.5)) },
    { name: '6,6-duoprism', color: '#9fd468', center: [-2.6, 0, 11.5, -3.0], scale: 1.35, shape: duoprism(6, 6), orient: rot(1, 3, 0.55) },
    { name: 'Klein bottle', color: '#e8845c', center: [3.2, 0, 6.6, 0.2], scale: 1.1, surface: klein(), orient: mm(rot(0, 3, 0.35), rot(1, 3, 0.4)) },
    { name: '3D Klein bottle', color: '#62d6ea', center: [-2.2, 0, 10.2, 0], scale: 1.2, fibers: spunKlein(), orient: ident() },
    { name: '4D Möbius strip', color: '#7ee0a8', center: [-2.8, -0.6, 2.4, -0.29], scale: 1.25, disks: mobius4(), orient: mm(rot(0, 2, Math.PI / 2), rot(0, 3, 0.233)) },
  ];
  const FLOOR_Y = -2.4;

  /* ---------- viewer state ---------- */
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // You (viewer.js): the frame S, which controls and frame ops act on, and volume view's tween VOL. S keeps its
  // identity for the page's life (reset refills it), so it can be held here as a const.
  const you = createViewer(), S = you.S, VOL = you.vol, orthonormalize = you.orthonormalize;
  const act = (code, amount) => { you.act(code, amount); dirty = true; };
  let spinT = 0, dirty = true, jump = null;
  // V is the display frame everything is drawn and measured in. It shares P, R and F with S; rendering reads V.
  // Volume view turns V 90° in the U–A plane (U -> A, A -> -U), so the slice lies level, w shows as up and the
  // walker frame, with U locked to world y, is never touched.
  let V = S;
  const VIEW = { mode: 'slice' };

  /* ---------- three.js scene ---------- */
  const BG = new THREE.Color(tok('--ground'));
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
  catch (e) { view.insertAdjacentHTML('beforeend', '<div class="err">WebGL is not available in this browser, so the 3D slice cannot be drawn.</div>'); return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  view.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 16, 42);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 200);
  camera.position.set(0, 3.4, 6.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -0.2, -4.5);
  controls.enableDamping = true;
  controls.maxDistance = 40; controls.minDistance = 1.5;
  controls.update();
  let orbited = false, camTween = null;
  controls.addEventListener('start', () => { orbited = true; camTween = null; });
  const CAM0 = new THREE.Vector3(0, 3.4, 6.2);

  scene.add(new THREE.HemisphereLight(0xdfe7ff, 0x1a2230, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(4, 9, 6); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xb8a6ff, 0.25); fill.position.set(-6, 2, -4); scene.add(fill);

  // the floor, the 4D hyperplane y = FLOOR_Y cut by your slice, and you at the origin of the slice
  const floor = createFloor(BG, [9, 30, -4]);
  scene.add(floor.mesh, createMarker());

  // Earth: a 3D ball (layered) times a short w-interval. Each pixel casts a ray through the slice,
  // maps it to 4D (X - C = Q + p.x*R + p.y*U - p.z*F), and intersects the layered ball in xyz
  // with the slab |w| <= h. Where the slab clips first, the flat face shows the interior.
  const landTex = new THREE.TextureLoader().load(landMaskUrl);
  landTex.wrapS = THREE.RepeatWrapping; landTex.minFilter = THREE.LinearFilter; landTex.generateMipmaps = false;

  // Earth's two w-caps in Shadow view: ordinary sphere meshes whose vertices are projected from 4D.
  const TUBE = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), KNOB = new THREE.SphereGeometry(1, 12, 8);
  // Glome wireframe: the Clifford torus (eta = 45 deg) plus the two great circles it separates, which are Hopf-linked.
  const GLOME_SEGS = (() => {
    const segs = [], N = 48, P = (eta, a, b) => [Math.cos(eta) * Math.cos(a), Math.cos(eta) * Math.sin(a), Math.sin(eta) * Math.cos(b), Math.sin(eta) * Math.sin(b)];
    const circle = (f, core) => { for (let i = 0; i < N; i++) segs.push([f(2 * Math.PI * i / N), f(2 * Math.PI * (i + 1) / N), core]); };
    for (let j = 0; j < 14; j++) { const c = 2 * Math.PI * j / 14; circle(t => P(Math.PI / 4, t, c), false); circle(t => P(Math.PI / 4, c, t), false); }
    circle(t => P(0, t, 0), true); circle(t => P(Math.PI / 2, 0, t), true);
    return segs;
  })();
  const EARTH_LINKS = [];
  for (const lat of [-0.75, 0, 0.75]) for (let j = 0; j < 8; j++) { const lon = j * Math.PI / 4; EARTH_LINKS.push([Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]); }

  // Per-solid render objects
  const sphereGeo = new THREE.SphereGeometry(1, 56, 36);
  WORLD.forEach(o => {
    const col = new THREE.Color(o.color);
    o.mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05, flatShading: !o.radius, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    o.lineMat = new THREE.LineBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.55) });
    o.ptMat = new THREE.PointsMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.4), size: 7, sizeAttenuation: false });
    o.group = new THREE.Group();
    scene.add(o.group);
    if (o.puzzle) {
      // its render objects are made by rubik/puzzle.js, below
    } else if (o.globe) {
      o.uni = {
        uCx: { value: new THREE.Vector4() }, uCy: { value: new THREE.Vector4() }, uCz: { value: new THREE.Vector4() },
        uR: { value: o.radius }, uH: { value: o.thick }, uSpin: { value: 0 }, uPV: { value: new THREE.Matrix4() },
        uLight: { value: new THREE.Vector3(4, 9, 6).normalize() }, uLand: { value: landTex },
      };
      const box = new THREE.BoxGeometry(2, 2, 2);
      o.proxies = [0, 1, 2].map(() => {
        const px = new THREE.Mesh(box, new THREE.ShaderMaterial({ uniforms: { ...o.uni, uQ: { value: new THREE.Vector4() }, uShift: { value: new THREE.Vector3() } }, vertexShader: GLOBE_VS, fragmentShader: EARTH_GLSL + GLOBE_FS, side: THREE.BackSide }));
        o.group.add(px); return px;
      });
      o.caps = [0, 1].map(() => {
        const g = new THREE.SphereGeometry(1, 48, 32);
        g.setAttribute('aDir', g.getAttribute('position').clone());
        const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { uLand: o.uni.uLand, uSpin: o.uni.uSpin, uLight: o.uni.uLight, uAlpha: { value: 1 }, uCenter: { value: new THREE.Vector3() } }, vertexShader: SURF_VS, fragmentShader: EARTH_GLSL + SURF_FS, side: THREE.DoubleSide }));
        o.group.add(mesh); return mesh;
      });
      o.links = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x8fc0ee, transparent: true, opacity: 0.7 }));
      o.group.add(o.links);
    } else if (o.radius) {
      o.balls = [0, 1, 2].map(() => { const b = new THREE.Mesh(sphereGeo, o.mat); o.group.add(b); return b; });
      o.wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
      o.group.add(o.wire);
    } else if (o.disks) {
      // slices are ribbons, one segment per disk, with their edge as tubes; Shadow draws a ring of the disks as cards
      o.rad4 = Math.max(...o.disks.map(f => Math.hypot(...f.c) + Math.max(...f.M.map(m => Math.hypot(...m))))) * o.scale;
      o.ribbon = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      o.edgeCol = col.clone().lerp(new THREE.Color(0xffffff), 0.6);
      o.dyn = new THREE.Group();
      const tmat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 }), n = 3 * (2 * o.disks.length + 16);
      o.tubes = new THREE.InstancedMesh(TUBE, tmat, n);
      o.knobs = new THREE.InstancedMesh(KNOB, tmat, n);
      o.tubes.frustumCulled = o.knobs.frustumCulled = false;
      o.cards = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false }));
      o.wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
      o.group.add(o.dyn, o.tubes, o.knobs, o.cards, o.wire);
    } else if (o.fibers) {
      // slices are surfaces (see glass, so the self-crossing shows); Shadow draws fiber spheres and the poles' path
      o.rad4 = Math.max(...o.fibers.map(f => Math.hypot(...f.c) + Math.max(...f.M.map(m => Math.hypot(...m))))) * o.scale;
      o.glass = new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false });
      o.dyn = new THREE.Group();
      const tmat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
      o.tubes = new THREE.InstancedMesh(TUBE, tmat, 2 * o.fibers.length);
      o.knobs = new THREE.InstancedMesh(KNOB, tmat, 2 * o.fibers.length);
      o.tubes.frustumCulled = o.knobs.frustumCulled = false;
      o.wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
      o.group.add(o.dyn, o.tubes, o.knobs, o.wire);
    } else if (o.surface) {
      // slices are curves, drawn as thin tubes; Shadow draws the projected skin and a grid of its tube circles
      const n = o.surface.tris.length, tmat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.05 });
      o.rad4 = Math.max(...o.surface.verts.map(v => Math.hypot(...v))) * o.scale;
      o.tubes = new THREE.InstancedMesh(TUBE, tmat, 3 * n);
      o.knobs = new THREE.InstancedMesh(KNOB, tmat, 3 * n);
      o.tubes.frustumCulled = o.knobs.frustumCulled = false;
      o.skin = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false }));
      o.wire = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
      o.group.add(o.tubes, o.knobs, o.skin, o.wire);
    } else {
      o.dyn = new THREE.Group(); o.group.add(o.dyn);
      o.rad4 = Math.max(...o.shape.verts.map(v => Math.hypot(...v))) * o.scale;
      const wmat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
      o.tubes = new THREE.InstancedMesh(TUBE, wmat, o.shape.edges.length);
      o.knobs = new THREE.InstancedMesh(KNOB, wmat, o.shape.verts.length);
      o.group.add(o.tubes, o.knobs);
    }
    o.baseCol = col;
    o.dimCol = col.clone().lerp(BG, 0.72);
    o.brightCol = col.clone().lerp(new THREE.Color(0xffffff), 0.3);
  });

  const local = X => { const d = sub(X, V.P); return new THREE.Vector3(dot(d, V.R), dot(d, V.U), -dot(d, V.F)); };

  function clearGroup(g) {
    for (const c of [...g.children]) {
      c.traverse(n => { if (n.geometry) n.geometry.dispose(); });
      g.remove(c);
    }
  }

  // Build the 3D cross-section from points where edges pierce the hyperplane.
  // For a convex polytope the section is the convex hull of those points.
  // Classify the hull of the section points and build its geometry.
  function sectionGeometry(pts) {
    if (!pts.length) return null;
    const p0 = pts[0];
    const argmax = f => { let bi = 0, bv = -1; pts.forEach((p, i) => { const v = f(p); if (v > bv) { bv = v; bi = i; } }); return [bi, bv]; };
    const [i1, d1] = argmax(p => p.distanceTo(p0));
    if (d1 < 1e-5) return { kind: 'point', ends: [p0] };
    const dir = pts[i1].clone().sub(p0).normalize();
    const offLine = p => { const v = p.clone().sub(p0); return v.sub(dir.clone().multiplyScalar(v.dot(dir))).length(); };
    const [i2, d2] = argmax(offLine);
    if (d2 < 1e-5) {
      let lo = p0, hi = p0, mn = 0, mx = 0;
      pts.forEach(p => { const t = p.clone().sub(p0).dot(dir); if (t < mn) { mn = t; lo = p; } if (t > mx) { mx = t; hi = p; } });
      return { kind: 'segment', ends: [lo, hi] };
    }
    const n = new THREE.Vector3().subVectors(pts[i1], p0).cross(new THREE.Vector3().subVectors(pts[i2], p0)).normalize();
    const [, d3] = argmax(p => Math.abs(p.clone().sub(p0).dot(n)));
    if (d3 >= 1e-4) {
      try { const geo = new ConvexGeometry(pts); return { kind: 'solid', geo, edges: new THREE.EdgesGeometry(geo, 1) }; }
      catch (e) { /* fall through to a flat polygon */ }
    }
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const v = new THREE.Vector3().crossVectors(n, dir);
    const ring = pts.map(p => { const d = p.clone().sub(c); return { p, a: Math.atan2(d.dot(v), d.dot(dir)) }; }).sort((a, b) => a.a - b.a).map(e => e.p);
    const tri = [], line = [];
    ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; tri.push(c, p, q); line.push(p, q); });
    const geo = new THREE.BufferGeometry().setFromPoints(tri); geo.computeVertexNormals();
    return { kind: 'solid', geo, edges: new THREE.BufferGeometry().setFromPoints(line) };
  }
  function addSection(target, o, g) {
    if (!g) return;
    if (g.kind === 'solid') { target.add(new THREE.Mesh(g.geo, o.mat)); target.add(new THREE.LineSegments(g.edges, o.lineMat)); return; }
    if (g.kind === 'segment') target.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(g.ends), o.lineMat));
    target.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(g.ends), o.ptMat));
  }
  function buildSection(o, pts) { clearGroup(o.dyn); addSection(o.dyn, o, sectionGeometry(pts)); }
  const stackLabels = () => labelsFor(VOL.on);
  // Stack: three parallel cuts through the shape, laid side by side.
  function buildStack(o, W) {
    clearGroup(o.dyn);
    const parts = stackOffs(o.range).map(off => sectionGeometry(sectionPoints(W, o.shape.edges, off).pts));
    const box = new THREE.Box3();
    let width = 0.8;
    for (const g of parts) {
      if (!g) continue;
      if (g.geo) { g.geo.computeBoundingBox(); box.copy(g.geo.boundingBox); } else box.setFromPoints(g.ends);
      width = Math.max(width, box.max.x - box.min.x);
    }
    const spacing = width + 0.7;
    parts.forEach((g, i) => { if (!g) return; const panel = new THREE.Group(); panel.position.x = (i - 1) * spacing; addSection(panel, o, g); o.dyn.add(panel); });
    o.stackInfo = { spacing, bottom: -(width / 2 + 0.35), labels: stackLabels() };
  }
  // Shadow: perspective projection along ana from an eye 1.6 radii ana of the center. Edges become tubes,
  // shaded from dim (kata, far from the eye) to bright (ana, near it).
  const _c = new THREE.Color(), _white = new THREE.Color(0xffffff);
  // o's color at depth t, from 0 (kata, dim) to 1 (ana, bright); returns a shared color
  const shadeAt = (o, t) => depthShade(_c, o.dimCol, o.brightCol, t);
  // a bright tube from projected point a to b (as from projector), shaded by their mean depth
  const ridge = (o, a, b) => ({ a: a.p, b: b.p, rr: 0.012 * (a.k + b.k), color: shadeAt(o, ((a.a + b.a) / 2 / o.rad4 + 1) / 2).clone().lerp(_white, 0.55) });
  function projector(C, E) {
    const base = local(C);
    return X => {
      const r = sub(X, C), a = dot(r, V.A), k = E / Math.max(0.25 * E, E - a);
      return { p: new THREE.Vector3(base.x + dot(r, V.R) * k, base.y + dot(r, V.U) * k, base.z - dot(r, V.F) * k), a, k };
    };
  }
  // Replace a mesh's geometry with one built from flat xyz arrays, e.g. { position, color }, and an optional index.
  const setGeo = (mesh, attrs, index) => {
    mesh.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    for (const [name, arr] of Object.entries(attrs)) geo.setAttribute(name, new THREE.Float32BufferAttribute(arr, 3));
    if (index) geo.setIndex(index);
    return (mesh.geometry = geo);
  };
  function buildWire(o, W) {
    clearGroup(o.dyn);
    const proj = projector(o.center, 1.6 * o.rad4);
    const PV = W.map(proj);
    o.shape.edges.forEach(([i, j], n) => {
      o.tubes.setMatrixAt(n, tubeMatrix(PV[i].p, PV[j].p, 0.018 * (PV[i].k + PV[j].k) / 2));
      o.tubes.setColorAt(n, shadeAt(o, ((PV[i].a + PV[j].a) / 2 / o.rad4 + 1) / 2));
    });
    PV.forEach((v, n) => {
      o.knobs.setMatrixAt(n, knobMatrix(v.p, 0.042 * v.k));
      o.knobs.setColorAt(n, shadeAt(o, (v.a / o.rad4 + 1) / 2));
    });
    for (const im of [o.tubes, o.knobs]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  function sectionPoints(W, edges, off = 0) {
    const dA = W.map(v => dot(sub(v, V.P), V.A) - off);
    const pts = [], EPS = 1e-9;
    const push = X => { const p = local(X); if (!pts.some(q => q.distanceToSquared(p) < 1e-10)) pts.push(p); };
    W.forEach((v, i) => { if (Math.abs(dA[i]) < EPS) push(v); });
    for (const [i, j] of edges) {
      const a = dA[i], b = dA[j];
      if ((a < -EPS && b > EPS) || (a > EPS && b < -EPS)) push(lerp(W[i], W[j], a / (a - b)));
    }
    return { pts, dA };
  }

  // Klein bottle: a surface, so a hyperplane meets it in curves. Marching triangles: every mesh triangle
  // the hyperplane P + off·A crosses gives one segment of the curve.
  function surfaceCuts(o, W, off) {
    const f = W.map(v => dot(sub(v, V.P), V.A) - off), segs = [];
    for (const t of o.surface.tris) {
      const ends = [];
      for (let e = 0; e < 3; e++) {
        const i = t[e], j = t[(e + 1) % 3];
        if ((f[i] >= 0) !== (f[j] >= 0)) ends.push(local(lerp(W[i], W[j], f[i] / (f[i] - f[j]))));
      }
      if (ends.length === 2) segs.push(ends);
    }
    return segs;
  }
  // Draw curves as chains of tubes, each segment { a, b, rr, color }. The meshes have room for many more segments
  // than are ever drawn (the Klein bottle's for one per triangle), so only the used part of each buffer is uploaded.
  function drawTubes(o, segs) {
    segs.forEach(({ a, b, rr, color }, n) => {
      o.tubes.setMatrixAt(n, tubeMatrix(a, b, rr));
      o.knobs.setMatrixAt(n, knobMatrix(a, rr));
      o.tubes.setColorAt(n, color); o.knobs.setColorAt(n, color);
    });
    const n = o.tubes.count = o.knobs.count = segs.length;
    if (!n) return;   // nothing drawn; an update range of 0 would make WebGL2 upload the whole buffer
    for (const im of [o.tubes, o.knobs]) for (const [attr, size] of [[im.instanceMatrix, 16], [im.instanceColor, 3]]) {
      if (!attr) continue;
      attr.updateRange.offset = 0; attr.updateRange.count = n * size;
      attr.needsUpdate = true;
    }
  }
  // Slice and Stack: the cut curves, each panel's shifted sideways by `shift` (Stack).
  const drawCuts = (o, panels) => drawTubes(o, panels.flatMap(({ segs, shift }) =>
    segs.map(([a, b]) => ({ a: a.setX(a.x + shift), b: b.setX(b.x + shift), rr: 0.028, color: o.baseCol }))));
  // Shadow: the projected skin, shaded kata -> ana like the wireframes, with the tube circles every 1/24 turn.
  // A thicker line runs along the top of the tube (v = pi/2); after one lap it comes back underneath (v = -pi/2),
  // and it takes a second lap to close.
  function buildSurfaceShadow(o, W) {
    const proj = projector(o.center, 1.6 * o.rad4), PV = W.map(proj);
    const { grid, nu, nv } = o.surface, g = (i, j) => i * (nv + 1) + j;
    const pos = [], col = [], idx = [], lpos = [], lcol = [];
    for (const k of grid) {
      const P = PV[k], c = shadeAt(o, (P.a / o.rad4 + 1) / 2);
      pos.push(P.p.x, P.p.y, P.p.z); col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) idx.push(g(i, j), g(i + 1, j), g(i + 1, j + 1), g(i, j), g(i + 1, j + 1), g(i, j + 1));
    const line = (a, b) => { for (const k of [a, b]) { lpos.push(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]); _c.setRGB(col[3 * k], col[3 * k + 1], col[3 * k + 2]).lerp(_white, 0.35); lcol.push(_c.r, _c.g, _c.b); } };
    for (let i = 0; i < nu; i += nu / 24) for (let j = 0; j < nv; j++) line(g(i, j), g(i, j + 1));
    const segs = [];
    for (const j of [nv / 4, 3 * nv / 4]) for (let i = 0; i < nu; i++) segs.push(ridge(o, PV[grid[g(i, j)]], PV[grid[g(i + 1, j)]]));
    drawTubes(o, segs);
    setGeo(o.skin, { position: pos, color: col }, idx).computeVertexNormals();
    setGeo(o.wire, { position: lpos, color: lcol });
  }

  // 3D Klein bottle: each fiber is an ellipsoid X = c + M p (p on the unit sphere) in its own 3-space, so the
  // hyperplane P + off·A meets it in the circle n·p = d with n = Mᵀ A, d = off − (c − P)·A. The slice is the
  // tube through those circles; where a run of fibers ends, the circle shrinks to a point and caps the tube.
  const fiberPoint = (f, p) => add(f.c, add(add(mul(f.M[0], p.x), mul(f.M[1], p.y)), mul(f.M[2], p.z)));
  // A list of fibers { c, M } moved into world coordinates by the object's orientation M, scale and center.
  const placeFibers = (o, list, M) => list.map(f => ({ c: add(o.center, mul(mv(M, f.c), o.scale)), M: f.M.map(m => mul(mv(M, m), o.scale)) }));
  // each fiber's extent along a unit direction e, measured from `from`: its center's offset ± |Mᵀ e|
  const fiberExtent = (F, e, from) => F.map(f => { const m = dot(sub(f.c, from), e), r = Math.hypot(...f.M.map(v => dot(v, e))); return [m - r, m + r]; });
  function fiberSlice(F, off, shift) {
    const NT = 40, pos = [], idx = [], ring = [];
    const at = F.map(f => {
      const n = new THREE.Vector3(...f.M.map(m => dot(m, V.A))), d = off - dot(sub(f.c, V.P), V.A);
      return { n, d, g: n.length() - Math.abs(d) };
    });
    const put = X => { const p = local(X); pos.push(p.x + shift, p.y, p.z); return pos.length / 3 - 1; };
    // the point where the circle vanishes between fibers i and j, fanned to ring `base`; a cap that ends a run
    // winds the other way from one that starts it, so the whole tube stays consistently oriented
    const cap = (i, j, base, end) => {
      const t = at[i].g / (at[i].g - at[j].g), lp = (a, b) => lerp(a, b, t);
      const n = at[i].n.clone().lerp(at[j].n, t), d = at[i].d + (at[j].d - at[i].d) * t;
      if (n.lengthSq() < 1e-12) return;
      const tip = put(fiberPoint({ c: lp(F[i].c, F[j].c), M: [0, 1, 2].map(k => lp(F[i].M[k], F[j].M[k])) }, n.multiplyScalar(d / n.lengthSq())));
      for (let k = 0; k < NT; k++) { const k1 = (k + 1) % NT; end ? idx.push(base + k1, base + k, tip) : idx.push(base + k, base + k1, tip); }
    };
    let prev = -1, e1 = null;
    const e2 = new THREE.Vector3(), q = new THREE.Vector3();
    F.forEach((f, i) => {
      const { n, d, g } = at[i];
      if (g <= 0 || n.lengthSq() < 1e-12) {
        if (prev >= 0) cap(i - 1, i, prev, true);
        prev = -1; e1 = null; return;
      }
      const nl = n.length(), nh = n.clone().divideScalar(nl), r = Math.sqrt(1 - (d / nl) ** 2);
      // carry the circle's start direction along from the previous fiber so the tube doesn't twist
      if (!e1) e1 = Math.abs(nh.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      e1.addScaledVector(nh, -e1.dot(nh)).normalize(); e2.crossVectors(nh, e1);
      const base = pos.length / 3;
      for (let k = 0; k < NT; k++) {
        const t = 2 * Math.PI * k / NT;
        q.copy(nh).multiplyScalar(d / nl).addScaledVector(e1, r * Math.cos(t)).addScaledVector(e2, r * Math.sin(t));
        put(fiberPoint(f, q));
      }
      if (i % 12 === 0) for (let k = 0; k < NT; k++) ring.push(base + k, base + (k + 1) % NT);
      if (prev >= 0) for (let k = 0; k < NT; k++) { const k1 = (k + 1) % NT; idx.push(prev + k, base + k, base + k1, prev + k, base + k1, prev + k1); }
      else if (i > 0) cap(i, i - 1, base, false);
      prev = base;
    });
    if (!idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', geo.getAttribute('position')); lines.setIndex(ring);
    return { geo, lines };
  }
  function addFiberSlice(o, F, off, shift) {
    const s = fiberSlice(F, off, shift);
    if (s) o.dyn.add(new THREE.Mesh(s.geo, o.glass), new THREE.LineSegments(s.lines, o.lineMat));
  }
  // Shadow: every 12th fiber sphere as three great circles, plus the path of its poles p = (±1, 0, 0), drawn as
  // tubes. Those are the glass bottle's two outlines, and after one lap each turns into the other.
  function buildFiberShadow(o, F) {
    const proj = projector(o.center, 1.6 * o.rad4), pos = [], col = [];
    const E = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)], N = 48, q = new THREE.Vector3();
    const pt = (f, a, b, t) => proj(fiberPoint(f, q.copy(E[a]).multiplyScalar(Math.cos(t)).addScaledVector(E[b], Math.sin(t))));
    for (let i = 0; i < F.length - 1; i += 12) for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (let k = 0; k < N; k++)
      for (const P of [pt(F[i], a, b, 2 * Math.PI * k / N), pt(F[i], a, b, 2 * Math.PI * (k + 1) / N)]) {
        const c = shadeAt(o, (P.a / o.rad4 + 1) / 2);
        pos.push(P.p.x, P.p.y, P.p.z); col.push(c.r, c.g, c.b);
      }
    setGeo(o.wire, { position: pos, color: col });
    const segs = [];
    for (const sg of [1, -1]) for (let i = 0; i < F.length - 1; i++) segs.push(ridge(o, proj(fiberPoint(F[i], q.set(sg, 0, 0))), proj(fiberPoint(F[i + 1], q.set(sg, 0, 0)))));
    drawTubes(o, segs);
  }

  // 4D Möbius strip: the hyperplane P + off·A meets each disk c + M·(a, b) in the chord α a + β b = δ, with
  // α = M[0]·A, β = M[1]·A and δ = off − (c − P)·A. The slice is the ribbon of those chords. Where it crosses every
  // disk it is a Möbius strip: after one lap the chord comes back reversed. Otherwise it breaks into ribbons that
  // narrow to a point where the chord vanishes. `kind` is 'mobius' or the number of separate ribbons.
  const diskPoint = (f, a, b) => add(f.c, add(mul(f.M[0], a), mul(f.M[1], b)));
  function ribbonSlice(D, off, shift) {
    const K = 6, pos = [], idx = [], rul = [], edge = [];
    const chord = f => {
      const al = dot(f.M[0], V.A), be = dot(f.M[1], V.A), del = off - dot(sub(f.c, V.P), V.A), r2 = al * al + be * be;
      return { al, be, del, r2, has: r2 > 1e-12 && del * del < r2 };
    };
    const at = D.map(chord);
    const put = X => { const p = local(X); p.x += shift; pos.push(p.x, p.y, p.z); return p; };
    // the point where the chord shrinks away, between disks i and j, fanned to the chord at `base`; a cap that ends
    // a run winds the other way from one that starts it, so the ribbon stays consistently oriented
    const cap = (i, j, base, ends, end) => {
      const gi = Math.sqrt(at[i].r2) - Math.abs(at[i].del), gj = Math.sqrt(at[j].r2) - Math.abs(at[j].del), t = gi / (gi - gj);
      const f = { c: lerp(D[i].c, D[j].c, t), M: [lerp(D[i].M[0], D[j].M[0], t), lerp(D[i].M[1], D[j].M[1], t)] };
      const { al, be, del, r2 } = chord(f);
      if (r2 < 1e-12) return;
      const tip = put(diskPoint(f, del * al / r2, del * be / r2)), ti = pos.length / 3 - 1;
      for (let k = 0; k < K - 1; k++) end ? idx.push(base + k + 1, base + k, ti) : idx.push(base + k, base + k + 1, ti);
      edge.push([ends[0], tip], [ends[1], tip]);
    };
    let prev = -1, prevEnds = null, runs = 0;
    D.forEach((f, i) => {
      const { al, be, del, r2, has } = at[i];
      if (!has) {
        if (prev >= 0) cap(i - 1, i, prev, prevEnds, true);
        prev = -1; return;
      }
      // the chord: its midpoint m = δ(α, β)/r², then ± along (−β, α) to the rim of the disk
      const ma = del * al / r2, mb = del * be / r2, L = Math.sqrt((1 - del * del / r2) / r2);
      const base = pos.length / 3, pts = [];
      for (let k = 0; k < K; k++) { const sk = (2 * k / (K - 1) - 1) * L; pts.push(put(diskPoint(f, ma - sk * be, mb + sk * al))); }
      const ends = [pts[0], pts[K - 1]];
      if (i % 10 === 0) rul.push(...ends);
      if (prev >= 0) {
        for (let k = 0; k < K - 1; k++) idx.push(prev + k, base + k, base + k + 1, prev + k, base + k + 1, prev + k + 1);
        edge.push([prevEnds[0], ends[0]], [prevEnds[1], ends[1]]);
      } else {
        runs++;
        if (i > 0) cap(i, i - 1, base, ends, false);
      }
      prev = base; prevEnds = ends;
    });
    // the last disk is the first one mirrored, so a ribbon running through both is one ribbon, not two
    const all = at.every(a => a.has), wraps = !all && at[0].has && at[at.length - 1].has;
    let geo = null;
    if (idx.length) {
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
    }
    return { geo, rul, edge, kind: all ? 'mobius' : runs - (wraps ? 1 : 0) };
  }
  // Slice or Stack panels: the ribbons and their rulings (every 10th chord) in o.dyn, every edge in one batch of tubes
  function buildRibbons(o, D, panels) {
    const segs = [];
    const kinds = panels.map(({ off, shift }) => {
      const r = ribbonSlice(D, off, shift);
      if (r.geo) o.dyn.add(new THREE.Mesh(r.geo, o.ribbon));
      if (r.rul.length) o.dyn.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(r.rul), o.lineMat));
      for (const [a, b] of r.edge) segs.push({ a, b, rr: 0.022, color: o.edgeCol });
      return r.kind;
    });
    drawTubes(o, segs);
    return kinds;
  }
  // Shadow: 16 of the disks as see-through cards, shaded kata -> ana, and the path of each card's top point (b = 1)
  // as tubes. After one lap the top point comes back at the bottom, so the line takes two laps to close.
  function buildCardShadow(o, D) {
    const proj = projector(o.center, 1.6 * o.rad4), N = D.length - 1, NS = 32;
    const pos = [], col = [], idx = [], lpos = [], lcol = [];
    const shade = P => shadeAt(o, (P.a / o.rad4 + 1) / 2);
    for (let j = 0; j < 16; j++) {
      const f = D[Math.round(j * N / 16)], base = pos.length / 3, rim = [];
      for (let k = 0; k < NS; k++) { const t = 2 * Math.PI * k / NS; rim.push(proj(diskPoint(f, Math.cos(t), Math.sin(t)))); }
      for (const P of [proj(f.c), ...rim]) { const c = shade(P); pos.push(P.p.x, P.p.y, P.p.z); col.push(c.r, c.g, c.b); }
      for (let k = 0; k < NS; k++) {
        idx.push(base, base + 1 + k, base + 1 + (k + 1) % NS);
        for (const P of [rim[k], rim[(k + 1) % NS]]) { const c = shade(P).lerp(_white, 0.3); lpos.push(P.p.x, P.p.y, P.p.z); lcol.push(c.r, c.g, c.b); }
      }
    }
    setGeo(o.cards, { position: pos, color: col }, idx).computeVertexNormals();
    setGeo(o.wire, { position: lpos, color: lcol });
    const segs = [];
    for (const sg of [1, -1]) for (let i = 0; i < N; i++) segs.push(ridge(o, proj(diskPoint(D[i], 0, sg)), proj(diskPoint(D[i + 1], 0, sg))));
    drawTubes(o, segs);
  }

  /* ---------- 4D Rubik's cube: rubik/ ---------- */
  const puzzle = createPuzzle(WORLD.find(o => o.puzzle), {
    frame: () => V, local, sectionPoints, sectionGeometry, setGeo, mode: () => VIEW.mode, volOn: () => VOL.on,
    reduceMotion, redraw: () => { dirty = true; }, S, startJump, setVolume, frameOn,
  });

  function buildGlomeShadow(o, spinM) {
    const proj = projector(o.center, 1.6 * o.radius);
    const pos = [], col = [];
    const pt = u => { const v = spinM ? mv(spinM, u) : u; return proj(add(o.center, mul(v, o.radius))); };
    for (const [u0, u1, core] of GLOME_SEGS) {
      for (const P of [pt(u0), pt(u1)]) {
        pos.push(P.p.x, P.p.y, P.p.z);
        const c = shadeAt(o, (P.a / o.radius + 1) / 2);
        if (core) c.lerp(_white, 0.45);
        col.push(c.r, c.g, c.b);
      }
    }
    setGeo(o.wire, { position: pos, color: col });
    o.wire.visible = true;
  }
  // Earth is ball x [-h, h] in w. Its shadow: the two end caps (balls at w = +-h) projected from 4D,
  // joined by lines through the w direction, like the two circles and rulings of a drawn cylinder.
  function buildEarthShadow(o) {
    const proj = projector(o.center, 1.6 * (o.radius + o.thick));
    const capPt = (n, s) => proj(add(o.center, [n[0] * o.radius, n[1] * o.radius, n[2] * o.radius, s * o.thick]));
    const aOf = s => s * o.thick * V.A[3];
    const near = aOf(1) >= aOf(-1) ? 1 : -1;
    [1, -1].forEach((s, i) => {
      const cap = o.caps[i], dir = cap.geometry.getAttribute('aDir'), pa = cap.geometry.getAttribute('position');
      for (let k = 0; k < pa.count; k++) { const P = capPt([dir.getX(k), dir.getY(k), dir.getZ(k)], s).p; pa.setXYZ(k, P.x, P.y, P.z); }
      pa.needsUpdate = true; cap.geometry.computeBoundingSphere();
      const isNear = s === near && Math.abs(V.A[3]) > 1e-3;
      cap.material.uniforms.uCenter.value.copy(capPt([0, 0, 0], s).p);
      cap.material.uniforms.uAlpha.value = isNear ? 0.22 : 1;
      cap.material.transparent = isNear; cap.material.depthWrite = !isNear;
      cap.renderOrder = isNear ? 2 : 0;
      cap.visible = true;
    });
    const pts = [];
    for (const n of EARTH_LINKS) pts.push(capPt(n, -1).p, capPt(n, 1).p);
    o.links.geometry.dispose(); o.links.geometry = new THREE.BufferGeometry().setFromPoints(pts); o.links.visible = true;
  }

  function rebuild() {
    V = you.frame();
    const spinM = spinT ? mm(rot(0, 3, spinT * 0.37), rot(1, 2, spinT * 0.23)) : null;
    // a fiber list's half-extent from its center along unit direction e, for Stack's spacing and labels
    const fiberHalf = (o, F, e) => Math.max(...fiberExtent(F, e, o.center).map(x => Math.max(-x[0], x[1])));
    for (const o of WORLD) {
      if (o.puzzle) { puzzle.rebuild(); continue; }
      const mode = VIEW.mode, M = o.orient && (spinM ? mm(spinM, o.orient) : o.orient);
      if (o.globe) {
        const q = sub(V.P, o.center), d = -dot(q, V.A);
        const m = o.radius * Math.hypot(V.A[0], V.A[1], V.A[2]) + o.thick * Math.abs(V.A[3]);
        o.range = [d - m, d + m];
        o.uni.uCx.value.set(...V.R); o.uni.uCy.value.set(...V.U); o.uni.uCz.value.set(...mul(V.F, -1));
        // a proxy shows the slice through P + off*A, shifted sideways by `shift`
        const setProxy = (px, off, shift) => {
          const dd = d - off, br2 = o.radius * o.radius + o.thick * o.thick - dd * dd;
          px.visible = Math.abs(dd) < m && br2 > 0;
          if (!px.visible) return false;
          px.position.copy(local(o.center)); px.position.x += shift;
          px.scale.setScalar(Math.sqrt(br2) * 1.02);
          px.material.uniforms.uQ.value.set(...add(q, mul(V.A, off)));
          px.material.uniforms.uShift.value.set(shift, 0, 0);
          return true;
        };
        o.proxies.forEach(px => { px.visible = false; });
        o.caps.forEach(c => { c.visible = false; }); o.links.visible = false;
        if (mode === 'slice') {
          const vis = setProxy(o.proxies[1], 0, 0);
          o.state = !vis ? 'not in slice' : Math.abs(V.A[3]) > 0.9995 ? 'whole globe' : 'sliced open';
        } else if (mode === 'stack') {
          const spacing = 2 * o.radius + 0.7;
          stackOffs(o.range).forEach((off, i) => setProxy(o.proxies[i], off, (i - 1) * spacing));
          o.stackInfo = { spacing, bottom: -o.radius - 0.35, labels: stackLabels() };
          o.state = Math.abs(V.A[3]) > 0.9995 ? 'stacked, whole' : 'stacked, sliced';
        } else {
          buildEarthShadow(o);
          o.state = 'shadow';
        }
        continue;
      }
      if (o.radius) {
        const d = dot(sub(o.center, V.P), V.A), rr = o.radius;
        o.range = [d - rr, d + rr];
        const setBall = (b, off, shift) => {
          const dd = d - off; b.visible = Math.abs(dd) < rr;
          if (b.visible) { b.scale.setScalar(Math.sqrt(rr * rr - dd * dd)); b.position.copy(local(o.center)); b.position.x += shift; }
        };
        o.balls.forEach(b => { b.visible = false; }); o.wire.visible = false;
        if (mode === 'slice') setBall(o.balls[1], 0, 0);
        else if (mode === 'stack') {
          const spacing = 2 * rr + 0.6;
          stackOffs(o.range).forEach((off, i) => setBall(o.balls[i], off, (i - 1) * spacing));
          o.stackInfo = { spacing, bottom: -rr - 0.35, labels: stackLabels() };
        } else buildGlomeShadow(o, spinM);
        continue;
      }
      if (o.disks) {
        const D = placeFibers(o, o.disks, M);
        const ea = fiberExtent(D, V.A, V.P);
        o.range = [Math.min(...ea.map(x => x[0])), Math.max(...ea.map(x => x[1]))];
        // the offsets where your slice would cross every disk, cutting a Möbius strip; tapping the name moves there
        const lo = Math.max(...ea.map(x => x[0])), hi = Math.min(...ea.map(x => x[1]));
        o.focus = hi > lo ? (lo + hi) / 2 : null;
        clearGroup(o.dyn);
        o.cards.visible = o.wire.visible = mode === 'shadow';
        if (mode === 'slice') {
          const [kind] = buildRibbons(o, D, [{ off: 0, shift: 0 }]);
          o.state = kind === 'mobius' ? 'Möbius strip' : !kind ? 'not in slice' : kind === 1 ? 'ribbon' : `${kind} ribbons`;
        } else if (mode === 'stack') {
          const spacing = 2 * fiberHalf(o, D, V.R) + 0.7;
          buildRibbons(o, D, stackOffs(o.range).map((off, i) => ({ off, shift: (i - 1) * spacing })));
          o.stackInfo = { spacing, bottom: -(fiberHalf(o, D, V.U) + 0.35), labels: stackLabels() };
          o.state = 'stacked';
        } else {
          buildCardShadow(o, D);
          o.state = 'shadow';
        }
        continue;
      }
      if (o.fibers) {
        const F = placeFibers(o, o.fibers, M);
        const ea = fiberExtent(F, V.A, V.P);
        o.range = [Math.min(...ea.map(x => x[0])), Math.max(...ea.map(x => x[1]))];
        clearGroup(o.dyn);
        o.wire.visible = o.tubes.visible = o.knobs.visible = mode === 'shadow';
        if (mode === 'slice') addFiberSlice(o, F, 0, 0);
        else if (mode === 'stack') {
          const spacing = 2 * fiberHalf(o, F, V.R) + 0.7;
          stackOffs(o.range).forEach((off, i) => addFiberSlice(o, F, off, (i - 1) * spacing));
          o.stackInfo = { spacing, bottom: -(fiberHalf(o, F, V.U) + 0.35), labels: stackLabels() };
        } else buildFiberShadow(o, F);
        continue;
      }
      if (o.surface) {
        const W = o.surface.verts.map(v => add(o.center, mul(mv(M, v), o.scale)));
        const dA = W.map(v => dot(sub(v, V.P), V.A));
        o.range = [Math.min(...dA), Math.max(...dA)];
        o.skin.visible = o.wire.visible = mode === 'shadow';
        if (mode === 'slice') drawCuts(o, [{ segs: surfaceCuts(o, W, 0), shift: 0 }]);
        else if (mode === 'stack') {
          const spacing = 2 * o.rad4 + 0.7;
          drawCuts(o, stackOffs(o.range).map((off, i) => ({ segs: surfaceCuts(o, W, off), shift: (i - 1) * spacing })));
          const half = Math.max(...W.map(v => Math.abs(dot(sub(v, o.center), V.U))));
          o.stackInfo = { spacing, bottom: -(half + 0.35), labels: stackLabels() };
        } else buildSurfaceShadow(o, W);
        continue;
      }
      const W = o.shape.verts.map(v => add(o.center, mul(mv(M, v), o.scale)));
      const dA = W.map(v => dot(sub(v, V.P), V.A));
      o.range = [Math.min(...dA), Math.max(...dA)];
      o.tubes.visible = o.knobs.visible = mode === 'shadow';
      if (mode === 'slice') buildSection(o, sectionPoints(W, o.shape.edges).pts);
      else if (mode === 'stack') buildStack(o, W);
      else buildWire(o, W);
    }
    floor.update(V, FLOOR_Y);
    updatePanel();
  }

  /* ---------- panel ---------- */
  const ruler = document.getElementById('ruler');
  const EYE_ON = '<svg class="on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg class="off" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  let savedHidden = [];
  try { savedHidden = JSON.parse(localStorage.getItem('hw-hidden') || '[]'); } catch (_) {}
  const saveHidden = () => { try { localStorage.setItem('hw-hidden', JSON.stringify(WORLD.filter(o => o.hidden).map(o => o.name))); } catch (_) {} };
  function setHidden(o, hidden) {
    o.hidden = hidden;
    o.group.visible = !hidden;
    o.eye.setAttribute('aria-pressed', String(!hidden));
    o.eye.setAttribute('aria-label', (hidden ? 'Show ' : 'Hide ') + o.name);
    o.eye.title = (hidden ? 'Show ' : 'Hide ') + o.name;
    o.wrap.classList.toggle('hidden-shape', hidden);
    syncSolo();
  }
  function syncSolo() {
    const b = document.getElementById('rk-solo');
    if (!b || WORLD.some(w => !w.eye)) return;
    const solo = WORLD.every(w => w.puzzle ? !w.hidden : w.hidden);
    b.setAttribute('aria-pressed', String(solo));
    b.textContent = solo ? 'Show all shapes' : 'Only the cube';
  }
  WORLD.forEach((o, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'shape-row';
    const eye = document.createElement('button');
    eye.className = 'eye'; eye.type = 'button'; eye.id = 'vis-' + i;
    eye.innerHTML = EYE_ON + EYE_OFF;
    eye.addEventListener('click', () => { setHidden(o, !o.hidden); saveHidden(); });
    wrap.appendChild(eye);
    o.eye = eye; o.wrap = wrap;
    const b = document.createElement('button');
    b.className = 'row-btn'; b.id = 'row-' + i; b.type = 'button';
    b.innerHTML = `<span class="nm"><span class="dot" style="background:${o.color}"></span>${o.name}</span><span class="track"><span class="bar" style="background:${o.color}"></span></span>`;
    b.addEventListener('click', () => {
      const c = o.focus ?? (o.range[0] + o.range[1]) / 2;
      startJump({ from: S.P.slice(), to: add(S.P, mul(V.A, c)), t: 0 });
    });
    o.row = b; o.barEl = b.querySelector('.bar');
    wrap.appendChild(b);
    ruler.appendChild(wrap);
    setHidden(o, savedHidden.includes(o.name));
  });
  document.getElementById('show-all').addEventListener('click', () => { WORLD.forEach(o => setHidden(o, false)); saveHidden(); });
  document.getElementById('hide-all').addEventListener('click', () => { WORLD.forEach(o => setHidden(o, true)); saveHidden(); });

  const earthState = document.getElementById('earth-state'), mobiusState = document.getElementById('mobius-state');
  const readout = createReadout();

  function updatePanel() {
    readout(V, S.P);
    const earth = WORLD.find(o => o.globe);
    earthState.textContent = earth.state;
    earthState.classList.toggle('on', earth.state === 'sliced open');
    const mobius = WORLD.find(o => o.disks);
    mobiusState.textContent = mobius.state;
    mobiusState.classList.toggle('on', mobius.state === 'Möbius strip');
    for (const o of WORLD) drawRulerRow(o.row, o.barEl, o.range, VOL.on, 'Intersects your slice');
  }

  /* ---------- input ---------- */
  // the movement keys and on-screen keys (viewer.js), acting on S; views and volume view have their own keys here
  const keys = bindControls({ act });
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const vm = { Digit1: 'slice', Digit2: 'stack', Digit3: 'shadow' }[e.code];
    if (vm) setMode(vm);
    else if (e.code === 'KeyV') { if (!e.repeat) setVolume(!VOL.on); }
  });

  const spinBox = document.getElementById('spin');
  spinBox.addEventListener('change', () => { dirty = true; });
  document.getElementById('reset').addEventListener('click', () => { you.reset(); jump = null; dirty = true; });

  /* ---------- views and camera ---------- */
  // turn the camera to 4D point `center` (followed as you move), from a set direction, `scale` times the usual distance
  function frameOn(center, scale, dur = 0.9) {
    orbited = true;
    camTween = { t: 0, dur: reduceMotion ? 0 : dur, fromT: controls.target.clone(), fromP: camera.position.clone(), to: () => {
      const lc = local(center), toT = new THREE.Vector3(lc.x, lc.y - 0.2, lc.z);
      return [toT, toT.clone().add((VIEW.mode === 'stack' ? new THREE.Vector3(0, 2.3, 5.6) : new THREE.Vector3(1.9, 2.2, 5.2)).multiplyScalar(scale))];
    } };
  }
  function dolly(f) {
    orbited = true;
    const toT = controls.target.clone(), toP = toT.clone().add(camera.position.clone().sub(toT).multiplyScalar(f));
    camTween = { t: 0, dur: reduceMotion ? 0 : 0.7, fromT: toT.clone(), fromP: camera.position.clone(), to: () => [toT, toP] };
  }
  const VIEW_DESC = {
    slice: '<b>Slice</b> shows what a 3D being living in your hyperplane would see: each shape cut by your slice, and only what the slice crosses. A slice takes away one dimension: 4D solids show as solids, the 3D Klein bottle and the 4D Möbius strip as surfaces, and the Klein bottle, a surface, as curves drawn as thin tubes.',
    stack: '<b>Stack</b> cuts every shape with three parallel slices spaced along ana and lays them side by side, kata on the left, ana on the right, like CT scans of a 4D object. Shapes appear whether or not your own slice crosses them, so ones that differ only in w overlap; use the eye toggles to separate them.',
    shadow: '<b>Shadow</b> is a 4D perspective projection along ana: what a 4D eye ana of each shape would see on its 3D retina. Parts further kata shrink toward the middle. Polytopes become the classic nested wireframes and the glome shows a Clifford torus between two linked circles; on both, edges further kata are dimmer and bluer and edges nearer the eye brighter and warmer. Earth shows its two w-caps joined like a drawn cylinder, with the cap nearer the eye see-through. The Klein bottle’s shadow has to pass through itself, though the bottle in 4D does not. The 3D Klein bottle shows some of its spheres and the path of their poles. The 4D Möbius strip shows a ring of its disks; the bright line runs along their top edges and comes back along the bottom. Shapes that differ only in w, like the tesseract, glome and 16-cell, land on the same spot; use the eye toggles to pull them apart.',
  };
  const VOL_DESC = ' <b>Volume view is on:</b> your slice lies level, so here ana means down and kata means up.';
  const viewDesc = document.getElementById('view-desc');
  function setMode(m) {
    if (m !== VIEW.mode && (m === 'stack' || VIEW.mode === 'stack')) dolly(m === 'stack' ? 1.5 : 1 / 1.5);
    VIEW.mode = m;
    document.querySelectorAll('#view-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === m)));
    viewDesc.innerHTML = VIEW_DESC[m] + (VOL.on ? VOL_DESC : '');
    puzzle.explain(m); dirty = true;
  }
  document.getElementById('view-mode').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
  const volBox = document.getElementById('volume');
  const axLo = document.getElementById('ax-lo'), axHi = document.getElementById('ax-hi'), rulerNote = document.getElementById('ruler-note');
  const RULER_NOTE = rulerNote.innerHTML;
  function setVolume(on) {
    VOL.on = on;
    volBox.checked = on;
    axLo.textContent = on ? '6 above' : 'kata −6';
    axHi.textContent = on ? '6 below' : '+6 ana';
    rulerNote.innerHTML = on ? 'Volume view slices level, so each bar is a shape’s extent in height, above to the left. Bars crossing the line intersect your slice. Tap a name to move your slice to that shape’s height; use the eye to show or hide it.' : RULER_NOTE;
    setMode(VIEW.mode);
    puzzle.updatePanel();   // Face this layer reads differently in volume view
  }
  volBox.addEventListener('change', () => setVolume(volBox.checked));
  document.getElementById('rk-solo').addEventListener('click', () => {
    const others = WORLD.filter(w => !w.puzzle);
    const showingOthers = others.some(w => !w.hidden);
    others.forEach(w => setHidden(w, showingOthers));
    WORLD.filter(w => w.puzzle).forEach(w => setHidden(w, false));
    saveHidden();
  });
  // Rotate x in the plane spanned by orthonormal u, v by angle a (u tips toward v).
  const planeRot = (x, u, v, a) => {
    const xu = dot(x, u), xv = dot(x, v), c = Math.cos(a) - 1, s = Math.sin(a);
    return add(x, add(mul(u, c * xu - s * xv), mul(v, c * xv + s * xu)));
  };
  const frameMat = f => [...f.R, 0, 1, 0, 0, ...f.F, ...f.A];
  const snapFrame = () => { for (const k of ['R', 'U', 'F', 'A']) S[k] = S[k].map(x => Math.abs(x) < 1e-9 ? 0 : Math.abs(Math.abs(x) - 1) < 1e-9 ? Math.sign(x) : x); };
  setMode('slice'); syncSolo();

  /* ---------- jumps ---------- */
  // A jump moves you from `from` to `to`, optionally turning your slice: `turn` is one plane rotation (Face this layer),
  // `frame` a whole new frame (Diagonal view). With reduced motion it lands at once, and so does a frame exactly 180°
  // away, which has no single shortest path (slerp gives none).
  function startJump(j) {
    jump = j;
    j.instant = reduceMotion || (j.frame && !slerp(frameMat(j.frame.from), frameMat(j.frame.to), 0.5));
    if (j.instant) stepJump(0);
  }
  function stepJump(dt) {
    jump.t = jump.instant ? 1 : Math.min(1, jump.t + dt / (jump.dur || 0.6));
    const e = ease(jump.t);
    S.P = lerp(jump.from, jump.to, e);
    if (jump.frame) {
      const { from, to } = jump.frame;
      const M = slerp(frameMat(from), frameMat(to), e);
      if (M) { S.R = M.slice(0, 4); S.F = M.slice(8, 12); S.A = M.slice(12, 16); } // rows are R, U, F, A
      else for (const k of ['R', 'F', 'A']) S[k] = lerp(from[k], to[k], e);
      orthonormalize();
      if (jump.t >= 1) { S.R = to.R; S.F = to.F; S.A = to.A; }
    }
    if (jump.turn) {
      const T = jump.turn;
      for (const k of ['R', 'F', 'A']) S[k] = planeRot(T[k], T.A, T.v, T.theta * e);
      if (jump.t >= 1) { orthonormalize(); snapFrame(); }
    }
    dirty = true;
    if (jump.t >= 1) jump = null;
  }

  /* ---------- loop ---------- */
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!orbited) { // pull back on narrow screens so the whole scene fits
      const k = Math.max(1, 1.3 / camera.aspect);
      camera.position.copy(controls.target).add(CAM0.clone().sub(controls.target).multiplyScalar(k));
      controls.update();
    }
  }
  new ResizeObserver(resize).observe(view);
  resize();

  const stackTags = document.getElementById('stack-tags');
  const drawCompass = createCompass(document.getElementById('compass'));
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    keys.apply(dt);
    if (jump && (jump.turn || jump.frame) && keys.held().some(c => c.startsWith('rot'))) jump = null; // manual rotation cancels a turn
    if (jump) stepJump(dt);
    const volT = VOL.t;
    you.step(dt, reduceMotion);   // volume view's tween, one second each way
    if (VOL.t !== volT) dirty = true;
    if (puzzle.step(dt)) dirty = true;
    if (spinBox.checked) { spinT += dt; dirty = true; }
    if (dirty) { dirty = false; rebuild(); }
    if (camTween) {
      const ct = camTween;
      ct.t = ct.dur ? Math.min(1, ct.t + dt / ct.dur) : 1;
      const e = ease(ct.t), [toT, toP] = ct.to();
      controls.target.lerpVectors(ct.fromT, toT, e);
      camera.position.lerpVectors(ct.fromP, toP, e);
      if (ct.t >= 1) camTween = null;
    }
    controls.update();
    camera.updateMatrixWorld();
    // label the stack of whichever visible shape sits closest to where you're looking
    let tagged = null, best = Infinity;
    if (VIEW.mode === 'stack') for (const o of WORLD) {
      if (o.hidden || !o.stackInfo) continue;
      const at = local(o.center), dist = at.distanceTo(controls.target);
      if (dist < best) { best = dist; tagged = { o, at }; }
    }
    placeStackTags(stackTags, view, camera, tagged?.at, tagged?.o.stackInfo);
    for (const o of WORLD) if (o.globe) {
      o.uni.uPV.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      if (!reduceMotion) o.uni.uSpin.value += dt * 0.12;
    }
    drawCompass(V, camera);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
