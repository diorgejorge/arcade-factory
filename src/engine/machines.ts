import { FURNACE_RECIPE_BY_INPUT, RECIPES } from './data';
import type { BeltItem, Dir, Entity, ItemId, Recipe } from './types';
import { DX, DY, oppositeDir } from './types';

/** Contrato mínimo que as máquinas precisam do jogo (evita dependência circular). */
export interface World {
  entityAt(x: number, y: number): Entity | undefined;
  deliver(item: ItemId): void;
  isRecipeUnlocked(recipeId: string): boolean;
  readonly minerTicks: number;
}

export const BELT_SPEED = 0.06; // tiles por tick
export const BELT_SPACING = 0.34;
export const BELT_CAPACITY = 3;
const OUTPUT_CAP = 4;
const INPUT_BUFFER_FACTOR = 2;
export const MINER_TICKS = 30;
export const MINER_TICKS_BOOSTED = 20;

function placeOnBelt(belt: Entity, item: BeltItem): void {
  item.wx = belt.x + 0.5 + DX[belt.dir] * (item.pos - 0.5);
  item.wy = belt.y + 0.5 + DY[belt.dir] * (item.pos - 0.5);
}

function newItem(kind: ItemId, fromX: number, fromY: number): BeltItem {
  const cx = fromX + 0.5;
  const cy = fromY + 0.5;
  return { kind, pos: 0, wx: cx, wy: cy, pwx: cx, pwy: cy };
}

export function createEntity(id: number, kind: Entity['kind'], x: number, y: number, dir: Dir): Entity {
  return { id, kind, x, y, dir, belt: [], inputs: {}, outCount: 0, crafting: false, progress: 0 };
}

function currentRecipe(entity: Entity): Recipe | undefined {
  return entity.recipeId ? RECIPES[entity.recipeId] : undefined;
}

export function canAccept(world: World, target: Entity, kind: ItemId, travelDir: Dir): boolean {
  switch (target.kind) {
    case 'conveyor': {
      if (target.dir === oppositeDir(travelDir) || target.belt.length >= BELT_CAPACITY) return false;
      const last = target.belt[target.belt.length - 1];
      return !last || last.pos >= BELT_SPACING;
    }
    case 'hub':
      return true;
    case 'assembler': {
      const need = currentRecipe(target)?.inputs[kind];
      return need !== undefined && (target.inputs[kind] ?? 0) < need * INPUT_BUFFER_FACTOR;
    }
    case 'furnace': {
      const recipe = FURNACE_RECIPE_BY_INPUT[kind];
      if (!recipe || !world.isRecipeUnlocked(recipe.id)) return false;
      if (target.recipeId && target.recipeId !== recipe.id) return false;
      if (target.outCount > 0 && target.outItem !== recipe.output) return false;
      return (target.inputs[kind] ?? 0) < INPUT_BUFFER_FACTOR;
    }
    default:
      return false;
  }
}

function receive(world: World, target: Entity, item: BeltItem): void {
  switch (target.kind) {
    case 'conveyor':
      item.pos = 0;
      target.belt.push(item);
      placeOnBelt(target, item);
      break;
    case 'hub':
      world.deliver(item.kind);
      break;
    case 'furnace':
      target.recipeId ??= FURNACE_RECIPE_BY_INPUT[item.kind]?.id;
      target.inputs[item.kind] = (target.inputs[item.kind] ?? 0) + 1;
      break;
    case 'assembler':
      target.inputs[item.kind] = (target.inputs[item.kind] ?? 0) + 1;
      break;
  }
}

function pushOutput(world: World, entity: Entity): void {
  if (entity.outCount === 0 || !entity.outItem) return;
  const target = world.entityAt(entity.x + DX[entity.dir], entity.y + DY[entity.dir]);
  if (!target || !canAccept(world, target, entity.outItem, entity.dir)) return;
  receive(world, target, newItem(entity.outItem, entity.x, entity.y));
  entity.outCount--;
}

function stepConveyor(world: World, belt: Entity): void {
  const items = belt.belt;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    item.pwx = item.wx;
    item.pwy = item.wy;
    const limit = i === 0 ? 1 : items[i - 1].pos - BELT_SPACING;
    item.pos = Math.min(item.pos + BELT_SPEED, Math.max(limit, item.pos));
    placeOnBelt(belt, item);
  }
  const front = items[0];
  if (!front || front.pos < 1) return;
  const target = world.entityAt(belt.x + DX[belt.dir], belt.y + DY[belt.dir]);
  if (target && canAccept(world, target, front.kind, belt.dir)) {
    items.shift();
    receive(world, target, front);
  }
}

function stepMiner(world: World, miner: Entity): void {
  if (miner.outCount === 0 && miner.ore) {
    miner.progress++;
    if (miner.progress >= world.minerTicks) {
      miner.progress = 0;
      miner.outItem = miner.ore;
      miner.outCount = 1;
    }
  }
  pushOutput(world, miner);
}

function hasInputs(entity: Entity, recipe: Recipe): boolean {
  return Object.entries(recipe.inputs).every(([item, count]) => (entity.inputs[item as ItemId] ?? 0) >= count);
}

function stepCrafter(world: World, entity: Entity): void {
  const recipe = currentRecipe(entity);
  if (recipe) {
    const hasRoom = entity.outCount + recipe.outputCount <= OUTPUT_CAP;
    if (entity.crafting) {
      entity.progress++;
      if (entity.progress >= recipe.ticks && hasRoom) {
        entity.outItem = recipe.output;
        entity.outCount += recipe.outputCount;
        entity.crafting = false;
      }
    } else if (hasRoom && (entity.outCount === 0 || entity.outItem === recipe.output) && hasInputs(entity, recipe)) {
      for (const [item, count] of Object.entries(recipe.inputs)) entity.inputs[item as ItemId]! -= count;
      entity.crafting = true;
      entity.progress = 0;
    }
  }
  pushOutput(world, entity);
  // Fornalha ociosa libera a receita para aceitar outro minério.
  if (entity.kind === 'furnace' && !entity.crafting && Object.values(entity.inputs).every((n) => !n)) {
    entity.recipeId = undefined;
  }
}

export function stepEntity(world: World, entity: Entity): void {
  switch (entity.kind) {
    case 'conveyor':
      return stepConveyor(world, entity);
    case 'miner':
      return stepMiner(world, entity);
    case 'furnace':
    case 'assembler':
      return stepCrafter(world, entity);
  }
}
