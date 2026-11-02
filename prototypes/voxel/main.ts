import * as THREE from 'three';
import { createRng } from '../../src/engine/rng';

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
      const height = rng() < 0.55 ? 1 + Math.floor(rng() * 2.4) : 0;
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

// ---------- peças da fábrica (blocos menores, 1/4 de tile) ----------
const mats = new Map<string, THREE.MeshLambertMaterial>();
const mat = (hex: string, emissive?: string) => {
  const k = hex + (emissive ?? '');
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...(emissive ? { emissive, emissiveIntensity: 1 } : {}) }));
  return mats.get(k)!;
};
const BRASS = '#e0a63c', BRASS_D = '#a8702a', COPPER = '#cf6d3c', STEEL = '#9aa5b3', STEEL_D = '#5e6877', DARK = '#2a2024', LEATHER = '#4e372b';

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, hex: string, emissive?: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex, emissive));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cyl(parent: THREE.Object3D, r: number, h: number, x: number, y: number, z: number, hex: string, seg = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat(hex));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function gear(r: number, teeth: number, hex: string, thick = 0.09) {
  const g = new THREE.Group();
  cyl(g, r, thick, 0, 0, 0, hex, 14);
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * TAU;
    const tooth = box(g, r * 0.42, thick, r * 0.3, Math.cos(a) * (r + r * 0.12), 0, Math.sin(a) * (r + r * 0.12), hex);
    tooth.rotation.y = -a;
  }
  cyl(g, r * 0.25, thick + 0.04, 0, 0, 0, BRASS);
  return g;
}

const anims: ((t: number) => void)[] = [];
const place = (tx: number, tz: number) => {
  const g = new THREE.Group();
  g.position.set(tx + 0.5, 0, tz + 0.5);
  scene.add(g);
  return g;
};
const ROW = 0;
const phase = (t: number, cycles = 1) => ((t / LOOP) * cycles) % 1;

// esteiras: tiles -6,-5 / -3,-2 / 0,1
const BELT_TILES = [-6, -5, -3, -2, 0, 1];
for (const tx of BELT_TILES) {
  const g = place(tx, ROW);
  box(g, 1, 0.14, 0.12, 0, 0, -0.42, STEEL); box(g, 1, 0.14, 0.12, 0, 0, 0.42, STEEL);
  box(g, 1, 0.08, 0.72, 0, 0, 0, LEATHER);
  for (let k = 0; k < 6; k++) box(g, 0.06, 0.02, 0.06, -0.4 + (k % 2) * 0.8, 0.14, k < 3 ? -0.42 : 0.42, BRASS);
  const chevrons: THREE.Group[] = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Group();
    for (const s of [-1, 1]) { const arm = box(c, 0.26, 0.02, 0.06, -0.06, 0.08, s * 0.1, '#7a5842'); arm.rotation.y = s * 0.7; }
    g.add(c); chevrons.push(c);
  }
  anims.push((t) => chevrons.forEach((c, k) => { c.position.x = ((k / 4 + phase(t, 8) * 1) % 1) - 0.5; }));
}

// itens deslizando nos segmentos de 2 tiles
function makeItem(kind: 'ore' | 'plate' | 'gear') {
  const g = new THREE.Group();
  if (kind === 'ore') { box(g, 0.2, 0.14, 0.18, 0, 0, 0, '#8f9cac'); box(g, 0.12, 0.1, 0.12, 0.08, 0.12, 0.02, '#c6d1dd'); }
  if (kind === 'plate') { box(g, 0.28, 0.05, 0.18, 0, 0, 0, '#c9d3df'); box(g, 0.28, 0.05, 0.18, 0.03, 0.05, 0.02, '#aab6c4'); }
  if (kind === 'gear') g.add(gear(0.11, 8, '#b5bfcb', 0.06));
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

// mineradora (tile -7)
{
  const g = place(-7, ROW);
  box(g, 0.92, 0.12, 0.92, 0, 0, 0, STEEL_D);
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) box(g, 0.08, 0.95, 0.08, x, 0.1, z, STEEL);
  for (const y of [0.35, 0.65]) { box(g, 0.8, 0.05, 0.05, 0, y, -0.36, STEEL); box(g, 0.8, 0.05, 0.05, 0, y, 0.36, STEEL); box(g, 0.05, 0.05, 0.8, -0.36, y, 0, STEEL); box(g, 0.05, 0.05, 0.8, 0.36, y, 0, STEEL); }
  box(g, 0.84, 0.06, 0.84, 0, 1.0, 0, BRASS_D);
  const rod = new THREE.Group(); rod.position.y = 0.1; g.add(rod);
  cyl(rod, 0.07, 0.95, 0, 0, 0, COPPER, 8);
  for (let k = 0; k < 6; k++) { const b = box(rod, 0.2, 0.05, 0.06, 0, 0.1 + k * 0.14, 0, STEEL); b.rotation.y = k * 0.9; }
  const top = gear(0.2, 10, STEEL); top.position.set(0, 1.08, 0); g.add(top);
  box(g, 0.26, 0.3, 0.26, 0.3, 0.12, 0.3, COPPER);
  const piston = box(g, 0.08, 0.28, 0.08, 0.3, 0.42, 0.3, STEEL);
  anims.push((t) => { rod.rotation.y = -phase(t, 3) * TAU; top.rotation.y = phase(t, 2) * (TAU / 10) * 5; piston.position.y = 0.42 + 0.14 + Math.sin(phase(t, 4) * TAU) * 0.08; });
}

