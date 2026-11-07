import * as THREE from 'three';
import { createRng } from '../../src/engine/rng';
import { createModel, makeGear, type Model } from '../../src/client3d/models';
import type { BuildingKind, Dir } from '../../src/engine/types';

// ---------- configuração ----------
const PIXEL_SIZE = Number(new URLSearchParams(location.search).get('ps') ?? 2); // 1 pixel renderizado = N pixels na tela
const LOOP = 4; // segundos: todas as animações fecham neste período
const TAU = Math.PI * 2;
const S = 0.25; // tamanho do voxel do terreno (1 tile = 4x4 voxels)
const rng = createRng(77);
const rand = (a: number, b: number) => a + rng() * (b - a);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const sun = new THREE.DirectionalLight(0xfff0d2, 2.4);
sun.position.set(-14, 22, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 80 });
sun.shadow.bias = -0.0006;
scene.add(sun, new THREE.HemisphereLight(0xa9d4ff, 0x7a6248, 1.15));

// ---------- terreno em voxels (um único InstancedMesh) ----------
type Voxel = { x: number; y: number; z: number; color: THREE.Color };
const voxels = new Map<string, Voxel>();
const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const setVoxel = (x: number, y: number, z: number, hex: string, jitter = 0.07) => {
  const color = new THREE.Color(hex);
  color.offsetHSL(0, 0, (rng() - 0.5) * jitter * 2);
  voxels.set(key(x, y, z), { x, y, z, color });
};

const K = 1 / S; // voxels por tile
const W = 30 * K;
const H = 23 * K;
const CX = W / 2;
const CZ = H / 2;
const columns = new Map<string, number>(); // "i,j" -> profundidade
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const dx = (i - CX) / (CX - 0.5);
    const dz = (j - CZ) / (CZ - 0.5);
    const a = i / 2, b = j / 2;
    const wobble = Math.sin(a * 0.37 + b * 0.21) * 0.05 + Math.sin(a * 0.13 - b * 0.29) * 0.06 + Math.sin(i * 0.9 + j * 0.7) * 0.012 + rng() * 0.01;
    const d = dx * dx + dz * dz + wobble;
    if (d < 1) columns.set(`${i},${j}`, Math.max(1, Math.round((1 - d) ** 0.9 * 30 + rand(-1, 2.5))));
  }
}

const GRASS = ['#5fae3e', '#6cba45', '#58a238'];
const DIRT = ['#8a5a34', '#7a4f2e', '#6b4529', '#5e3d26', '#523422', '#46302a'];
for (const [k, depth] of columns) {
  const [i, j] = k.split(',').map(Number);
  setVoxel(i, 0, j, GRASS[Math.floor(rng() * GRASS.length)], 0.05);
  for (let y = 1; y <= depth; y++) {
    const rocky = rng() < 0.07 + y * 0.006;
    setVoxel(i, -y, j, rocky ? '#7d7f86' : DIRT[Math.min(DIRT.length - 1, Math.floor(y / 5))], 0.06);
  }
}

const topAt = (i: number, j: number) => columns.has(`${i},${j}`);

function paintOre(cx: number, cz: number, radius: number, base: string[], lump: string[]) {
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const i = Math.round(CX + cx * K + dx);
      const j = Math.round(CZ + cz * K + dz);
      if (!topAt(i, j) || Math.hypot(dx, dz) > radius - rng() * 3) continue;
      setVoxel(i, 0, j, base[Math.floor(rng() * base.length)], 0.05);
      const wx = (i - CX + 0.5) * S;
      const wz = (j - CZ + 0.5) * S;
      const onFactory = wx > -7.5 && wz > -0.5 && wz < 1.5; // mantém a linha de produção desobstruída
      const height = !onFactory && rng() < 0.55 ? 1 + Math.floor(rng() * 2.4) : 0;
      for (let y = 1; y <= height; y++) setVoxel(i, y, j, lump[Math.floor(rng() * lump.length)], 0.09);
    }
  }
}
paintOre(-9, 0.5, 11, ['#7c8794', '#6c7784'], ['#aab6c4', '#c6d1dd', '#8f9cac']);
paintOre(7, 4.5, 9, ['#b86a3a', '#a65d31'], ['#e3894f', '#f0a066', '#cf6d3c']);

