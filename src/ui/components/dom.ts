export type Props<E> = Partial<Omit<E, 'dataset'>> & { dataset?: Record<string, string> };

/** Tiny element builder: h('button', { className: 'btn', onclick }, 'Save'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(el, rest);
  if (dataset) Object.assign(el.dataset, dataset);
  for (const c of children) if (c) el.append(c);
  return el;
}

/** A standard button. `variant` maps to a CSS modifier class. */
export function button(
  label: string,
  onclick: () => void,
  variant: 'primary' | 'danger' | 'plain' = 'plain',
  extra: Props<HTMLButtonElement> = {},
): HTMLButtonElement {
  return h('button', { type: 'button', className: `btn btn-${variant}`, onclick, ...extra }, label);
}