// fornalha (tile -4) + fumaça + luz do fogo
{
  const g = place(-4, ROW);
  box(g, 0.94, 0.16, 0.94, 0, 0, 0, STEEL_D);
  cyl(g, 0.4, 0.62, 0, 0.16, 0, COPPER, 12);
  for (const y of [0.3, 0.62]) cyl(g, 0.42, 0.06, 0, y, 0, BRASS, 12);
  cyl(g, 0.11, 0.5, 0.22, 0.72, -0.22, STEEL, 8); cyl(g, 0.14, 0.06, 0.22, 1.18, -0.22, BRASS, 8);
  const door = box(g, 0.06, 0.22, 0.3, 0.42, 0.22, 0, '#ff8a1f', '#ff7a10');
  box(g, 0.04, 0.26, 0.34, 0.41, 0.2, 0, BRASS_D);
  const gauge = cyl(g, 0.09, 0.05, -0.2, 0.8, 0.2, BRASS, 10); gauge.rotation.x = Math.PI / 2 - 0.5;
  const light = new THREE.PointLight(0xff8a2a, 6, 5); light.position.set(-4 + 0.5 + 0.7, 0.5, 0.5); scene.add(light);
  const puffs = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: '#eef3f6', transparent: true }));
    scene.add(m); return m;
  });
  anims.push((t) => {
    const flick = 0.8 + 0.2 * Math.sin(phase(t, 6) * TAU) + 0.08 * Math.sin(phase(t, 13) * TAU);
    light.intensity = 6 * flick;
    (door.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.6 + 0.4 * flick;
    puffs.forEach((p, k) => {
      const u = (phase(t, 2) + k / 8) % 1;
      p.position.set(-4 + 0.5 + 0.22 + u * 1.2 + Math.sin(u * 7 + k) * 0.1, 1.25 + u * 2.6, 0.5 - 0.22 + Math.sin(u * 5 + k * 2) * 0.1);
      p.scale.setScalar(0.5 + u * 1.7); p.rotation.y = u * 2;
      (p.material as THREE.MeshLambertMaterial).opacity = 0.85 * (1 - u) ** 1.3;
    });
  });
}

// montadora (tile -1)
{
  const g = place(-1, ROW);
  box(g, 0.94, 0.4, 0.94, 0, 0, 0, BRASS);
  box(g, 0.78, 0.05, 0.78, 0, 0.4, 0, DARK);
  const g1 = gear(0.26, 10, STEEL); g1.position.set(-0.14, 0.45, -0.1); g.add(g1);
  const g2 = gear(0.16, 6, COPPER); g2.position.set(0.22, 0.45, 0.1); g.add(g2);
  box(g, 0.1, 0.4, 0.1, -0.34, 0.4, 0.34, BRASS_D);
  const arm1 = new THREE.Group(); arm1.position.set(-0.34, 0.72, 0.34); g.add(arm1);
  box(arm1, 0.42, 0.07, 0.07, 0.21, 0, 0, STEEL);
  const arm2 = new THREE.Group(); arm2.position.set(0.42, 0.035, 0); arm1.add(arm2);
  box(arm2, 0.36, 0.06, 0.06, 0.18, 0, 0, STEEL); box(arm2, 0.08, 0.1, 0.12, 0.38, -0.03, 0, COPPER);
  const lamp = box(g, 0.12, 0.12, 0.12, 0.36, 0.4, -0.36, '#ffd24a', '#ffb020');
  anims.push((t) => {
    const p = phase(t, 2) * (TAU / 10);
    g1.rotation.y = p * 5; g2.rotation.y = -p * 5 * 10 / 6 + TAU / 12;
    arm1.rotation.y = -0.9 + 0.5 * Math.sin(phase(t, 1) * TAU); arm2.rotation.y = 0.9 * Math.cos(phase(t, 1) * TAU);
    (lamp.material as THREE.MeshLambertMaterial) .emissiveIntensity = 0;
    lamp.visible = true; lamp.scale.setScalar(phase(t, 2) < 0.5 ? 1.15 : 0.8);
  });
}

