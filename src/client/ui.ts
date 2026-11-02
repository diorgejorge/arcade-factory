import {
  BUILDING_LABEL,
  BUILDING_ORDER,
  buildCost,
  ITEM_IDS,
  ITEM_LABEL,
  ITEM_VALUE,
  RECIPES,
  RECIPE_LABEL,
  removalCost,
  TECHS,
  TECHS_BY_DEPTH,
  TIERED_KINDS,
  TIER_BONUS,
  requirementLabel,
  tierRequires,
} from '../engine/data';
import { TICK_RATE, type Game } from '../engine/sim';
import type { BuildingKind, Entity } from '../engine/types';
import { iconFor } from './sprites';

export interface UiState {
  tool: BuildingKind | null;
  selected: Entity | null;
  /** Versão (Mk) usada ao construir máquinas. */
  mk: number;
}

export interface UiActions {
  selectTool(kind: BuildingKind | null): void;
}

const DEFAULT_HINT = 'Botão esquerdo: construir · direito: remover · WASD: mover · roda: zoom · R: girar · Q: cancelar';

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

/** Lista de requisitos com ✓ (cumprido) e ✗ (falta), só quando há algum. */
function requirementsLine(requires: readonly string[] | undefined, missing: readonly string[]): HTMLElement[] {
  if (!requires?.length) return [];
  const parts = requires.map((id) => el('span', missing.includes(id) ? 'short' : '', `${missing.includes(id) ? '✗' : '✓'} ${requirementLabel(id)}`));
  return [el('div', 'muted', 'Requer: ', ...parts.flatMap((part, i) => (i ? [' · ', part] : [part])))];
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
  hud.append(el('span', '', 'Pontos ', scoreValue), el('span', '', 'Tempo ', timeValue));

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
    const tools: Child[] = BUILDING_ORDER.map((kind, index) => {
      const unlocked = game.isBuildingUnlocked(kind);
      const button = el('button', `tool${state.tool === kind ? ' active' : ''}`, iconFor(kind), el('span', '', unlocked ? BUILDING_LABEL[kind] : `🔒 ${BUILDING_LABEL[kind]}`), el('small', 'price', `−${buildCost(kind, state.mk)}`), el('kbd', '', String(index + 1)));
      button.disabled = !unlocked;
      button.onclick = () => actions.selectTool(state.tool === kind ? null : kind);
      return button;
    });
    if (game.machineTier > 1) {
      const versions = Array.from({ length: game.machineTier }, (_, i) => {
        const mk = i + 1;
        const button = el('button', mk === state.mk ? 'active' : '', `Mk${mk}`);
        button.title = `+${Math.round(TIER_BONUS * (mk - 1) * 100)}% de desempenho`;
        button.onclick = () => (state.mk = mk);
        return button;
      });
      tools.push(el('div', 'muted', 'Versão'), el('div', 'versions', ...versions));
    }
    return tools;
  }

  function buildInventory(): Child[] {
    const rows = ITEM_IDS.filter((item) => game.inventory[item] > 0).map((item) =>
      el('div', 'row', el('span', '', ITEM_LABEL[item]), el('span', 'muted', `${game.inventory[item]} · ${ITEM_VALUE[item]} pts`)),
    );
    return [el('h3', '', 'Entregues na Central'), ...(rows.length ? rows : [el('div', 'muted', 'Entregue itens na Central.')])];
  }

  /** Melhoria de máquinas: gasta pontos do placar (não itens) e libera a próxima versão Mk. */
  function tierCard(): HTMLElement {
    const cost = game.nextTierCost();
    const button = el('button', '', cost === undefined ? 'Máximo' : 'Pesquisar');
    button.disabled = !game.canResearchTier();
    button.onclick = () => {
      if (game.researchTier()) state.mk = game.machineTier;
    };
    const detail = cost === undefined ? el('div', 'muted', 'Todas as versões liberadas.') : el('div', game.canResearchTier() ? 'cost' : 'cost short', `Custa ${cost.toLocaleString('pt-BR')} pontos do placar`);
    return el('div', 'tech', el('b', '', `Máquinas Mk${game.machineTier + (cost === undefined ? 0 : 1)}`), el('div', 'muted', `+${Math.round(TIER_BONUS * 100)}% de desempenho (minerar e produzir)`), detail, ...(cost === undefined ? [] : requirementsLine(tierRequires(game.machineTier + 1), game.missingRequirements(tierRequires(game.machineTier + 1)))), button);
  }

  function buildResearch(): Child[] {
    const cards = TECHS_BY_DEPTH.map((tech) => {
      const done = game.researched.has(tech.id);
      const button = el('button', '', done ? 'Concluída' : 'Pesquisar');
      button.disabled = done || !game.canResearch(tech.id);
      button.onclick = () => game.research(tech.id);
      const details = done ? [] : [el('div', game.score >= tech.cost ? 'cost' : 'cost short', `Custa ${tech.cost.toLocaleString('pt-BR')} pontos do placar`), ...requirementsLine(tech.requires, game.missingRequirements(tech.requires))];
      return el('div', `tech${done ? ' done' : ''}`, el('b', '', tech.name), ...details, button);
    });
    return [el('h3', '', 'Pesquisa'), tierCard(), ...cards];
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
    if (TIERED_KINDS.includes(entity.kind)) nodes.push(el('div', 'muted', `Mk${entity.mk}: +${Math.round(TIER_BONUS * (entity.mk - 1) * 100)}% de desempenho`));
    nodes.push(el('div', 'muted', `Remover custa ${removalCost(entity.kind, entity.mk)} pontos.`));
    return nodes;
  }

  function refresh(): void {
    scoreValue.textContent = Math.floor(game.score).toLocaleString('pt-BR');
    scoreValue.classList.toggle('neg', game.score < 0);
    timeValue.textContent = formatTime(game.tick);

    syncSection(toolbar, `${state.tool}|${state.mk}|${game.machineTier}|${BUILDING_ORDER.map((k) => +game.isBuildingUnlocked(k)).join('')}`, buildToolbar);
    syncSection(inventorySection, JSON.stringify(game.inventory), buildInventory);
    const researchSig = `${game.machineTier}${+game.canResearchTier()}${+(game.score >= (game.nextTierCost() ?? Infinity))}|` + TECHS.map((t) => `${+game.researched.has(t.id)}${+game.canResearch(t.id)}${+(game.score >= t.cost)}${game.missingRequirements(t.requires).length}`).join('|');
    syncSection(researchSection, researchSig, buildResearch);
    const e = state.selected;
    syncSection(selectionSection, e ? `${e.id}|${e.mk}|${e.recipeId}|${TECHS.filter((t) => game.researched.has(t.id)).length}` : 'none', buildSelection);
  }

  return { refresh, showHint };
}
