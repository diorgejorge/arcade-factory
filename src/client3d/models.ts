import * as THREE from 'three';
import type { BuildingKind, Dir } from '../engine/types';

const TAU = Math.PI * 2;

/** Velocidades "amigáveis a loop": k voltas de passo de dente a cada LOOP_SECONDS. */
export const LOOP_SECONDS = 4;
const spin = (teeth: number, k: number) => ((TAU / teeth) * k) / LOOP_SECONDS;

const C = {
  brass: '#e0a63c', brassDark: '#a8702a', brassLight: '#f4cf72',
  copper: '#cf6d3c', copperDark: '#93401f',
  steel: '#9aa5b3', steelDark: '#5e6877', steelLight: '#c3ccd6',
  dark: '#2a2024', leather: '#4e372b', chevron: '#7a5842',
  fire: '#ff8a1f', glass: '#86cfcf', lamp: '#ffd24a',
};

export interface Model {
  group: THREE.Group;
  /** Avança a animação. `active` = a máquina está produzindo neste momento. */
  update(dt: number, active: boolean): void;
  /** Luz opcional (fornalha). Quem usa decide se a adiciona à cena. */
  light?: THREE.PointLight;
  /** Partículas de fumaça (soltas na cena para não girarem com a máquina). */
  effects?: THREE.Object3D[];
}

// ---------- primitivas ----------
const materials = new Map<string, THREE.MeshLambertMaterial>();
function material(hex: string, emissive?: string): THREE.MeshLambertMaterial {
  const key = hex + (emissive ?? '');
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...(emissive ? { emissive, emissiveIntensity: 1 } : {}) });
    materials.set(key, m);
  }
  return m;
}

function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, hex: string, emissive?: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(hex, emissive));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cyl(parent: THREE.Object3D, r: number, h: number, x: number, y: number, z: number, hex: string, seg = 12): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material(hex));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function makeGear(r: number, teeth: number, hex: string, thick = 0.09): THREE.Group {
  const g = new THREE.Group();
  cyl(g, r, thick, 0, 0, 0, hex, 14);
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * TAU;
    const tooth = box(g, r * 0.42, thick, r * 0.3, Math.cos(a) * r * 1.12, 0, Math.sin(a) * r * 1.12, hex);
    tooth.rotation.y = -a;
  }
  cyl(g, r * 0.28, thick + 0.04, 0, 0, 0, C.brass);
  return g;
}

const rivets = (parent: THREE.Object3D, points: [number, number, number][], size = 0.035) =>
  points.forEach(([x, y, z]) => box(parent, size, size, size, x, y, z, C.brassLight));

function spout(parent: THREE.Object3D, y = 0.1) {
  box(parent, 0.2, 0.12, 0.26, 0.5, y, 0, C.brass);
  box(parent, 0.08, 0.08, 0.2, 0.62, y + 0.02, 0, C.dark);
}

// ---------- modelos (saída sempre para +x; o grupo externo gira conforme a direção) ----------

function miner(): Model {
  const g = new THREE.Group();
  box(g, 0.98, 0.1, 0.98, 0, 0, 0, C.steelDark);
  box(g, 1, 0.04, 1, 0, 0.1, 0, C.brassDark);
  for (const [x, z] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]]) {
    const leg = box(g, 0.07, 1.05, 0.07, x * 0.82, 0.14, z * 0.82, C.steel);
    leg.rotation.set(-z * 0.18, 0, x * 0.18);
  }
  for (const y of [0.32, 0.62, 0.9]) {
    const s = 0.72 - y * 0.22;
    box(g, s * 2, 0.045, 0.045, 0, y, -s, C.steel); box(g, s * 2, 0.045, 0.045, 0, y, s, C.steel);
    box(g, 0.045, 0.045, s * 2, -s, y, 0, C.steel); box(g, 0.045, 0.045, s * 2, s, y, 0, C.steel);
  }
  box(g, 0.5, 0.26, 0.5, 0, 1.0, 0, C.steelDark);
  box(g, 0.56, 0.06, 0.56, 0, 1.26, 0, C.brass);
  rivets(g, [[-0.22, 1.3, -0.22], [0.22, 1.3, -0.22], [-0.22, 1.3, 0.22], [0.22, 1.3, 0.22]]);

  const rod = new THREE.Group(); rod.position.y = 0.14; g.add(rod);
  cyl(rod, 0.075, 1.0, 0, 0, 0, C.copper, 8);
  for (let k = 0; k < 7; k++) { const b = box(rod, 0.22, 0.05, 0.07, 0, 0.08 + k * 0.13, 0, C.steelLight); b.rotation.y = k * 0.85; }
  const topGear = makeGear(0.17, 10, C.steelLight); topGear.position.set(0, 1.32, 0); g.add(topGear);

  const tank = cyl(g, 0.17, 0.5, 0.28, 0.2, 0.34, C.copper, 12); tank.rotation.z = Math.PI / 2; tank.position.set(0.3, 0.38, 0.34);
  cyl(g, 0.185, 0.05, 0.1, 0.38, 0.34, C.brass, 12).rotation.z = Math.PI / 2;
  box(g, 0.06, 0.5, 0.06, 0.05, 0.4, 0.34, C.steelDark);
  const piston = box(g, 0.07, 0.3, 0.07, -0.34, 0.55, 0.34, C.steelLight);
  box(g, 0.16, 0.3, 0.16, -0.34, 0.14, 0.34, C.copperDark);
  for (const [x, z] of [[-0.3, 0.1], [0.1, -0.4], [0.35, -0.1]]) box(g, 0.14, 0.1, 0.12, x, 0.14, z, '#8f9cac');
  spout(g, 0.14);

  const root = new THREE.Group(); root.add(g);
  let t = 0;
  return {
    group: root,
    update(dt, active) {
      const speed = active ? 1 : 0.15;
      t += dt * speed;
      rod.rotation.y = -t * TAU * 0.75;
      topGear.rotation.y = t * spin(10, 5);
      piston.position.y = 0.44 + 0.14 + Math.sin((t / LOOP_SECONDS) * TAU * 4) * 0.08;
    },
  };
}