function tree(i: number, j: number, kind: 'pine' | 'round') {
  if (!topAt(i, j)) return;
  const trunk = kind === 'pine' ? 5 : 6;
  for (let y = 1; y <= trunk; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) setVoxel(i + dx, y, j + dz, '#6b4423', 0.05);
  const greens = ['#2f8a3e', '#37994a', '#287a35'];
  const pick = () => greens[Math.floor(rng() * greens.length)];
  const rows = kind === 'pine' ? [4, 4, 3, 3, 3, 2, 2, 1, 1, 0] : [2, 3, 4, 4, 4, 3, 2, 1];
  rows.forEach((r, l) => {
    for (let dz = -r; dz <= r + 1; dz++) for (let dx = -r; dx <= r + 1; dx++) {
      const dist = Math.hypot(dx - 0.5, dz - 0.5);
      if (dist > r + 0.7) continue;
      setVoxel(i + dx, trunk - 1 + l * (kind === 'pine' ? 1 : 1), j + dz, pick(), 0.07);
    }
  });
}
function rock(i: number, j: number, size: number) {
  for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) {
    if (Math.hypot(dx - size / 2 + 0.5, dz - size / 2 + 0.5) > size / 2) continue;
    const h = 2 + Math.floor(rng() * 3) + (dx > 0 && dz > 0 ? 1 : 0);
    for (let y = 1; y <= h; y++) if (topAt(i + dx, j + dz)) setVoxel(i + dx, y, j + dz, y === h ? '#a6abb3' : '#7f858e', 0.06);
  }
}

for (let n = 0; n < 220; n++) {
  const i = Math.floor(rand(4, W - 6));
  const j = Math.floor(rand(4, H - 6));
  const dx = (i - CX) / (CX - 0.5);
  const dz = (j - CZ) / (CZ - 0.5);
  const edge = dx * dx + dz * dz;
  const nearLine = j > CZ - 16 && j < CZ + 26 && i > CX - 52 && i < CX + 34; // fábrica e frente da câmera livres
  const nearOre = Math.hypot(i - (CX - 36), j - CZ) < 14 || Math.hypot(i - (CX + 28), j - (CZ + 18)) < 12;
  if (edge < 0.3 || (j > CZ + 20 && edge < 0.62) || nearLine || nearOre || voxels.has(key(i, 1, j)) || voxels.has(key(i + 1, 2, j + 1))) continue;
  tree(i, j, rng() < 0.65 ? 'pine' : 'round');
}
for (let n = 0; n < 14; n++) {
  const i = Math.floor(rand(10, W - 10));
  const j = Math.floor(rand(8, H - 8));
  if ((j < CZ - 18 || j > CZ + 30) && !voxels.has(key(i, 1, j))) rock(i, j, 4);
}

// monta o InstancedMesh só com voxels expostos
const exposed = [...voxels.values()].filter(({ x, y, z }) =>
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => !voxels.has(key(x + a, y + b, z + c))),
);
const terrain = new THREE.InstancedMesh(new THREE.BoxGeometry(S, S, S), new THREE.MeshLambertMaterial(), exposed.length);
const m4 = new THREE.Matrix4();
exposed.forEach((v, n) => {
  m4.setPosition((v.x - CX + 0.5) * S, (v.y - 0.5) * S, (v.z - CZ + 0.5) * S);
  terrain.setMatrixAt(n, m4);
  terrain.setColorAt(n, v.color);
});
terrain.castShadow = terrain.receiveShadow = true;
scene.add(terrain);

// ---------- fábrica (modelos reutilizáveis do jogo) ----------
const anims: ((t: number) => void)[] = [];
const models: Model[] = [];
function spawn(kind: BuildingKind, tx: number, tz: number, dir: Dir = 0): Model {
  const model = createModel(kind, dir);
  model.group.position.set(tx + 0.5, 0, tz + 0.5);
  scene.add(model.group);
  if (model.light) model.group.add(model.light);
  model.effects?.forEach((effect) => scene.add(effect));
  models.push(model);
  return model;
}
const ROW = 0;
const phase = (t: number, cycles = 1) => ((t / LOOP) * cycles) % 1;

spawn('miner', -7, ROW);
spawn('furnace', -4, ROW);
spawn('assembler', -1, ROW);
spawn('hub', 2, ROW);
for (const tx of [-6, -5, -3, -2, 0, 1]) spawn('conveyor', tx, ROW);

