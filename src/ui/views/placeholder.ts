import type { Route, View } from '../router';

const NAV: [label: string, hash: string][] = [
  ['Library', '#/library'],
  ['Editor', '#/editor'],
  ['Prompter', '#/prompter'],
  ['Settings', '#/settings'],
];

/** Placeholder view: a heading and nav links. Replaced by real views in chunks 03–05. */
export function placeholderView(title: string): View {
  let root: HTMLElement | null = null;
  return {
    mount(container: HTMLElement, route: Route) {
      root = document.createElement('section');
      root.className = 'view view-placeholder';
      const h1 = document.createElement('h1');
      h1.textContent = route.id ? `${title}: ${route.id}` : title;
      const nav = document.createElement('nav');
      nav.className = 'nav';
      for (const [label, hash] of NAV) {
        const a = document.createElement('a');
        a.href = hash;
        a.textContent = label;
        nav.append(a);
      }
      root.append(nav, h1);
      container.append(root);
    },
    unmount() {
      root?.remove();
      root = null;
    },
  };
}