function furnace(): Model {
  const g = new THREE.Group();
  box(g, 0.98, 0.14, 0.98, 0, 0, 0, C.steelDark);
  cyl(g, 0.38, 0.7, 0, 0.14, 0, C.copper, 14);
  for (const y of [0.26, 0.56, 0.8]) cyl(g, 0.405, 0.05, 0, y, 0, C.brass, 14);
  cyl(g, 0.3, 0.12, 0, 0.84, 0, C.copperDark, 14);
  cyl(g, 0.1, 0.1, 0, 0.96, 0, C.brass, 10);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; box(g, 0.035, 0.035, 0.035, Math.cos(a) * 0.4, 0.58, Math.sin(a) * 0.4, C.brassLight); }
  // caldeira lateral + canos
  cyl(g, 0.16, 0.46, -0.3, 0.14, 0.36, C.steel, 12);
  cyl(g, 0.175, 0.05, -0.3, 0.4, 0.36, C.brass, 12);
  box(g, 0.34, 0.06, 0.06, -0.1, 0.62, 0.3, C.steelDark);
  box(g, 0.06, 0.34, 0.06, -0.26, 0.4, 0.3, C.steelDark);
  // chaminé alta
  cyl(g, 0.1, 0.78, 0.16, 0.7, -0.26, C.steel, 8);
  cyl(g, 0.14, 0.07, 0.16, 1.44, -0.26, C.brass, 8);
  // porta do fogo
  box(g, 0.06, 0.3, 0.36, 0.4, 0.2, 0, C.brassDark);
  const flame = box(g, 0.05, 0.22, 0.28, 0.43, 0.24, 0, C.fire, '#ff7a10');
  // manômetro
  const gauge = cyl(g, 0.085, 0.05, 0.18, 0.62, 0.36, C.brass, 12); gauge.rotation.x = Math.PI / 2;
  cyl(g, 0.065, 0.055, 0.18, 0.625, 0.363, C.glass, 12).rotation.x = Math.PI / 2;
  spout(g, 0.1);

  const light = new THREE.PointLight(0xff8a2a, 5, 5);
  light.position.set(0.8, 0.5, 0);
  const puffs = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: '#eef3f6', transparent: true }));
    m.castShadow = false;
    return m;
  });
  const root = new THREE.Group(); root.add(g);
  let t = 0; let smokeT = 0;
  return {
    group: root,
    light,
    effects: puffs,
    update(dt, active) {
      t += dt; smokeT += dt * (active ? 1 : 0.4);
      const flick = active ? 0.8 + 0.2 * Math.sin((t / LOOP_SECONDS) * TAU * 6) + 0.08 * Math.sin((t / LOOP_SECONDS) * TAU * 13) : 0.25;
      light.intensity = 5 * flick;
      (flame.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.35 + 0.65 * flick;
      root.updateWorldMatrix(true, false);
      const origin = new THREE.Vector3(0.16, 1.5, -0.26).applyMatrix4(root.matrixWorld);
      puffs.forEach((p, k) => {
        const u = ((smokeT / LOOP_SECONDS) * 2 + k / 8) % 1;
        p.position.set(origin.x + u * 1.2 + Math.sin(u * 7 + k) * 0.1, origin.y + u * 2.6, origin.z + Math.sin(u * 5 + k * 2) * 0.1);
        p.scale.setScalar(0.5 + u * 1.7); p.rotation.y = u * 2;
        (p.material as THREE.MeshLambertMaterial).opacity = (active ? 0.85 : 0.35) * (1 - u) ** 1.3;
      });
    },
  };
}

