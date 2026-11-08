// Substitution plan for the Team Builder: who is on the pitch in each quarter
// (or each half), drag-to-swap between periods, a minutes-played table and a
// printable sheet.
//
// Column 0 is the starting side, read from and written back to the builder's
// lineup + bench. Later columns are stored per mode in state.subPlan.plans,
// each an array of player ids: one per starting slot, then one per sub row.

const FORWARD_TAGS = ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8'];
const BACK_TAGS = ['Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Full-back'];

export const SUB_MODES = {
  quarters: { label: 'Each quarter (3 changes)', periods: 4 },
  halves: { label: 'At half-time (1 change)', periods: 2 },
};

export function defaultSubPlan() {
  return { mode: 'quarters', matchMinutes: 50, showNext: false, colours: true, plans: { quarters: [], halves: [] } };
}

export function normaliseSubPlan(raw) {
  const d = defaultSubPlan();
  if (!raw || typeof raw !== 'object') return d;
  const mins = Number(raw.matchMinutes);
  return {
    mode: SUB_MODES[raw.mode] ? raw.mode : d.mode,
    matchMinutes: Number.isFinite(mins) && mins >= 10 && mins <= 120 ? Math.round(mins) : d.matchMinutes,
    showNext: typeof raw.showNext === 'boolean' ? raw.showNext : d.showNext,
    colours: typeof raw.colours === 'boolean' ? raw.colours : d.colours,
    plans: {
      quarters: Array.isArray(raw.plans?.quarters) ? raw.plans.quarters : [],
      halves: Array.isArray(raw.plans?.halves) ? raw.plans.halves : [],
    },
  };
}

function clock(min) {
  const whole = Math.floor(min);
  return `${whole}:${String(Math.round((min - whole) * 60)).padStart(2, '0')}`;
}

// Forward / back from the player's listed positions, or failing that from the
// shirts they wear in this plan (`units` holds 'fwd' / 'back' per period on).
function unitOf(p, units) {
  const tags = p?.positions || [];
  let f = tags.some(t => FORWARD_TAGS.includes(t));
  let b = tags.some(t => BACK_TAGS.includes(t));
  if (!f && !b) { f = units.includes('fwd'); b = units.includes('back'); }
  return f && b ? 'F/B' : f ? 'F' : b ? 'B' : '';
}

