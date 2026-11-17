import type { Route, View } from '../router';
import { h } from '../components/dom';
import { navBar } from '../components/nav';

/** Placeholder view: a heading and nav links. Replaced by real views in chunks 04–05. */
export function placeholderView(title: string): View {
  let root: HTMLElement | null = null;
  return {
    mount(container: HTMLElement, route: Route) {
      root = h(
        'section',
        { className: 'view view-placeholder' },
        navBar(),
        h('h1', {}, route.id ? `${title}: ${route.id}` : title),
      );
      container.append(root);
    },
    unmount() {
      root?.remove();
      root = null;
    },
  };
}
