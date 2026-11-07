import { requirementLabel, TECH_GRAPH, type TreeNode } from '../engine/data';
import type { Game } from '../engine/sim';
import { el, formatNumber } from './dom';
import { layoutGraph } from './treeLayout';
import type { UiState } from './ui';

const SIZE = { nodeW: 176, nodeH: 122, gapX: 64, gapY: 16 };
const PAD = 24;
const SVG_NS = 'http://www.w3.org/2000/svg';

type NodeState = 'done' | 'ready' | 'poor' | 'locked';

const LEGEND: [NodeState, string][] = [['done', 'Pesquisada'], ['ready', 'Disponível'], ['poor', 'Faltam pontos'], ['locked', 'Bloqueada']];

/** Tela da árvore de tecnologias: nós por profundidade e setas dos requisitos até quem depende deles. */
export function createTechTree(game: Game, state: UiState) {
  const root = document.getElementById('tree')!;
  const layout = layoutGraph(TECH_GRAPH, SIZE);
  let signature = '';

  const stateOf = (node: TreeNode): NodeState => {
    if (node.tier ? game.machineTier >= node.tier : game.researched.has(node.id)) return 'done';
    if (game.missingRequirements(node.requires).length) return 'locked';
    const affordable = node.tier ? game.canResearchTier() : game.canResearch(node.id);
    return affordable ? 'ready' : 'poor';
  };

  const research = (node: TreeNode) => {
    if (!(node.tier ? game.researchTier() : game.research(node.id))) return;
    if (node.tier) state.mk = game.machineTier;
    signature = '';
    refresh();
  };

  function nodeElement(node: TreeNode, nodeState: NodeState): HTMLElement {
    const position = layout.positions.get(node.id)!;
    const body: (Node | string)[] = [el('b', '', node.name), el('div', 'info muted', node.info)];
    if (nodeState === 'done') {
      body.push(el('div', 'status ok', '✓ Pesquisada'));
    } else {
      body.push(el('div', 'cost', `Custa ${formatNumber(node.cost)} pontos`));
      if (nodeState === 'ready') {
        const button = el('button', '', 'Pesquisar');
        button.onclick = () => research(node);
        body.push(button);
      } else if (nodeState === 'poor') {
        body.push(el('div', 'status warn', 'Faltam pontos'));
      } else {
        body.push(el('div', 'status short', `Falta: ${game.missingRequirements(node.requires).map(requirementLabel).join(', ')}`));
      }
    }
    const element = el('div', `node ${nodeState}`, ...body);
    element.dataset.node = node.id;
    Object.assign(element.style, { left: `${position.x + PAD}px`, top: `${position.y + PAD}px`, width: `${SIZE.nodeW}px`, height: `${SIZE.nodeH}px` });
    return element;
  }

  function edges(width: number, height: number, states: Map<string, NodeState>): SVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.innerHTML = [['arrow', 'head'], ['arrow-ok', 'head head-ok']]
      .map(([id, cls]) => `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" class="${cls}"/></marker>`)
      .join('');
    const bend = SIZE.gapX * 0.6;
    for (const node of TECH_GRAPH) {
      const to = layout.positions.get(node.id)!;
      for (const parentId of node.requires) {
        const from = layout.positions.get(parentId)!;
        const x1 = from.x + SIZE.nodeW + PAD;
        const y1 = from.y + SIZE.nodeH / 2 + PAD;
        const x2 = to.x + PAD - 2;
        const y2 = to.y + SIZE.nodeH / 2 + PAD;
        const cls = states.get(parentId) === 'done' ? 'edge ok' : 'edge';
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
        path.setAttribute('class', cls);
        path.setAttribute('marker-end', cls === 'edge ok' ? 'url(#arrow-ok)' : 'url(#arrow)');
        path.dataset.from = parentId;
        path.dataset.to = node.id;
        svg.append(path);
      }
    }
    return svg;
  }

  const scoreText = el('b');
  const scroll = el('div', 'tree-scroll');
  const closeButton = el('button', 'close', '✕');
  const legend = el('span', 'legend', ...LEGEND.map(([cls, label]) => el('span', `lg ${cls}`, label)));
  root.append(el('div', 'modal-box', el('div', 'modal-head', el('h2', '', 'Árvore de tecnologias'), el('span', '', 'Pontos ', scoreText), legend, el('span', 'grow'), closeButton), scroll));

  function renderBoard(): void {
    const width = layout.width + PAD * 2;
    const height = layout.height + PAD * 2;
    const states = new Map(TECH_GRAPH.map((node) => [node.id, stateOf(node)]));
    const board = el('div', 'tree-board', edges(width, height, states) as unknown as Node, ...TECH_GRAPH.map((node) => nodeElement(node, states.get(node.id)!)));
    Object.assign(board.style, { width: `${width}px`, height: `${height}px` });
    const { scrollLeft, scrollTop } = scroll;
    scroll.replaceChildren(board);
    scroll.scrollLeft = scrollLeft;
    scroll.scrollTop = scrollTop;
  }

  /** Redesenha só quando o estado de algum nó muda (o placar no cabeçalho atualiza sempre). */
  function refresh(): void {
    if (root.hidden) return;
    scoreText.textContent = formatNumber(Math.floor(game.score));
    scoreText.classList.toggle('neg', game.score < 0);
    const next = TECH_GRAPH.map((node) => stateOf(node)[0]).join('');
    if (next === signature) return;
    signature = next;
    renderBoard();
  }

  const close = () => { root.hidden = true; };
  const open = () => { root.hidden = false; signature = ''; refresh(); };
  closeButton.onclick = close;
  root.onclick = (event) => { if (event.target === root) close(); };

  return { open, close, toggle: () => (root.hidden ? open() : close()), isOpen: () => !root.hidden, refresh };
}