export function createSubPlan({ state, fmt, squadById, onChange, escapeHtml }) {
  const root = document.getElementById('subplan');
  let picked = null; // { col, row } for click-to-swap

  const periodCount = () => SUB_MODES[state.subPlan.mode].periods;
  const periodLength = () => state.subPlan.matchMinutes / periodCount();

  function periodLabel(i) {
    const at = clock(i * periodLength());
    if (i === 0) return { name: 'Kick-off', at };
    if (i === periodCount() / 2) return { name: 'Half-time', at };
    return { name: `Q${i + 1}`, at };
  }

  // Every column, rebuilt from the starting side so the plan always holds the
  // same matchday squad: dropped players vanish, new ones join on the bench.
  // A stored null means "no changes this period": it follows the one before,
  // so a sub made in Q2 stays on until a later period is edited.
  function columns() {
    const n = fmt().slots.length;
    const first = [...state.lineup, ...state.bench];
    const rows = first.length;
    const squad = first.filter(Boolean);
    const stored = state.subPlan.plans[state.subPlan.mode];
    const cols = [first];
    for (let c = 1; c < periodCount(); c++) {
      const own = Array.isArray(stored[c - 1]);
      const src = own ? stored[c - 1] : cols[c - 1];
      const out = [];
      for (let r = 0; r < rows; r++) {
        const id = src[r];
        out.push(typeof id === 'string' && squad.includes(id) && !out.includes(id) ? id : null);
      }
      for (const id of squad) {
        if (out.includes(id)) continue;
        let at = out.indexOf(null, n);
        if (at < 0) at = out.indexOf(null);
        if (at >= 0) out[at] = id;
      }
      cols.push(out);
      stored[c - 1] = own ? out.slice() : null;
    }
    stored.length = periodCount() - 1;
    return cols;
  }

  // True when period c has no changes of its own (it follows the one before).
  const follows = (c) => c > 0 && !Array.isArray(state.subPlan.plans[state.subPlan.mode][c - 1]);

  function setColumn(c, arr) {
    if (c === 0) {
      const n = state.lineup.length;
      for (let r = 0; r < arr.length; r++) {
        if (r < n) state.lineup[r] = arr[r]; else state.bench[r - n] = arr[r];
      }
    } else {
      state.subPlan.plans[state.subPlan.mode][c - 1] = arr;
    }
  }

  // Put `id` into row `row` of column `c`, swapping with whoever is there.
  function placeIn(c, row, id) {
    const col = columns()[c].slice();
    const from = col.indexOf(id);
    if (from < 0 || from === row) return;
    col[from] = col[row];
    col[row] = id;
    setColumn(c, col);
    onChange();
  }

  function swapRows(c, a, b) {
    const col = columns()[c].slice();
    [col[a], col[b]] = [col[b], col[a]];
    setColumn(c, col);
    onChange();
  }

  function copyPrevious(c) {
    state.subPlan.plans[state.subPlan.mode][c - 1] = null;
    onChange();
  }

  // What happens to the player in row `now` at the next period, given the row
  // they hold then (-1 when this is the last period).
  function nextIcon(now, then) {
    const n = fmt().slots.length;
    if (then < 0 || then === now) return '';
    if (now < n && then >= n) return '<span class="sp-next sp-next-off" title="Goes off next period">↓</span>';
    if (now >= n && then < n) return '<span class="sp-next sp-next-on" title="Comes on next period">↑</span>';
    if (now < n && then < n) return '<span class="sp-next sp-next-move" title="Switches position next period">⇄</span>';
    return '';
  }

  function render() {
    if (!root) return;
    const f = fmt();
    const n = f.slots.length;
    const cols = columns();
    const rows = cols[0].length;
    const mode = state.subPlan.mode;

    const head = cols.map((_, c) => {
      const l = periodLabel(c);
      const copy = c === 0 ? ''
        : follows(c) ? '<span class="sp-nochange">no changes</span>'
        : `<button type="button" class="btn small sp-copy" data-col="${c}" title="Undo this period's changes: same team as the period before">Reset</button>`;
      return `<th><span class="sp-period">${l.name}</span> <span class="sp-at">${l.at}</span>${copy}</th>`;
    }).join('');

    const body = [];
    for (let r = 0; r < rows; r++) {
      const slot = r < n ? f.slots[r] : null;
      const label = slot ? `<span class="sp-num">${slot.num}</span> ${escapeHtml(slot.short)}` : `Sub ${r - n + 1}`;
      const cls = [slot ? '' : 'sp-subrow', slot && r > 0 && f.slots[r - 1].unit !== slot.unit ? 'sp-unit-break' : '', r === n ? 'sp-bench-break' : ''].filter(Boolean).join(' ');
      const cells = cols.map((col, c) => {
        const id = col[r];
        const p = id ? squadById[id] : null;
        let mark = '';
        if (c > 0 && id && cols[c - 1][r] !== id) {
          const wasOn = cols[c - 1].indexOf(id) < n;
          mark = r < n ? (wasOn ? 'sp-moved' : 'sp-on') : 'sp-off';
        }
        const sel = picked && picked.col === c && picked.row === r ? ' sp-picked' : '';
        const next = state.subPlan.showNext && id ? nextIcon(r, cols[c + 1]?.indexOf(id) ?? -1) : '';
        return `<td class="sp-cell ${mark}${sel}" data-col="${c}" data-row="${r}"${id ? ` draggable="true" data-id="${escapeHtml(id)}"` : ''}>${p ? escapeHtml(p.name) : '<span class="muted">—</span>'}${next}</td>`;
      }).join('');
      body.push(`<tr class="${cls}"><th class="sp-pos">${label}</th>${cells}</tr>`);
    }

    // Minutes table: one row per matchday player, in starting order.
    const len = periodLength();
    const players = cols[0].filter(Boolean);
    const summary = players.map(id => {
      const p = squadById[id];
      let mins = 0;
      const changes = [];
      const units = [];
      const cells = cols.map((col, c) => {
        const at = col.indexOf(id);
        const on = at >= 0 && at < n;
        if (on) { mins += len; units.push(f.slots[at].unit); }
        if (c > 0) {
          const wasOn = cols[c - 1].indexOf(id) < n && cols[c - 1].indexOf(id) >= 0;
          if (on && !wasOn) changes.push(`On ${clock(c * len)}`);
          if (!on && wasOn) changes.push(`Off ${clock(c * len)}`);
        }
        return on
          ? `<td class="sp-played"><span class="sp-num">${f.slots[at].num}</span> ${escapeHtml(f.slots[at].short)}</td>`
          : `<td class="sp-benched">Sub</td>`;
      }).join('');
      const share = mins / state.subPlan.matchMinutes;
      if (!changes.length) changes.push(mins ? 'Full game' : 'Does not play');
      return `<tr>
        <th class="sp-player">${escapeHtml(p?.name || '?')}</th>
        <td class="sp-unit">${unitOf(p, units)}</td>
        ${cells}
        <td class="sp-mins"><strong>${clock(mins)}</strong></td>
        <td class="sp-share">${Math.round(share * 100) / 100}</td>
        <td class="sp-changes">${changes.join(' · ')}</td>
      </tr>`;
    }).join('');

    const modeOpts = Object.entries(SUB_MODES).map(([k, m]) => `<option value="${k}" ${k === mode ? 'selected' : ''}>${m.label}</option>`).join('');
    const nextKey = '<span class="sp-key"><span class="sp-next sp-next-off">↓</span> goes off next</span> <span class="sp-key"><span class="sp-next sp-next-on">↑</span> comes on next</span> <span class="sp-key"><span class="sp-next sp-next-move">⇄</span> switches position next</span>';
    root.classList.toggle('sp-nocolour', !state.subPlan.colours);
    root.innerHTML = `
      <div class="sp-head">
        <h2 style="margin:0">Substitution plan</h2>
        <div class="sp-controls">
          <label class="muted small">Subs <select id="sp-mode">${modeOpts}</select></label>
          <label class="muted small">Match length <input id="sp-minutes" type="number" min="10" max="120" step="1" value="${state.subPlan.matchMinutes}"> min</label>
          <label class="muted small" title="Arrows by each name showing who goes off, comes on or switches position at the next change"><input id="sp-show-next" type="checkbox" ${state.subPlan.showNext ? 'checked' : ''}> Next-change icons</label>
          <label class="muted small" title="Turn off to print in black and white"><input id="sp-colours" type="checkbox" ${state.subPlan.colours ? 'checked' : ''}> Colours</label>
          <button type="button" id="sp-print" class="btn small">Print sub plan</button>
        </div>
      </div>
      <p class="muted small sp-help">Drag a name onto another row to swap them for that period, or click two names in turn. Drag a name from one period into another to put them in that spot there. <span class="sp-colour-key"><span class="sp-key sp-on">came on</span> <span class="sp-key sp-off">went off</span> <span class="sp-key sp-moved">changed position</span></span> ${state.subPlan.showNext ? nextKey : ''}</p>
      ${state.bench.length ? '' : '<p class="warn-banner">No replacements picked yet — set a bench size and add subs above to plan rotations.</p>'}
      <div class="sp-print-title"></div>
      <div class="sp-scroll">
        <table class="sp-grid">
          <thead><tr><th class="sp-pos">Shirt</th>${head}</tr></thead>
          <tbody>${body.join('')}</tbody>
        </table>
      </div>
      <h3 class="sp-subtitle">Playing time</h3>
      <div class="sp-scroll">
        <table class="sp-summary">
          <thead><tr><th>Player</th><th>F/B</th>${cols.map((_, c) => `<th>${periodLabel(c).at}</th>`).join('')}<th>Minutes</th><th>Share</th><th>On / off</th></tr></thead>
          <tbody>${summary || `<tr><td colspan="${cols.length + 5}" class="muted">Pick a team above first.</td></tr>`}</tbody>
        </table>
      </div>
    `;
    wire();
  }

  function wire() {
    root.querySelector('#sp-mode').addEventListener('change', e => {
      state.subPlan.mode = e.target.value;
      picked = null;
      onChange();
    });
    root.querySelector('#sp-minutes').addEventListener('change', e => {
      const v = Math.round(Number(e.target.value));
      if (v >= 10 && v <= 120) state.subPlan.matchMinutes = v;
      onChange();
    });
    root.querySelector('#sp-show-next').addEventListener('change', e => { state.subPlan.showNext = e.target.checked; onChange(); });
    root.querySelector('#sp-colours').addEventListener('change', e => { state.subPlan.colours = e.target.checked; onChange(); });
    root.querySelector('#sp-print').addEventListener('click', printPlan);
    root.querySelectorAll('.sp-copy').forEach(b => b.addEventListener('click', () => copyPrevious(Number(b.dataset.col))));
    root.querySelectorAll('.sp-cell').forEach(td => {
      const c = Number(td.dataset.col);
      const r = Number(td.dataset.row);
      td.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/source', 'subplan');
        e.dataTransfer.setData('text/id', td.dataset.id);
      });
      td.addEventListener('dragover', e => { e.preventDefault(); td.classList.add('drag-over'); });
      td.addEventListener('dragleave', () => td.classList.remove('drag-over'));
      td.addEventListener('drop', e => {
        e.preventDefault();
        td.classList.remove('drag-over');
        if (e.dataTransfer.getData('text/source') !== 'subplan') return;
        const id = e.dataTransfer.getData('text/id');
        if (id) { picked = null; placeIn(c, r, id); }
      });
      td.addEventListener('click', () => {
        if (picked && picked.col === c) {
          const a = picked.row;
          picked = null;
          if (a !== r) swapRows(c, a, r); else render();
        } else {
          picked = { col: c, row: r };
          render();
        }
      });
    });
  }

  function printPlan() {
    const val = (id) => document.getElementById(id)?.value || '';
    const date = val('m-date') ? new Date(val('m-date') + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '';
    const opp = val('m-opposition') ? (val('m-homeaway') === 'away' ? '@ ' : 'vs ') + val('m-opposition') : '';
    root.querySelector('.sp-print-title').textContent = ['Substitution plan', opp, date, val('m-kickoff')].filter(Boolean).join(' · ');
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 8mm; }';
    document.head.appendChild(style);
    document.body.classList.add('print-subplan-only');
    const cleanup = () => {
      document.body.classList.remove('print-subplan-only');
      style.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  return { render };
}
