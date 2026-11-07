import * as THREE from 'three';
import { BUILDING_SIZE } from '../engine/data';
import { createRng } from '../engine/rng';
import type { Game } from '../engine/sim';
import type { BuildingKind, Dir, Entity, ItemId } from '../engine/types';
import { DX, DY } from '../engine/types';
import { Tile } from '../engine/world';
import { createModel, type Model } from './models';

const PIXEL_SIZE = 2; // cada pixel renderizado vira 2x2 na tela
const K = 4; // voxels por tile
const S = 1 / K;
const MAX_ITEMS = 4096;
const CAMERA_AZIMUTH = 1.3;
const CAMERA_RADIUS = 24;
const CAMERA_HEIGHT = 17;
const ZOOM_MIN = 4;
const ZOOM_MAX = 16;

const ITEM_COLOR: Record<ItemId, string> = {
  iron_ore: '#a8b6c8', copper_ore: '#e0804a', iron_plate: '#dbe4ee', copper_plate: '#f5ae74',
  gear: '#c3cdd9', wire: '#f0bb55', circuit: '#55d99a', motor: '#ef6b80',
};
const GRASS = ['#5fae3e', '#6cba45', '#58a238'];
const DIRT = ['#8a5a34', '#7a4f2e', '#6b4529', '#5e3d26', '#523422', '#46302a'];
const ORE = { [Tile.Iron]: ['#7c8794', '#6c7784', '#98a4b2'], [Tile.Copper]: ['#b86a3a', '#a65d31', '#d6844a'] } as const;
const ROCK = ['#8f959e', '#7a808a', '#a6abb3'];

export interface Ghost {
  kind: BuildingKind;
  x: number;
  y: number;
  dir: Dir;
  valid: boolean;
}

/** Ilha em voxels (um único InstancedMesh). Zonas ainda bloqueadas ficam escurecidas. */
function buildTerrain(game: Game) {
  const { width: W, height: H, tiles, zones } = game.terrain;
  const rng = createRng(game.seed ^ 0x51ed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rng() * list.length)];
  const VW = W * K;
  const VH = H * K;

  // distância de cada tile ao vazio: define a espessura do penhasco
  const dist = new Int16Array(W * H).fill(-1);
  const queue: number[] = [];
  tiles.forEach((tile, i) => { if (tile === Tile.Void) { dist[i] = 0; queue.push(i); } });
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = (i % W) + dx, ny = Math.floor(i / W) + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || dist[ny * W + nx] >= 0) continue;
      dist[ny * W + nx] = dist[i] + 1;
      queue.push(ny * W + nx);
    }
  }
  const tileOf = (i: number, j: number) => Math.floor(j / K) * W + Math.floor(i / K);
  const depth = new Int16Array(VW * VH);
  for (let j = 0; j < VH; j++) {
    for (let i = 0; i < VW; i++) {
      const t = tileOf(i, j);
      if (tiles[t] !== Tile.Void) depth[j * VW + i] = Math.max(2, Math.round(2 + 14 * Math.min(1, (dist[t] - 1) / 6) ** 0.8 + rng() * 2 - 1));
    }
  }
  const lowest = (i: number, j: number) => (i < 0 || j < 0 || i >= VW || j >= VH || depth[j * VW + i] === 0 ? 1 : -depth[j * VW + i]);

  const positions: number[] = [];
  const colors: THREE.Color[] = [];
  const voxelZone: number[] = [];
  const add = (i: number, vy: number, j: number, hex: string, jitter: number, zone: number) => {
    positions.push((i + 0.5) * S - W / 2, (vy - 0.5) * S, (j + 0.5) * S - H / 2);
    colors.push(new THREE.Color(hex).offsetHSL(0, 0, (rng() - 0.5) * jitter * 2));
    voxelZone.push(zone);
  };

  for (let j = 0; j < VH; j++) {
    for (let i = 0; i < VW; i++) {
      const d = depth[j * VW + i];
      if (!d) continue;
      const t = tileOf(i, j);
      const tile = tiles[t];
      const exposedBelow = Math.max(lowest(i + 1, j), lowest(i - 1, j), lowest(i, j + 1), lowest(i, j - 1));
      for (let vy = 0; vy >= -d; vy--) {
        if (vy !== 0 && vy !== -d && vy >= exposedBelow) continue;
        const hex = vy === 0
          ? (tile === Tile.Iron || tile === Tile.Copper ? pick(ORE[tile]) : pick(GRASS))
          : rng() < 0.07 + -vy * 0.006 ? '#7d7f86' : DIRT[Math.min(DIRT.length - 1, Math.floor(-vy / 3))];
        add(i, vy, j, hex, 0.06, zones[t]);
      }
    }
  }

  // obstáculos: pedras e árvores por cima do chão (sem recorte de faces ocultas)
  for (let t = 0; t < W * H; t++) {
    const [tx, ty] = [t % W, Math.floor(t / W)];
    if (tiles[t] === Tile.Rock) {
      for (let dj = 0; dj < K; dj++) for (let di = 0; di < K; di++) {
        const corner = (di === 0 || di === K - 1) && (dj === 0 || dj === K - 1);
        if (corner && rng() < 0.6) continue;
        for (let vy = 1; vy <= 1 + Math.floor(rng() * 3); vy++) add(tx * K + di, vy, ty * K + dj, pick(ROCK), 0.06, zones[t]);
      }
    } else if (tiles[t] === Tile.Tree) {
      const ci = tx * K + K / 2 - 1, cj = ty * K + K / 2 - 1;
      for (let vy = 1; vy <= 3; vy++) for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) add(ci + a, vy, cj + b, '#6b4423', 0.05, zones[t]);
      const rows = rng() < 0.6 ? [2, 2, 1, 1, 0] : [1, 2, 2, 1];
      rows.forEach((r, level) => {
        for (let dz = -r; dz <= r + 1; dz++) for (let dx = -r; dx <= r + 1; dx++) {
          if (Math.hypot(dx - 0.5, dz - 0.5) <= r + 0.7) add(ci + dx, 3 + level, cj + dz, pick(['#2f8a3e', '#37994a', '#287a35']), 0.07, zones[t]);
        }
      });
    }
  }

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(S, S, S), new THREE.MeshLambertMaterial(), colors.length);
  const m = new THREE.Matrix4();
  colors.forEach((_, n) => { m.setPosition(positions[n * 3], positions[n * 3 + 1], positions[n * 3 + 2]); mesh.setMatrixAt(n, m); });
  mesh.castShadow = mesh.receiveShadow = true;
  const tint = new THREE.Color();
  const applyZones = (unlocked: number) => {
    colors.forEach((color, n) => mesh.setColorAt(n, voxelZone[n] > unlocked ? tint.copy(color).multiplyScalar(0.38) : color));
    mesh.instanceColor!.needsUpdate = true;
  };
  return { mesh, applyZones };
}