// itens deslizando nos segmentos de 2 tiles
const itemMat = (hex: string) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
function lump(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, hex: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), itemMat(hex));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  parent.add(mesh);
}
function makeItem(kind: 'ore' | 'plate' | 'gear') {
  const g = new THREE.Group();
  if (kind === 'ore') { lump(g, 0.2, 0.14, 0.18, 0, 0, 0, '#8f9cac'); lump(g, 0.12, 0.1, 0.12, 0.08, 0.12, 0.02, '#c6d1dd'); }
  if (kind === 'plate') { lump(g, 0.28, 0.05, 0.18, 0, 0, 0, '#c9d3df'); lump(g, 0.28, 0.05, 0.18, 0.03, 0.05, 0.02, '#aab6c4'); }
  if (kind === 'gear') g.add(makeGear(0.11, 8, '#b5bfcb', 0.06));
  return g;
}
for (const [start, kind] of [[-6, 'ore'], [-3, 'plate'], [0, 'gear']] as const) {
  const items = [0, 1].map(() => { const it = makeItem(kind); it.position.y = 0.1; it.position.z = 0.5; scene.add(it); return it; });
  anims.push((t) => items.forEach((it, k) => {
    const s = (phase(t, 1) * 2 + k) % 2; // 2 tiles por loop, espaçados de 1 tile
    it.position.x = start + s + 0.1;
    it.visible = s > 0.05 && s < 1.95;
    if (kind === 'gear') it.rotation.y = phase(t, 2) * TAU;
  }));
}

// decoração: caixotes, barril e poste de luz
{
  const deco = (tx: number, tz: number) => { const g = new THREE.Group(); g.position.set(tx + 0.5, 0, tz + 0.5); scene.add(g); return g; };
  const crate = (tx: number, tz: number, h: number) => { const g = deco(tx, tz); lump(g, 0.7, 0.5 * h, 0.7, 0, 0, 0, '#9a6a3a'); lump(g, 0.74, 0.06, 0.74, 0, 0.5 * h - 0.06, 0, '#7a4f2e'); };
  crate(3, 2, 1); crate(4, 2, 2); crate(3, 3, 1);
  const barrel = deco(5, 1);
  const cask = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 10), itemMat('#8a5a34')); cask.position.y = 0.3; cask.castShadow = true; barrel.add(cask);
  const post = deco(-8, -2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6), itemMat('#5e6877')); pole.position.y = 0.7; pole.castShadow = true; post.add(pole);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: '#ffe08a', emissive: '#ffc040', emissiveIntensity: 1 })); bulb.position.y = 1.5; post.add(bulb);
  const lampLight = new THREE.PointLight(0xffc050, 2.5, 4); lampLight.position.set(-7.5, 1.6, -1.5); scene.add(lampLight);
}

// nuvens de voxel à deriva (fecham o loop)
const clouds: THREE.Group[] = [];
for (let n = 0; n < 3; n++) {
  const c = new THREE.Group();
  for (let k = 0; k < 7; k++) lump(c, rand(1.4, 2.6), 0.5, rand(1, 1.8), rand(-1.6, 1.6), rand(0, 0.3), rand(-0.8, 0.8), '#ffffff');
  c.position.set(n === 0 ? -17 : n === 1 ? 15 : -4, rand(8, 10), n === 2 ? -16 : rand(-2, 6));
  c.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
  scene.add(c); clouds.push(c);
}
const cloudStart = clouds.map((c) => c.position.x);
anims.push((t) => clouds.forEach((c, k) => { c.position.x = cloudStart[k] + Math.sin(phase(t, 1) * TAU) * 2.4; }));

// ---------- câmera e laço de render ----------
let zoom = Number(new URLSearchParams(location.search).get('zoom') ?? 5.6);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(1 / PIXEL_SIZE);
  renderer.setSize(w, h, false);
  const half = zoom;
  Object.assign(camera, { left: -half * (w / h), right: half * (w / h), top: half, bottom: -half });
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let lastT = 0;
function frame(t: number) {
  const dt = Math.max(0, t - lastT);
  lastT = t;
  const a = 1.3 + 0.13 * Math.sin((t / LOOP) * TAU); // leve balanço da câmera
  camera.position.set(-2.5 + Math.cos(a) * 24, 17, 0.5 + Math.sin(a) * 24);
  camera.lookAt(-2.5, 0, 0.5);
  models.forEach((model) => model.update(dt, true));
  anims.forEach((fn) => fn(t));
  renderer.render(scene, camera);
}
(window as unknown as { __frame: (t: number) => void }).__frame = frame;
(window as unknown as { __setZoom: (z: number) => void }).__setZoom = (z) => { zoom = z; resize(); };
const t0 = performance.now();
const loop = (now: number) => { frame((now - t0) / 1000); requestAnimationFrame(loop); };
if (!new URLSearchParams(location.search).has('manual')) requestAnimationFrame(loop);
(window as unknown as { __ready: boolean }).__ready = true;
