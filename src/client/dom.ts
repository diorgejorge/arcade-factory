export type Child = Node | string;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

/** Reconstrói um container apenas quando a assinatura muda, evitando perder foco/cliques. */
export function syncSection(container: HTMLElement, signature: string, build: () => Child[]): void {
  if (container.dataset.sig === signature) return;
  container.dataset.sig = signature;
  container.replaceChildren(...build());
}

export const formatNumber = (value: number): string => value.toLocaleString('pt-BR');
