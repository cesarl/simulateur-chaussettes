/** Petits contrôles de formulaire. Le délai anti-rebond est de 120 ms. */

const DEBOUNCE_MS = 120;

export function debounce(run: () => void, delay = DEBOUNCE_MS): () => void {
  let timer = 0;
  return () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, delay);
  };
}

export function details(title: string, testId: string): HTMLDetailsElement {
  const section = document.createElement('details');
  section.open = true;
  section.className = 'section';
  section.dataset.testid = testId;
  const summary = document.createElement('summary');
  summary.textContent = title;
  section.appendChild(summary);
  return section;
}

export function field(
  labelText: string,
  control: HTMLElement,
  unit?: string,
  help?: string,
  helpId?: string,
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'field';
  const span = document.createElement('span');
  span.className = 'field-label';
  span.textContent = labelText;
  row.append(span);
  if (help) {
    const tip = document.createElement('button');
    tip.type = 'button';
    tip.className = 'help';
    tip.textContent = '?';
    tip.title = help;
    tip.setAttribute('aria-label', help);
    tip.dataset.testid = `help-${helpId ?? control.dataset.testid ?? 'field'}`;
    tip.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    span.appendChild(tip);
    row.title = help;
  }
  row.append(control);
  if (unit) {
    const unitEl = document.createElement('span');
    unitEl.className = 'unit';
    unitEl.textContent = unit;
    row.appendChild(unitEl);
  }
  return row;
}

export interface SelectOption {
  value: string;
  label: string;
}

export function makeSelect(
  labelText: string,
  testId: string,
  options: readonly SelectOption[],
  value: string,
  onChange: (value: string) => void,
  help?: string,
): { root: HTMLElement; input: HTMLSelectElement } {
  const input = document.createElement('select');
  input.dataset.testid = testId;
  for (const option of options) {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    input.appendChild(item);
  }
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  return { root: field(labelText, input, undefined, help), input };
}

export function makeCheckbox(
  labelText: string,
  testId: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  help?: string,
): { root: HTMLElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.dataset.testid = testId;
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return { root: field(labelText, input, undefined, help), input };
}

export function makeColor(
  labelText: string,
  testId: string,
  value: string,
  onChange: (value: string) => void,
  help?: string,
): { root: HTMLElement; input: HTMLInputElement } {
  const input = document.createElement('input');
  input.type = 'color';
  input.dataset.testid = testId;
  input.value = value;
  const emit = debounce(() => onChange(input.value));
  input.addEventListener('input', emit);
  return { root: field(labelText, input, undefined, help), input };
}

export interface SliderNumber {
  root: HTMLElement;
  input: HTMLInputElement;
  setValue: (value: number, force?: boolean) => void;
  setRange: (min: number, max: number) => void;
}

export function makeSliderNumber(options: {
  label: string;
  testId: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  help?: string;
  onChange: (value: number) => void;
}): SliderNumber {
  const wrap = document.createElement('span');
  wrap.className = 'slider-number';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(options.min);
  range.max = String(options.max);
  range.step = String(options.step);
  range.value = String(options.value);
  range.dataset.testid = `${options.testId}-range`;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(options.min);
  input.max = String(options.max);
  input.step = String(options.step);
  input.value = String(options.value);
  input.dataset.testid = options.testId;
  const emit = debounce(() => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    options.onChange(value);
  });
  const fromRange = (): void => {
    input.value = range.value;
    emit();
  };
  const fromNumber = (): void => {
    range.value = input.value;
    emit();
  };
  range.addEventListener('input', fromRange);
  input.addEventListener('input', fromNumber);
  wrap.append(range, input);
  return {
    root: field(options.label, wrap, options.unit, options.help, options.testId),
    input,
    setValue(value: number, force = false): void {
      if (!force && (document.activeElement === input || document.activeElement === range)) return;
      input.value = String(value);
      range.value = String(value);
    },
    setRange(min: number, max: number): void {
      range.min = String(min);
      range.max = String(max);
      input.min = String(min);
      input.max = String(max);
    },
  };
}
