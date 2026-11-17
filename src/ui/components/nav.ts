import { h } from './dom';

const NAV: [label: string, hash: string][] = [
  ['Library', '#/library'],
  ['New script', '#/editor'],
  ['Settings', '#/settings'],
];

/** Top navigation bar shared by non-prompter views. */
export function navBar(): HTMLElement {
  return h('nav', { className: 'nav' }, ...NAV.map(([label, href]) => h('a', { href }, label)));
}
