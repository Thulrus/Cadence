import { h } from './dom';

/**
 * Labelled form controls bound to a value via get/set. Each returns its element plus `sync()`
 * to refresh the control from the current value (e.g. after a reset or a change made elsewhere).
 * Touch targets are ≥ 44 px via CSS (`.field`).
 */
export interface Field {
  el: HTMLElement;
  sync(): void;
}

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${++uid}`;

export interface RangeFieldOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  /** Unit suffix shown after the number, e.g. "px", "%". */
  unit?: string;
  hint?: string;
  get(): number;
  set(v: number): void;
  /** Map stored value → displayed value (default identity), and back. */
  toUi?(v: number): number;
  fromUi?(v: number): number;
}

/** Slider plus an exact number box, kept in step. Slider updates live; the number on commit. */
export function rangeField(o: RangeFieldOptions): Field {
  const toUi = o.toUi ?? ((v) => v);
  const fromUi = o.fromUi ?? ((v) => v);
  const id = nextId('range');
  const common = { min: String(o.min), max: String(o.max), step: String(o.step) };
  const slider = h('input', { type: 'range', id, ...common });
  const number = h('input', {
    type: 'number',
    className: 'field-number',
    ariaLabel: `${o.label} (exact value)`,
    inputMode: 'decimal',
    ...common,
  });
  const commit = (raw: string) => {
    const v = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(v)) return sync();
    o.set(fromUi(Math.min(o.max, Math.max(o.min, v))));
    sync();
  };
  slider.addEventListener('input', () => commit(slider.value));
  number.addEventListener('change', () => commit(number.value));
  function sync(): void {
    const v = String(+toUi(o.get()).toFixed(4));
    slider.value = v;
    if (document.activeElement !== number) number.value = v;
  }
  const el = h(
    'div',
    { className: 'field field-range' },
    h('label', { htmlFor: id }, o.label),
    h(
      'div',
      { className: 'field-row' },
      slider,
      number,
      o.unit ? h('span', { className: 'field-unit' }, o.unit) : null,
    ),
    o.hint ? h('p', { className: 'field-hint' }, o.hint) : null,
  );
  sync();
  return { el, sync };
}

export interface ChoiceFieldOptions<T extends string> {
  label: string;
  options: readonly { value: T; label: string }[];
  get(): T;
  set(v: T): void;
}

/** A row of large radio "buttons" (segmented control) inside a fieldset. */
export function choiceField<T extends string>(o: ChoiceFieldOptions<T>): Field {
  const name = nextId('choice');
  const inputs = o.options.map((opt) => {
    const input = h('input', { type: 'radio', name, value: opt.value });
    input.addEventListener('change', () => input.checked && o.set(opt.value));
    return { input, el: h('label', { className: 'segment' }, input, h('span', {}, opt.label)) };
  });
  const sync = () => {
    const cur = o.get();
    for (const { input } of inputs) input.checked = input.value === cur;
  };
  const el = h(
    'fieldset',
    { className: 'field field-choice' },
    h('legend', {}, o.label),
    h('div', { className: 'segments' }, ...inputs.map((i) => i.el)),
  );
  sync();
  return { el, sync };
}

export interface SelectFieldOptions {
  label: string;
  options: readonly { value: string; label: string }[];
  get(): string;
  set(v: string): void;
}

/** A labelled <select>. A current value not in `options` is shown as an extra "Custom" entry. */
export function selectField(o: SelectFieldOptions): Field {
  const id = nextId('select');
  const select = h('select', { id });
  select.addEventListener('change', () => o.set(select.value));
  const sync = () => {
    const cur = o.get();
    const opts = o.options.some((x) => x.value === cur)
      ? o.options
      : [...o.options, { value: cur, label: 'Custom' }];
    select.replaceChildren(...opts.map((x) => h('option', { value: x.value }, x.label)));
    select.value = cur;
  };
  const el = h(
    'div',
    { className: 'field field-select' },
    h('label', { htmlFor: id }, o.label),
    select,
  );
  sync();
  return { el, sync };
}

export interface ToggleFieldOptions {
  label: string;
  hint?: string;
  get(): boolean;
  set(v: boolean): void;
}

/** A large labelled checkbox. */
export function toggleField(o: ToggleFieldOptions): Field {
  const input = h('input', { type: 'checkbox' });
  input.addEventListener('change', () => o.set(input.checked));
  const sync = () => void (input.checked = o.get());
  const el = h(
    'div',
    { className: 'field field-toggle' },
    h('label', {}, input, h('span', {}, o.label)),
    o.hint ? h('p', { className: 'field-hint' }, o.hint) : null,
  );
  sync();
  return { el, sync };
}

export interface NumberFieldOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
  hint?: string;
  /** Empty box allowed, meaning "none" (get/set use null). */
  optional?: boolean;
  placeholder?: string;
  get(): number | null;
  set(v: number | null): void;
}

/** A labelled number box, committed on change and clamped to [min, max]. */
export function numberField(o: NumberFieldOptions): Field {
  const id = nextId('number');
  const input = h('input', {
    type: 'number',
    id,
    className: 'field-number',
    inputMode: 'decimal',
    min: String(o.min),
    max: String(o.max),
    step: String(o.step),
    placeholder: o.placeholder ?? '',
  });
  input.addEventListener('change', () => {
    const raw = input.value.trim();
    const v = Number(raw);
    if (raw === '' && o.optional) o.set(null);
    else if (raw !== '' && Number.isFinite(v)) o.set(Math.min(o.max, Math.max(o.min, v)));
    sync();
  });
  function sync(): void {
    const v = o.get();
    input.value = v === null ? '' : String(+v.toFixed(6));
  }
  const el = h(
    'div',
    { className: 'field field-numberbox' },
    h('label', { htmlFor: id }, o.label),
    h(
      'div',
      { className: 'field-row' },
      input,
      o.unit ? h('span', { className: 'field-unit' }, o.unit) : null,
    ),
    o.hint ? h('p', { className: 'field-hint' }, o.hint) : null,
  );
  sync();
  return { el, sync };
}
