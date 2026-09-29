/**
 * Pastille + nuancier pour une couleur hex de zone machine (bord-côte / talon / pointe).
 * Pas de sélecteur libre hors nuancier.
 */
import type { NuancierColor } from '../core/collections';
import type { Hex } from '../core/types';
import { getState } from '../state';

function familyOf(id: string): string {
  const m = /^([A-Z]+)/.exec(id);
  return m?.[1] ?? 'AUTRE';
}

export type ZoneYarnKind = 'cuff' | 'heel' | 'toe';

export interface ZoneYarnField {
  root: HTMLElement;
  setHex: (hex: Hex) => void;
}

export function mountZoneYarnField(opts: {
  label: string;
  kind: ZoneYarnKind;
  hex: Hex;
  onChange: (hex: Hex) => void;
}): ZoneYarnField {
  const root = document.createElement('div');
  root.className = 'zone-yarn-field';
  root.dataset.testid = `ctl-${opts.kind}-yarn`;

  const lab = document.createElement('span');
  lab.className = 'zone-yarn-label';
  lab.textContent = opts.label;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'zone-yarn-swatch';
  btn.dataset.testid = `ctl-${opts.kind}-color`;
  const chip = document.createElement('i');
  const code = document.createElement('span');
  code.className = 'zone-yarn-code';
  btn.append(chip, code);

  const picker = document.createElement('div');
  picker.className = 'nuancier-picker zone-yarn-picker';
  picker.dataset.testid = `ctl-${opts.kind}-nuancier`;
  picker.hidden = true;
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher (nom ou code)…';
  search.dataset.testid = `ctl-${opts.kind}-nuancier-search`;
  const list = document.createElement('div');
  list.className = 'nuancier-list';
  picker.append(search, list);

  root.append(lab, btn, picker);

  let current = opts.hex.toLowerCase() as Hex;

  function labelFor(hex: string): string {
    const cat = getState().catalogue;
    const hit = cat?.nuancier.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
    return hit ? `${hit.id} · ${hit.nom}` : hex.toUpperCase();
  }

  function syncSwatch(): void {
    chip.style.background = current;
    code.textContent = labelFor(current);
    btn.title = `Choisir un fil — ${labelFor(current)}`;
  }

  function closePicker(): void {
    picker.hidden = true;
    search.value = '';
  }

  function renderPicker(): void {
    list.replaceChildren();
    const cat = getState().catalogue;
    if (!cat) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Nuancier indisponible.';
      list.appendChild(empty);
      return;
    }
    const q = search.value.trim().toLowerCase();
    const colors = cat.nuancier.filter((c) => {
      if (!c.public) return false;
      if (!q) return true;
      return (
        c.id.toLowerCase().includes(q) ||
        c.nom.toLowerCase().includes(q) ||
        c.ral.toLowerCase().includes(q)
      );
    });
    const byFam = new Map<string, NuancierColor[]>();
    for (const c of colors) {
      const fam = familyOf(c.id);
      const arr = byFam.get(fam) ?? [];
      arr.push(c);
      byFam.set(fam, arr);
    }
    for (const fam of [...byFam.keys()].sort()) {
      const h = document.createElement('h4');
      h.className = 'calep-group-title';
      h.textContent = fam;
      list.appendChild(h);
      const row = document.createElement('div');
      row.className = 'nuancier-row';
      for (const c of byFam.get(fam) ?? []) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nuancier-swatch';
        b.dataset.testid = `ctl-${opts.kind}-yarn-${c.id}`;
        b.title = `${c.id} · ${c.nom}`;
        const i = document.createElement('i');
        i.style.background = c.hex;
        const span = document.createElement('span');
        span.textContent = `${c.id} · ${c.nom}`;
        b.append(i, span);
        b.addEventListener('click', () => {
          current = c.hex.toLowerCase() as Hex;
          syncSwatch();
          opts.onChange(current);
          closePicker();
        });
        row.appendChild(b);
      }
      list.appendChild(row);
    }
  }

  btn.addEventListener('click', () => {
    if (picker.hidden) {
      picker.hidden = false;
      renderPicker();
      search.focus();
    } else {
      closePicker();
    }
  });
  search.addEventListener('input', () => renderPicker());

  syncSwatch();

  return {
    root,
    setHex(hex: Hex) {
      current = hex.toLowerCase() as Hex;
      syncSwatch();
    },
  };
}