function assembler(): Model {
  const g = new THREE.Group();
  box(g, 0.98, 0.1, 0.98, 0, 0, 0, C.steelDark);
  box(g, 0.94, 0.44, 0.94, 0, 0.1, 0, C.brass);
  box(g, 0.96, 0.05, 0.96, 0, 0.3, 0, C.brassDark);
  rivets(g, [[-0.4, 0.5, -0.4], [0.4, 0.5, -0.4], [-0.4, 0.5, 0.4], [0.4, 0.5, 0.4]]);
  box(g, 0.78, 0.05, 0.78, 0, 0.54, 0, C.dark);
  const g1 = makeGear(0.27, 10, C.steelLight); g1.position.set(-0.14, 0.6, -0.12); g.add(g1);
  const g2 = makeGear(0.165, 6, C.copper); g2.position.set(0.22, 0.6, 0.08); g.add(g2);
  // volante lateral
  const fly = new THREE.Group(); fly.position.set(0, 0.34, 0.5); g.add(fly);
  cyl(fly, 0.2, 0.06, 0, 0, 0, C.steel, 14).rotation.x = Math.PI / 2;
  for (let k = 0; k < 3; k++) { const sp = box(fly, 0.4, 0.05, 0.05, 0, 0, 0.03, C.brassDark); sp.rotation.z = (k * Math.PI) / 3; }
  // braço robótico
  box(g, 0.12, 0.45, 0.12, -0.36, 0.54, 0.36, C.brassDark);
  const arm1 = new THREE.Group(); arm1.position.set(-0.36, 1.0, 0.36); g.add(arm1);
  box(arm1, 0.46, 0.08, 0.08, 0.23, 0, 0, C.steelLight);
  const arm2 = new THREE.Group(); arm2.position.set(0.46, 0.04, 0); arm1.add(arm2);
  box(arm2, 0.38, 0.07, 0.07, 0.19, 0, 0, C.steel); box(arm2, 0.09, 0.12, 0.14, 0.4, -0.05, 0, C.copper);
  // chaminé de vapor e lâmpada
  cyl(g, 0.07, 0.4, 0.36, 0.54, -0.36, C.steel, 8); cyl(g, 0.1, 0.05, 0.36, 0.94, -0.36, C.brass, 8);
  const lamp = box(g, 0.13, 0.13, 0.13, 0.36, 0.54, 0.36, C.lamp, '#ffb020');
  spout(g, 0.12);

  const root = new THREE.Group(); root.add(g);
  let t = 0;
  return {
    group: root,
    update(dt, active) {
      t += dt * (active ? 1 : 0.1);
      g1.rotation.y = t * spin(10, 5);
      g2.rotation.y = -t * spin(10, 5) * (10 / 6) + TAU / 12;
      fly.rotation.z = t * spin(3, 4);
      arm1.rotation.y = -0.9 + 0.5 * Math.sin((t / LOOP_SECONDS) * TAU);
      arm2.rotation.y = 0.9 * Math.cos((t / LOOP_SECONDS) * TAU);
      lamp.scale.setScalar(active && ((t / LOOP_SECONDS) * 2) % 1 < 0.5 ? 1.2 : 0.8);
    },
  };
}