export function createWorld3D(canvas: HTMLCanvasElement, game: Game) {
  const { width: W, height: H } = game.terrain;
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
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, new THREE.HemisphereLight(0xa9d4ff, 0x7a6248, 1.15));

  const terrain = buildTerrain(game);
  scene.add(terrain.mesh);
  let shownZone = game.unlockedZone;
  terrain.applyZones(shownZone);

  // ---------- câmera ----------
  const target = new THREE.Vector3();
  let half = 8; // meia altura visível, em tiles
  const forward = new THREE.Vector3(-Math.cos(CAMERA_AZIMUTH), 0, -Math.sin(CAMERA_AZIMUTH));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const updateCamera = () => {
    target.x = THREE.MathUtils.clamp(target.x, -W / 2, W / 2);
    target.z = THREE.MathUtils.clamp(target.z, -H / 2, H / 2);
    camera.position.set(target.x + Math.cos(CAMERA_AZIMUTH) * CAMERA_RADIUS, CAMERA_HEIGHT, target.z + Math.sin(CAMERA_AZIMUTH) * CAMERA_RADIUS);
    camera.lookAt(target);
  };
  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(1 / PIXEL_SIZE);
    renderer.setSize(w, h, false);
    Object.assign(camera, { left: -half * (w / h), right: half * (w / h), top: half, bottom: -half });
    camera.updateProjectionMatrix();
    updateCamera();
  };
  resize();

  // ---------- entidades ----------
  const models = new Map<number, Model>();
  const machineOf = new Map<THREE.Object3D, number>();
  const activeOf = (entity: Entity, scoring: boolean): boolean => {
    switch (entity.kind) {
      case 'miner': return entity.outCount === 0;
      case 'furnace': case 'assembler': return entity.crafting;
      case 'hub': return scoring;
      default: return entity.belt.length > 0;
    }
  };
  const dropModel = (id: number) => {
    const model = models.get(id)!;
    [model.group, ...(model.effects ?? [])].forEach((object) => {
      scene.remove(object);
      object.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    });
    machineOf.delete(model.group);
    models.delete(id);
  };

  const itemMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), new THREE.MeshLambertMaterial(), MAX_ITEMS);
  itemMesh.castShadow = true;
  itemMesh.frustumCulled = false;
  scene.add(itemMesh);
  const itemColors = Object.fromEntries(Object.entries(ITEM_COLOR).map(([k, hex]) => [k, new THREE.Color(hex)])) as Record<ItemId, THREE.Color>;
  const m4 = new THREE.Matrix4();

  // ---------- fantasma de construção e seleção ----------
  const ghostBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45 }));
  const ghostArrow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.26), new THREE.MeshBasicMaterial({ color: '#f5b942' }));
  ghostBox.visible = ghostArrow.visible = false;
  const selection = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: '#f5b942' }));
  selection.visible = false;
  scene.add(ghostBox, ghostArrow, selection);
  const centerOf = (x: number, y: number, size: number) => new THREE.Vector3(x + size / 2 - W / 2, 0, y + size / 2 - H / 2);

  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let lastScore = game.score;
  let lastScoreAt = 0;

  return {
    resize,

    /** Tile sob o cursor (no chão) e a máquina sob o cursor (se houver). */
    pick(clientX: number, clientY: number): { tile: { x: number; y: number }; entity?: Entity } {
      raycaster.setFromCamera(new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1), camera);
      const point = raycaster.ray.intersectPlane(ground, new THREE.Vector3()) ?? target;
      const tile = { x: Math.floor(point.x + W / 2), y: Math.floor(point.z + H / 2) };
      const hit = raycaster.intersectObjects([...models.values()].map((model) => model.group), true)[0];
      let node: THREE.Object3D | null = hit?.object ?? null;
      while (node && !machineOf.has(node)) node = node.parent;
      const id = node ? machineOf.get(node) : undefined;
      return { tile, entity: id === undefined ? undefined : game.entities.find((e) => e.id === id) };
    },

    panKeys(keys: ReadonlySet<string>, seconds: number): void {
      const axis = (positive: string[], negative: string[]) => Number(positive.some((k) => keys.has(k))) - Number(negative.some((k) => keys.has(k)));
      const speed = 14 * seconds;
      target.addScaledVector(forward, axis(['w', 'arrowup'], ['s', 'arrowdown']) * speed);
      target.addScaledVector(right, axis(['d', 'arrowright'], ['a', 'arrowleft']) * speed);
      updateCamera();
    },

    /** Arrastar com o botão do meio: converte pixels da tela em tiles do chão. */
    panDrag(dxPixels: number, dyPixels: number): void {
      const perPixel = (2 * half) / window.innerHeight;
      target.addScaledVector(right, -dxPixels * perPixel);
      target.addScaledVector(forward, dyPixels * perPixel * (CAMERA_RADIUS / CAMERA_HEIGHT));
      updateCamera();
    },

    /** Centra a câmera no tile (x, y). */
    focus(x: number, y: number): void {
      target.set(x + 0.5 - W / 2, 0, y + 0.5 - H / 2);
      updateCamera();
    },

    zoom(wheelDelta: number): void {
      half = THREE.MathUtils.clamp(half * (wheelDelta < 0 ? 1 / 1.15 : 1.15), ZOOM_MIN, ZOOM_MAX);
      resize();
    },

    setGhost(ghost: Ghost | null): void {
      ghostBox.visible = ghostArrow.visible = ghost !== null;
      if (!ghost) return;
      const size = BUILDING_SIZE[ghost.kind];
      const center = centerOf(ghost.x, ghost.y, size);
      ghostBox.position.set(center.x, 0.15, center.z);
      ghostBox.scale.set(size, 0.3, size);
      (ghostBox.material as THREE.MeshBasicMaterial).color.set(ghost.valid ? '#5fd38d' : '#ff4d4d');
      ghostArrow.position.set(center.x + DX[ghost.dir] * (size / 2 - 0.1), 0.3, center.z + DY[ghost.dir] * (size / 2 - 0.1));
      ghostArrow.visible = ['miner', 'conveyor', 'furnace', 'assembler'].includes(ghost.kind);
    },

    setSelected(entity: Entity | null): void {
      selection.visible = entity !== null;
      if (!entity) return;
      const center = centerOf(entity.x, entity.y, entity.size);
      selection.position.set(center.x, 0.7, center.z);
      selection.scale.set(entity.size, 1.4, entity.size);
    },

    /** `alpha` interpola o desenho entre ticks; `seconds` já vem multiplicado pela velocidade do jogo. */
    render(alpha: number, seconds: number): void {
      if (game.unlockedZone !== shownZone) {
        shownZone = game.unlockedZone;
        terrain.applyZones(shownZone);
      }
      const now = performance.now();
      if (game.score !== lastScore) { lastScore = game.score; lastScoreAt = now; }
      const scoring = now - lastScoreAt < 1000;

      const alive = new Set<number>();
      let itemCount = 0;
      for (const entity of game.entities) {
        alive.add(entity.id);
        let model = models.get(entity.id);
        if (!model) {
          model = createModel(entity.kind, entity.dir, entity.mk);
          model.group.position.copy(centerOf(entity.x, entity.y, entity.size));
          model.group.scale.setScalar(entity.size);
          scene.add(model.group, ...(model.effects ?? []));
          machineOf.set(model.group, entity.id);
          models.set(entity.id, model);
        }
        model.group.rotation.y = -entity.dir * (Math.PI / 2);
        model.update(seconds, activeOf(entity, scoring));
        for (const item of entity.belt) {
          if (itemCount >= MAX_ITEMS) break;
          m4.setPosition(item.pwx + (item.wx - item.pwx) * alpha - W / 2, 0.25, item.pwy + (item.wy - item.pwy) * alpha - H / 2);
          itemMesh.setMatrixAt(itemCount, m4);
          itemMesh.setColorAt(itemCount, itemColors[item.kind]);
          itemCount++;
        }
      }
      for (const id of [...models.keys()]) if (!alive.has(id)) dropModel(id);
      itemMesh.count = itemCount;
      itemMesh.instanceMatrix.needsUpdate = true;
      if (itemMesh.instanceColor) itemMesh.instanceColor.needsUpdate = true;
      renderer.render(scene, camera);
    },
  };
}

export type World3D = ReturnType<typeof createWorld3D>;