// central / cofre (tile 2)
{
  const g = place(2, ROW);
  box(g, 0.96, 0.62, 0.96, 0, 0, 0, STEEL_D);
  box(g, 1, 0.07, 1, 0, 0.62, 0, BRASS);
  const wheel = new THREE.Group(); wheel.position.set(0, 0.7, 0); g.add(wheel);
  cyl(wheel, 0.3, 0.06, 0, 0, 0, BRASS, 14); cyl(wheel, 0.24, 0.08, 0, 0, 0, STEEL, 14);
  for (let k = 0; k < 4; k++) { const sp = box(wheel, 0.5, 0.05, 0.06, 0, 0.06, 0, BRASS); sp.rotation.y = (k * Math.PI) / 4; }
  cyl(wheel, 0.07, 0.1, 0, 0.04, 0, BRASS, 8);
  box(g, 0.34, 0.05, 0.34, 0, 0.62, -0.34, DARK);
  anims.push((t) => { wheel.rotation.y = phase(t, 1) * (TAU / 4); });
}

// decoração: caixotes, barris e poste de luz
{
  const crate = (tx: number, tz: number, h: number) => { const g = place(tx, tz); box(g, 0.7, 0.5 * h, 0.7, 0, 0, 0, '#9a6a3a'); box(g, 0.74, 0.06, 0.74, 0, 0.5 * h - 0.06, 0, '#7a4f2e'); };
  crate(3, 2, 1); crate(4, 2, 2); crate(3, 3, 1);
  const barrel = place(5, 1); cyl(barrel, 0.28, 0.6, 0, 0, 0, '#8a5a34', 10); cyl(barrel, 0.3, 0.05, 0, 0.18, 0, BRASS, 10); cyl(barrel, 0.3, 0.05, 0, 0.4, 0, BRASS, 10);
  const lamp = place(-8, -2); cyl(lamp, 0.05, 1.4, 0, 0, 0, STEEL_D, 6); box(lamp, 0.22, 0.22, 0.22, 0, 1.4, 0, '#ffe08a', '#ffc040');
  const lampLight = new THREE.PointLight(0xffc050, 2.5, 4); lampLight.position.set(-7.5, 1.6, -1.5); scene.add(lampLight);
}

// nuvens de voxel à deriva (fecham o loop)
const clouds: THREE.Group[] = [];
for (let n = 0; n < 3; n++) {
  const c = new THREE.Group();
  for (let k = 0; k < 7; k++) box(c, rand(1.4, 2.6), 0.5, rand(1, 1.8), rand(-1.6, 1.6), rand(0, 0.3), rand(-0.8, 0.8), '#ffffff');
  c.position.set(n === 0 ? -17 : n === 1 ? 15 : -4, rand(8, 10), n === 2 ? -16 : rand(-2, 6));
  c.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
  scene.add(c); clouds.push(c);
}
const cloudStart = clouds.map((c) => c.position.x);
anims.push((t) => clouds.forEach((c, k) => { c.position.x = cloudStart[k] + Math.sin(phase(t, 1) * TAU) * 2.4; }));

// ---------- câmera e laço de render ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(1 / PIXEL_SIZE);
  renderer.setSize(w, h, false);
  const half = Number(new URLSearchParams(location.search).get('zoom') ?? 5.6);
  Object.assign(camera, { left: -half * (w / h), right: half * (w / h), top: half, bottom: -half });
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function frame(t: number) {
  const a = 1.3 + 0.13 * Math.sin((t / LOOP) * TAU); // leve balanço da câmera
  camera.position.set(-2.5 + Math.cos(a) * 24, 17, 0.5 + Math.sin(a) * 24);
  camera.lookAt(-2.5, 0, 0.5);
  anims.forEach((fn) => fn(t));
  renderer.render(scene, camera);
}
(window as unknown as { __frame: (t: number) => void }).__frame = frame;
const t0 = performance.now();
const loop = (now: number) => { frame((now - t0) / 1000); requestAnimationFrame(loop); };
if (!new URLSearchParams(location.search).has('manual')) requestAnimationFrame(loop);
(window as unknown as { __ready: boolean }).__ready = true;