function hub(): Model {
  const g = new THREE.Group();
  box(g, 0.98, 0.66, 0.98, 0, 0, 0, C.steelDark);
  box(g, 1.02, 0.08, 1.02, 0, 0.62, 0, C.brass);
  box(g, 1.02, 0.06, 1.02, 0, 0.04, 0, C.brassDark);
  rivets(g, [[-0.44, 0.72, -0.44], [0.44, 0.72, -0.44], [-0.44, 0.72, 0.44], [0.44, 0.72, 0.44]]);
  // roda do cofre
  const wheel = new THREE.Group(); wheel.position.set(0.05, 0.7, 0.12); g.add(wheel);
  cyl(wheel, 0.3, 0.06, 0, 0, 0, C.brass, 16); cyl(wheel, 0.24, 0.08, 0, 0, 0, C.steel, 16);
  for (let k = 0; k < 4; k++) { const sp = box(wheel, 0.52, 0.05, 0.06, 0, 0.06, 0, C.brass); sp.rotation.y = (k * Math.PI) / 4; }
  cyl(wheel, 0.07, 0.1, 0, 0.04, 0, C.brassLight, 8);
  // funil de entrada
  for (let k = 0; k < 3; k++) box(g, 0.5 - k * 0.12, 0.07, 0.5 - k * 0.12, -0.2, 0.7 + k * 0.07, -0.26, C.brass);
  box(g, 0.2, 0.05, 0.2, -0.2, 0.9, -0.26, C.dark);
  const coins = Array.from({ length: 3 }, (_, k) => box(g, 0.06, 0.02, 0.06, -0.2 + (k - 1) * 0.05, 0.9, -0.26, '#ffe27a', '#ffc040'));
  // portinhola
  box(g, 0.04, 0.3, 0.3, 0.49, 0.18, 0, C.brassDark);

  const root = new THREE.Group(); root.add(g);
  let t = 0;
  return {
    group: root,
    update(dt, active) {
      t += dt;
      wheel.rotation.y = (active ? 1 : 0.2) * t * spin(4, 1);
      coins.forEach((c, k) => { const u = ((t / LOOP_SECONDS) * 2 + k / 3) % 1; c.position.y = 0.91 + (active ? Math.sin(u * Math.PI) * 0.12 : 0); c.visible = active || k === 0; });
    },
  };
}

function conveyor(): Model {
  const g = new THREE.Group();
  box(g, 1, 0.14, 0.12, 0, 0, -0.42, C.steel); box(g, 1, 0.14, 0.12, 0, 0, 0.42, C.steel);
  box(g, 1, 0.08, 0.72, 0, 0, 0, C.leather);
  for (let k = 0; k < 6; k++) box(g, 0.06, 0.02, 0.06, -0.4 + (k % 2) * 0.8, 0.14, k < 3 ? -0.42 : 0.42, C.brass);
  const chevrons = Array.from({ length: 4 }, () => {
    const c = new THREE.Group();
    for (const s of [-1, 1]) { const arm = box(c, 0.26, 0.02, 0.06, -0.06, 0.08, s * 0.1, C.chevron); arm.rotation.y = s * 0.7; }
    g.add(c);
    return c;
  });
  let t = 0;
  const root = new THREE.Group(); root.add(g);
  return {
    group: root,
    update(dt, active) {
      t += dt * (active ? 1 : 0);
      chevrons.forEach((c, k) => { c.position.x = ((k / 4 + (t / LOOP_SECONDS) * 8) % 1) - 0.5; });
    },
  };
}

/** Junção: cruzamento de trilhos de aço com tampa de latão. */
function junction(): Model {
  const g = new THREE.Group();
  box(g, 1, 0.14, 0.3, 0, 0, 0, C.steel);
  box(g, 0.3, 0.14, 1, 0, 0, 0, C.steel);
  box(g, 0.52, 0.06, 0.52, 0, 0.14, 0, C.steelDark);
  cyl(g, 0.17, 0.1, 0, 0.2, 0, C.brass, 12);
  rivets(g, [[-0.4, 0.14, -0.1], [0.4, 0.14, 0.1], [-0.1, 0.14, 0.4], [0.1, 0.14, -0.4]], 0.045);
  const root = new THREE.Group(); root.add(g);
  return { group: root, update() {} };
}

/** Roteador: caixa de latão com engrenagem girando que reparte os itens. */
function router(): Model {
  const g = new THREE.Group();
  box(g, 0.9, 0.2, 0.9, 0, 0, 0, C.brassDark);
  box(g, 0.76, 0.06, 0.76, 0, 0.2, 0, C.dark);
  const cog = makeGear(0.28, 8, C.brassLight, 0.08); cog.position.set(0, 0.26, 0); g.add(cog);
  for (const [x, z, w, d] of [[0.44, 0, 0.14, 0.26], [0, 0.44, 0.26, 0.14], [0, -0.44, 0.26, 0.14]] as const) box(g, w, 0.1, d, x, 0.2, z, C.steel);
  let t = 0;
  const root = new THREE.Group(); root.add(g);
  return { group: root, update(dt, active) { t += dt * (active ? 1 : 0.2); cog.rotation.y = t * spin(8, 4); } };
}

const BUILDERS: Record<BuildingKind, () => Model> = { miner, furnace, assembler, hub, conveyor, junction, router };

/** Cria o modelo de um prédio já voltado para a direção `dir` (0 = leste, 1 = sul, 2 = oeste, 3 = norte). */
export function createModel(kind: BuildingKind, dir: Dir): Model {
  const model = BUILDERS[kind]();
  model.group.rotation.y = -dir * (Math.PI / 2);
  return model;
}
