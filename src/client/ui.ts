import {
  BUILDING_LABEL,
  BUILDING_ORDER,
  ITEM_IDS,
  ITEM_LABEL,
  ITEM_VALUE,
  RECIPES,
  RECIPE_LABEL,
  TECHS,
} from '../engine/data';
import { TICK_RATE, type Game } from '../engine/sim';
import type { BuildingKind, Entity, ItemCounts, ItemId } from '../engine/types';
import { iconFor } from './sprites';

export interface UiState {
  tool: BuildingKind | null;
  selected: Entity | null;
  speed: number;
}

export interface UiActions {
  selectTool(kind: BuildingKind | null): void;
  setSpeed(speed: number): void;
}

export const SPEEDS = [0, 1, 2, 4] as const;
const DEFAULT_HINT = 'Botão esquerdo: construir · direito: remover · WASD: mover · roda: zoom · R: girar · Q: cancelar';

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

function formatCost(cost: ItemCounts, game: Game): HTMLElement {
  const line = el('div', 'cost');
  Object.entries(cost).forEach(([item, count], index) => {
    const have = game.inventory[item as ItemId];
    line.append(index ? ', ' : '', el('span', have < count ? 'short' : '', `${have}/${count} ${ITEM_LABEL[item as ItemId]}`));
  });
  return line;
}

function formatTime(ticks: number): string {
  const seconds = Math.floor(ticks / TICK_RATE);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Reconstrói um container apenas quando a assinatura muda, evitando perder foco/cliques. */
function syncSection(container: HTMLElement, signature: string, build: () => Child[]): void {
  if (container.dataset.sig === signature) return;
  container.dataset.sig = signature;
  container.replaceChildren(...build());
}

export function createUi(game: Game, state: UiState, actions: UiActions) {
  const hud = document.getElementById('hud')!;
  const toolbar = document.getElementById('toolbar')!;
  const side = document.getElementById('side')!;
  const hintBar = document.getElementById('hint')!;

  const scoreValue = el('b');
  const timeValue = el('span');
  const speedButtons = SPEEDS.map((speed) => {
    const button = el('button', '', speed === 0 ? '⏸' : `x${speed}`);
    button.onclick = () => actions.setSpeed(speed);
    return button;
  });
  hud.append(el('span', '', 'Pontos ', scoreValue), el('span', '', 'Tempo ', timeValue), el('span', '', ...speedButtons));

  const inventorySection = el('section');
  const researchSection = el('section');
  const selectionSection = el('section');
  side.append(inventorySection, researchSection, selectionSection);

  let hintTimer = 0;
  const showHint = (text: string) => {
    hintBar.textContent = text;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => (hintBar.textContent = DEFAULT_HINT), 2500);
  };
  hintBar.textContent = DEFAULT_HINT;

  function buildToolbar(): Child[] {
    return BUILDING_ORDER.map((kind, index) => {
      const unlocked = game.isBuildingUnlocked(kind);
      const button = el('button', `tool${state.tool === kind ? ' active' : ''}`, iconFor(kind), el('span', '', unlocked ? BUILDING_LABEL[kind] : `🔒 ${BUILDING_LABEL[kind]}`), el('kbd', '', String(index + 1)));
      button.disabled = !unlocked;
      button.onclick = () => actions.selectTool(state.tool === kind ? null : kind);
      return button;
    });
  }

  function buildInventory(): Child[] {
    const rows = ITEM_IDS.filter((item) => game.inventory[item] > 0).map((item) =>
      el('div', 'row', el('span', '', ITEM_LABEL[item]), el('span', 'muted', `${game.inventory[item]} · ${ITEM_VALUE[item]} pts`)),
    );
    return [el('h3', '', 'Central (estoque)'), ...(rows.length ? rows : [el('div', 'muted', 'Entregue itens na Central.')])];
  }

  function buildResearch(): Child[] {
    const cards = TECHS.map((tech) => {
      const done = game.researched.has(tech.id);
      const available = !tech.requires || game.researched.has(tech.requires);
      const button = el('button', '', done ? 'Concluída' : 'Pesquisar');
      button.disabled = done || !game.canResearch(tech.id);
      button.onclick = () => game.research(tech.id);
      return el('div', `tech${done ? ' done' : ''}`, el('b', '', tech.name), done ? '' : available ? formatCost(tech.cost, game) : el('div', 'muted', 'Requer outra pesquisa'), button);
    });
    return [el('h3', '', 'Pesquisa'), ...cards];
  }

  function buildSelection(): Child[] {
    const entity = state.selected;
    if (!entity) return [];
    const nodes: Child[] = [el('h3', '', BUILDING_LABEL[entity.kind])];
    if (entity.kind === 'assembler') {
      const select = el('select');
      Object.values(RECIPES)
        .filter((recipe) => recipe.machine === 'assembler' && game.isRecipeUnlocked(recipe.id))
        .forEach((recipe) => select.append(new Option(RECIPE_LABEL[recipe.id], recipe.id, false, recipe.id === entity.recipeId)));
      select.onchange = () => game.setRecipe(entity.x, entity.y, select.value);
      nodes.push(el('div', 'muted', 'Receita'), select);
    } else {
      nodes.push(el('div', 'muted', 'R gira a máquina.'));
    }
    return nodes;
  }

  function refresh(): void {
    scoreValue.textContent = Math.floor(game.score).toLocaleString('pt-BR');
    timeValue.textContent = formatTime(game.tick);
    speedButtons.forEach((button, i) => button.classList.toggle('active', SPEEDS[i] === state.speed));

    syncSection(toolbar, `${state.tool}|${BUILDING_ORDER.map((k) => +game.isBuildingUnlocked(k)).join('')}`, buildToolbar);
    syncSection(inventorySection, JSON.stringify(game.inventory), buildInventory);
    const researchSig = TECHS.map((t) => `${+game.researched.has(t.id)}${+game.canResearch(t.id)}${JSON.stringify(game.inventory)}`).join('|');
    syncSection(researchSection, researchSig, buildResearch);
    const e = state.selected;
    syncSection(selectionSection, e ? `${e.id}|${e.recipeId}|${TECHS.filter((t) => game.researched.has(t.id)).length}` : 'none', buildSelection);
  }

  return { refresh, showHint };
}
