import { FORMATS, getFormat, tagsForSlot } from './rugby.js';
import { createSubPlan, normaliseSubPlan } from './subPlan.js';

const data = JSON.parse(document.getElementById('initial-data').textContent);
const squadById = Object.fromEntries(data.squad.players.map(p => [p.id, p]));

const FORWARD_TAGS = ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8'];
const BACK_TAGS = ['Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Full-back'];
const FRONT_ROW_TAGS = ['Prop', 'Hooker'];

// Multi-select state for the squad pool. Click an available player to add
// them to this set. Dragging any selected player drops the whole set into
// consecutive slots, starting at the slot you drop on.
const poolSelection = new Set();

const state = {
  format: Number(data.selection.format) || 15,
  benchSize: Number(data.selection.benchSize),
  lineup: [],
  bench: [],
  captainId: data.selection.captainId || null,
  viceCaptainId: data.selection.viceCaptainId || null,
  kickerId: data.selection.kickerId || null,
  fixtureId: data.selection.fixtureId || null,
  subPlan: normaliseSubPlan(data.selection.subPlan),
};
state.lineup = sized(data.selection.lineup, fmt().slots.length);
state.bench = sized(data.selection.bench, state.benchSize);

function fmt() { return getFormat(state.format); }

// Fixed-length array of ids / nulls (null = empty shirt).
function sized(arr, n) {
  const out = (Array.isArray(arr) ? arr : []).slice(0, n).map(x => (typeof x === 'string' && x) ? x : null);
  while (out.length < n) out.push(null);
  return out;
}

function listFor(name) { return name === 'bench' ? state.bench : state.lineup; }
function allPicked() { return [...state.lineup, ...state.bench].filter(Boolean); }
function isPicked(id) { return state.lineup.includes(id) || state.bench.includes(id); }
function shirtFor(list, idx) { return list === 'bench' ? fmt().slots.length + idx + 1 : fmt().slots[idx].num; }

// Remove a player from wherever they are in the side. Mutates in place:
// callers hold a reference to state.lineup / state.bench (e.g. the drop
// target), and swapping in new arrays left their writes on a stale copy.
function unplace(id) {
  for (const list of [state.lineup, state.bench]) {
    for (let i = 0; i < list.length; i++) if (list[i] === id) list[i] = null;
  }
}

// Switch the match format (15s / 13s / 10s / 7s). Players keep their shirt
// number where it still exists; anyone beyond the new side size moves to the
// first free bench spots (or back to the pool if the bench is full).
function setFormat(n) {
  const next = Number(n);
  if (!FORMATS[next] || next === state.format) return;
  const displaced = state.lineup.slice(FORMATS[next].slots.length).filter(Boolean);
  state.format = next;
  const f = fmt();
  state.lineup = sized(state.lineup, f.slots.length);
  if (state.benchSize > f.maxBench || state.benchSize === 0) state.benchSize = f.defaultBench;
  state.bench = sized(state.bench, state.benchSize);
  for (const id of displaced) {
    const free = state.bench.indexOf(null);
    if (free >= 0) state.bench[free] = id;
  }
  document.getElementById('hd-format').textContent = f.label;
  renderBenchSizeOptions();
  render();
}

function setBenchSize(n) {
  const size = Math.max(0, Math.min(fmt().maxBench, Number(n) || 0));
  state.benchSize = size;
  state.bench = sized(state.bench, size);
  render();
}

function renderBenchSizeOptions() {
  const sel = document.getElementById('m-bench-size');
  if (!sel) return;
  const opts = [];
  for (let i = 0; i <= fmt().maxBench; i++) opts.push(`<option value="${i}" ${i === state.benchSize ? 'selected' : ''}>${i}</option>`);
  sel.innerHTML = opts.join('');
}

function render() {
  const n = fmt().slots.length;
  document.getElementById('xv-label').textContent = n === 15 ? 'XV' : n === 13 ? 'XIII' : n === 10 ? 'X' : 'VII';
  renderSlots('lineup');
  renderSlots('bench');
  renderUnitSummary();
  renderPool();
  refreshRoleOptions();
  subPlan.render();
  if (autosaveReady) scheduleSave();
}

// Captain / vice-captain / kicker dropdowns: anyone in the matchday squad.
// Auto-clear an assignment if that player has been dropped.
function refreshRoleOptions() {
  const ids = allPicked();
  const players = ids.map(id => squadById[id]).filter(Boolean).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  for (const key of ['captainId', 'viceCaptainId', 'kickerId']) {
    if (state[key] && !ids.includes(state[key])) state[key] = null;
  }
  if (state.viceCaptainId && state.viceCaptainId === state.captainId) state.viceCaptainId = null;
  const fill = (selectId, currentId) => {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = '<option value="">— none —</option>' + players
      .map(p => `<option value="${escapeHtml(p.id)}" ${p.id === currentId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
      .join('');
  };
  fill('m-captain', state.captainId);
  fill('m-vice', state.viceCaptainId);
  fill('m-kicker', state.kickerId);
}

// ── Autosave ─────────────────────────────────────────────────────────────
let saveTimer = null;
let savePromise = null;
let dirty = false;
let autosaveReady = false;

function setStatus(text) {
  const el = document.getElementById('save-status');
  if (el) el.textContent = text;
}

function scheduleSave() {
  dirty = true;
  setStatus('Unsaved changes…');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; doSave(); }, 600);
}

function payload() {
  return {
    matchTitle: document.getElementById('m-title').value,
    matchDate: document.getElementById('m-date').value,
    kickoff: document.getElementById('m-kickoff').value,
    opposition: document.getElementById('m-opposition').value,
    venue: document.getElementById('m-venue').value,
    homeAway: document.getElementById('m-homeaway').value,
    team: Number(document.getElementById('m-team').value) || 1,
    teamName: document.getElementById('m-team-name').value,
    fixtureId: state.fixtureId,
    format: state.format,
    benchSize: state.benchSize,
    lineup: state.lineup,
    bench: state.bench,
    captainId: state.captainId,
    viceCaptainId: state.viceCaptainId,
    kickerId: state.kickerId,
    subPlan: state.subPlan,
  };
}

async function doSave() {
  if (savePromise) { dirty = true; return savePromise; }
  dirty = false;
  setStatus('Saving…');
  savePromise = fetch('/builder/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload()),
  })
    .then(res => {
      if (!res.ok) throw new Error('Save failed');
      setStatus(dirty ? 'Saving…' : `Saved · ${new Date().toLocaleTimeString('en-GB')}`);
    })
    .catch(() => setStatus('Save failed — retrying…'))
    .finally(() => {
      savePromise = null;
      // If something changed mid-save, kick off another save
      if (dirty) scheduleSave();
    });
  return savePromise;
}

// Save before the page navigates away, using sendBeacon as a safety net
window.addEventListener('beforeunload', () => {
  if (!dirty && !saveTimer) return;
  const blob = new Blob([JSON.stringify(payload())], { type: 'application/json' });
  navigator.sendBeacon('/builder/save', blob);
});

// ── Starting side + bench slots ──────────────────────────────────────────
function roleMarks(id) {
  let s = '';
  if (id === state.captainId) s += ' <span class="role-badge" title="Captain">C</span>';
  if (id === state.viceCaptainId) s += ' <span class="role-badge" title="Vice-captain">VC</span>';
  if (id === state.kickerId) s += ' <span class="kick-mark" title="Goal kicker">🏉</span>';
  return s;
}

function renderSlots(listName) {
  const el = document.getElementById(listName);
  const list = listFor(listName);
  el.innerHTML = '';
  if (listName === 'bench' && list.length === 0) {
    el.innerHTML = '<li class="order-row empty"><span class="name">No bench — pick a bench size above.</span></li>';
  }
  list.forEach((id, i) => {
    const shirt = shirtFor(listName, i);
    const slot = listName === 'lineup' ? fmt().slots[i] : null;
    const posLabel = slot ? slot.pos : 'Replacement';
    const li = document.createElement('li');
    li.dataset.idx = String(i);
    if (id) {
      const p = squadById[id];
      const tags = p?.positions || [];
      const want = slot ? tagsForSlot(slot.pos) : [];
      const oop = slot && tags.length && want.length && !want.some(t => tags.includes(t));
      li.className = 'order-row filled' + (oop ? ' out-of-position' : '');
      li.draggable = true;
      li.innerHTML = `
        <span class="pos shirt">${shirt}</span>
        <span class="name">${escapeHtml(p?.name || '?')}${roleMarks(id)}</span>
        <span class="role" title="${oop ? 'Listed as: ' + escapeHtml(tags.join(', ')) : ''}">${escapeHtml(posLabel)}</span>
        <button class="x" title="Remove">×</button>
      `;
      li.querySelector('.x').addEventListener('click', () => { list[i] = null; render(); });
      li.addEventListener('dragstart', e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/source', 'slot');
        e.dataTransfer.setData('text/list', listName);
        e.dataTransfer.setData('text/index', String(i));
      });
    } else {
      li.className = 'order-row empty';
      li.innerHTML = `<span class="pos shirt">${shirt}</span><span class="name">— ${escapeHtml(posLabel)} —</span>`;
    }
    li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      li.classList.remove('drag-over');
      handleSlotDrop(e, listName, i);
    });
    el.appendChild(li);
  });
}

function handleSlotDrop(e, dstList, dstIdx) {
  const source = e.dataTransfer.getData('text/source');
  const dst = listFor(dstList);
  if (source === 'pool') {
    const id = e.dataTransfer.getData('text/id');
    if (!id) return;
    unplace(id);
    dst[dstIdx] = id;   // an occupant is simply replaced (back to the pool)
  } else if (source === 'pool-bulk') {
    let ids;
    try { ids = JSON.parse(e.dataTransfer.getData('text/ids') || '[]'); } catch { ids = []; }
    // Fill consecutive empty slots from the drop point; skip filled ones so a
    // bulk drop never knocks out a player already picked.
    let idx = dstIdx;
    for (const id of ids) {
      if (isPicked(id)) continue;
      while (idx < dst.length && dst[idx]) idx++;
      if (idx >= dst.length) break;
      dst[idx++] = id;
    }
    poolSelection.clear();
  } else if (source === 'slot') {
    const srcList = listFor(e.dataTransfer.getData('text/list'));
    const srcIdx = Number(e.dataTransfer.getData('text/index'));
    if (Number.isNaN(srcIdx)) return;
    // Straight swap — works within a list and between the side and the bench.
    const moved = srcList[srcIdx];
    srcList[srcIdx] = dst[dstIdx];
    dst[dstIdx] = moved;
  }
  render();
}

// Coverage summary under the bench: numbers picked, forwards/backs balance,
// front-row cover on the bench and anyone out of position.
function renderUnitSummary() {
  const wrap = document.getElementById('unit-summary');
  if (!wrap) return;
  const f = fmt();
  const picked = state.lineup.filter(Boolean).length;
  const benchPicked = state.bench.filter(Boolean).length;
  const fwdSlots = f.slots.filter(s => s.unit === 'fwd').length;
  const fwdPicked = f.slots.filter((s, i) => s.unit === 'fwd' && state.lineup[i]).length;
  const backPicked = picked - fwdPicked;
  const oop = [];
  f.slots.forEach((s, i) => {
    const id = state.lineup[i];
    if (!id) return;
    const tags = squadById[id]?.positions || [];
    const want = tagsForSlot(s.pos);
    if (tags.length && want.length && !want.some(t => tags.includes(t))) oop.push(`${s.num} ${squadById[id].name} (${tags.join('/')})`);
  });
  const benchFrontRow = state.bench.filter(id => id && (squadById[id]?.positions || []).some(t => FRONT_ROW_TAGS.includes(t))).length;
  const warnings = [];
  if (state.benchSize >= 3 && benchPicked && benchFrontRow === 0) warnings.push('No front-row cover on the bench (no Prop/Hooker) — risk of uncontested scrums.');
  wrap.innerHTML = `
    <h3 class="bws-title">Matchday squad</h3>
    <ul class="bws-list">
      <li class="bws-row${picked < f.slots.length ? ' over-cap' : ''}"><span class="bws-name">Starting side</span><span class="bws-overs"><strong>${picked}</strong> / ${f.slots.length}</span></li>
      <li class="bws-row"><span class="bws-name">Forwards</span><span class="bws-overs"><strong>${fwdPicked}</strong> / ${fwdSlots}</span></li>
      <li class="bws-row"><span class="bws-name">Backs</span><span class="bws-overs"><strong>${backPicked}</strong> / ${f.slots.length - fwdSlots}</span></li>
      <li class="bws-row"><span class="bws-name">Replacements</span><span class="bws-overs"><strong>${benchPicked}</strong> / ${state.benchSize}</span></li>
      <li class="bws-row"><span class="bws-name">Front-row cover on bench</span><span class="bws-overs"><strong>${benchFrontRow}</strong></span></li>
    </ul>
    ${oop.length ? `<p class="muted small"><strong>Out of position:</strong> ${oop.map(escapeHtml).join(' · ')}</p>` : ''}
    ${warnings.map(w => `<p class="warn-banner">⚠ ${escapeHtml(w)}</p>`).join('')}
  `;
}

// ── Squad pool ───────────────────────────────────────────────────────────
function renderPool() {
  const availableUl = document.getElementById('squad-pool');
  availableUl.innerHTML = '';

  // True only when we have a real Spond import — otherwise treat all players as available
  const hasImport = !!data.selection?.spondEvent?.id;
  const filter = document.getElementById('pool-position-filter')?.value || '';
  const selectedTeam = Number(document.getElementById('m-team')?.value) || 1;

  // Squad-team rank: players listed for the team being picked float up, then
  // the other sides in order, then unassigned.
  const teamRank = (p) => {
    const teams = (p.teams || []).filter(n => n >= 1 && n <= 3);
    if (!teams.length) return 99;
    if (teams.includes(selectedTeam)) return 0;
    return Math.min(...teams.map(t => Math.abs(t - selectedTeam))) * 2 + 1;
  };

  // Availability rank: those who said yes float to the top of the pool,
  // then maybes/unknown, then declines.
  const statusRank = (p) => {
    const s = data.selection.availability?.[p.id] || 'unknown';
    if (s === 'accepted') return 0;
    if (s === 'declined') return 2;
    return 1;
  };

  const sorted = data.squad.players.slice().sort((a, b) =>
    (statusRank(a) - statusRank(b)) || (teamRank(a) - teamRank(b)) || (a.name || '').localeCompare(b.name || ''));

  for (const p of sorted) {
    // Players already in the side or on the bench stay in place, greyed out,
    // so the grid doesn't reshuffle under you as you pick.
    const picked = isPicked(p.id);
    const tags = p.positions || [];
    if (filter === 'fwd' && tags.length && !tags.some(t => FORWARD_TAGS.includes(t))) continue;
    if (filter === 'back' && tags.length && !tags.some(t => BACK_TAGS.includes(t))) continue;
    const status = data.selection.availability?.[p.id] || 'unknown';
    const notInvolved = hasImport && !data.selection.availability?.[p.id];

    const li = document.createElement('li');
    li.className = 'pool-row' + ` rsvp-${status}` + (notInvolved ? ' not-involved' : '') + (picked ? ' in-order' : '');
    const tooltip = picked ? 'Already picked' : notInvolved ? 'Not on this Spond event' : `Spond: ${status}`;
    const teams = (p.teams || []).filter(n => n >= 1 && n <= 3);
    const teamBadge = teams.length ? `<span class="team-badge t-${teams.join('')}" title="${escapeHtml(teams.map(t => data.teamNames[t - 1]).join(', '))}">${teams.join('/')}</span>` : '';
    const s = data.stats?.[p.id];
    const statTip = s ? `${s.apps} apps · ${s.tries} tries · ${s.points} pts` : 'No appearances recorded this season';

    li.draggable = true;
    if (poolSelection.has(p.id)) li.classList.add('multi-selected');
    li.innerHTML = `<span class="status-dot status-${status}" title="${tooltip}"></span><span class="name" title="${escapeHtml(statTip)}">${escapeHtml(p.name)}</span>${teamBadge}<span class="role">${escapeHtml(tags.join(' / '))}</span>`;
    li.addEventListener('click', () => {
      if (picked) return;
      if (poolSelection.has(p.id)) poolSelection.delete(p.id);
      else poolSelection.add(p.id);
      renderPool();
    });
    li.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'copyMove';
      // If this row is part of a multi-select, drag the whole set so a single
      // drop fills consecutive slots starting at the drop target.
      if (poolSelection.size > 0 && poolSelection.has(p.id)) {
        e.dataTransfer.setData('text/source', 'pool-bulk');
        e.dataTransfer.setData('text/ids', JSON.stringify([...poolSelection]));
      } else {
        e.dataTransfer.setData('text/source', 'pool');
        e.dataTransfer.setData('text/id', p.id);
      }
      li.classList.add('dragging');
    });
    li.addEventListener('dragend', () => li.classList.remove('dragging'));
    availableUl.appendChild(li);
  }
  if (!availableUl.children.length) {
    availableUl.innerHTML = `<li class="muted small" style="padding:6px">${data.squad.players.length ? 'No players match this filter.' : 'No players yet — add them in Settings → Players.'}</li>`;
  }

  for (const id of [...poolSelection]) if (isPicked(id)) poolSelection.delete(id);
  const hint = document.getElementById('multi-select-hint');
  const cnt = document.getElementById('multi-select-count');
  if (hint && cnt) {
    hint.style.display = poolSelection.size > 0 ? '' : 'none';
    cnt.textContent = String(poolSelection.size);
  }
}

// Dropping a picked player back onto the pool removes them from the side.
const poolEl = document.getElementById('squad-pool');
poolEl.addEventListener('dragover', e => e.preventDefault());
poolEl.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.getData('text/source') !== 'slot') return;
  const list = listFor(e.dataTransfer.getData('text/list'));
  const idx = Number(e.dataTransfer.getData('text/index'));
  if (!Number.isNaN(idx)) { list[idx] = null; render(); }
});

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Manual "Save now" button forces an immediate save
document.getElementById('save-btn').addEventListener('click', () => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  doSave();
});

document.getElementById('clear-lineup-btn')?.addEventListener('click', () => {
  if (!state.lineup.some(Boolean)) return;
  if (!confirm('Clear the starting side?')) return;
  state.lineup = sized([], fmt().slots.length);
  render();
});
document.getElementById('clear-bench-btn')?.addEventListener('click', () => {
  if (!state.bench.some(Boolean)) return;
  if (!confirm('Clear the bench?')) return;
  state.bench = sized([], state.benchSize);
  render();
});

// Auto-save when match metadata changes
['m-title', 'm-team-name', 'm-date', 'm-kickoff', 'm-opposition', 'm-venue', 'm-homeaway'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => scheduleSave());
});
document.getElementById('m-team')?.addEventListener('change', (e) => {
  // A blank name box shows the chosen squad's name as its hint
  const nameBox = document.getElementById('m-team-name');
  if (nameBox) nameBox.placeholder = e.target.selectedOptions[0]?.textContent || '';
  renderPool();
  scheduleSave();
});
document.getElementById('m-format')?.addEventListener('change', (e) => setFormat(e.target.value));
document.getElementById('m-bench-size')?.addEventListener('change', (e) => setBenchSize(e.target.value));
document.getElementById('pool-position-filter')?.addEventListener('change', () => renderPool());

for (const [selId, key] of [['m-captain', 'captainId'], ['m-vice', 'viceCaptainId'], ['m-kicker', 'kickerId']]) {
  document.getElementById(selId)?.addEventListener('change', (e) => {
    state[key] = e.target.value || null;
    render();
  });
}

// ── Spond ────────────────────────────────────────────────────────────────
// Pull RSVPs for a given Spond event id and refresh the pool availability.
async function importSpondEvent(eventId) {
  const btn = document.getElementById('spond-import');
  const summary = document.getElementById('spond-summary');
  if (!eventId) {
    summary.textContent = 'Pick a Spond event above first.';
    return;
  }
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '↻ syncing…';
  summary.textContent = '';
  try {
    const res = await fetch('/spond-availability/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, sourceUrl: `https://spond.com/client/sponds/${eventId}/` }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Import failed');
    data.selection.availability = json.availability;
    data.selection.spondEvent = {
      id: eventId,
      name: json.eventName || '',
      url: `https://spond.com/client/sponds/${eventId}/`,
      importedAt: new Date().toISOString(),
    };
    const counts = { accepted: 0, declined: 0, unanswered: 0 };
    for (const v of Object.values(json.availability)) counts[v] = (counts[v] || 0) + 1;
    const parts = [
      `${counts.accepted || 0} in`,
      `${counts.declined || 0} out`,
      `${counts.unanswered || 0} pending`,
    ];
    if (json.unmatchedSquad?.length) parts.push(`${json.unmatchedSquad.length} not invited`);
    if (json.unmatchedSpond?.length) parts.push(`${json.unmatchedSpond.length} extra in Spond`);
    summary.textContent = parts.join(' · ');

    // Name lists go below the pool, folded away, so they never push the
    // players out of reach. The closest-Spond hint helps spot a misspelling.
    let detailHtml = '';
    if (json.unmatchedSquad?.length) {
      const rows = json.unmatchedSquad.map(p => {
        const hint = p.closestSpond
          ? ` <span class="muted small">— closest Spond: "<em>${escapeHtml(p.closestSpond.name)}</em>" (edit distance ${p.closestSpond.distance})</span>`
          : '';
        return `<li>${escapeHtml(p.squadName)}${hint}</li>`;
      }).join('');
      detailHtml += `<details class="muted small" style="margin-top:8px"><summary><strong>Squad not on this Spond event (${json.unmatchedSquad.length})</strong></summary><ul style="margin:.2rem 0 0 0;padding-left:1.2rem">${rows}</ul></details>`;
    }
    if (json.unmatchedSpond?.length) {
      const names = json.unmatchedSpond.map(p => `${p.name} (${p.status})`).join(', ');
      detailHtml += `<details class="muted small" style="margin-top:6px"><summary><strong>Spond extras, not in squad (${json.unmatchedSpond.length})</strong></summary>${escapeHtml(names)}`
        + `<div><button type="button" id="spond-add-squad" class="btn" style="margin-top:6px">Add Spond players to squad</button></div></details>`;
    }
    let detail = document.getElementById('spond-detail');
    if (!detail) {
      detail = document.createElement('div');
      detail.id = 'spond-detail';
      document.getElementById('squad-pool').insertAdjacentElement('afterend', detail);
    }
    detail.innerHTML = detailHtml;
    document.getElementById('spond-add-squad')?.addEventListener('click', () => addSpondPlayersToSquad(eventId));

    renderPool();
  } catch (e) {
    summary.textContent = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

// Seed the squad from the event's Spond group, re-match RSVPs against the new
// players, then reload so the pool (built from the page's squad data) shows them.
async function addSpondPlayersToSquad(eventId) {
  const btn = document.getElementById('spond-add-squad');
  const summary = document.getElementById('spond-summary');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    const res = await fetch('/spond-availability/add-to-squad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Add failed');
    summary.textContent = `Added ${json.added} players — refreshing…`;
    await fetch('/spond-availability/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, sourceUrl: `https://spond.com/client/sponds/${eventId}/` }),
    });
    location.reload();
  } catch (e) {
    summary.textContent = 'Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = 'Add Spond players to squad'; }
  }
}

document.getElementById('spond-import')?.addEventListener('click', () => {
  const sel = document.getElementById('spond-event-select');
  importSpondEvent(sel?.value || '');
});

// Populate the select with upcoming events (nearest first) so the coach can
// pick one without copying a URL off spond.com. Selecting an event imports it.
async function loadSpondEvents() {
  const sel = document.getElementById('spond-event-select');
  if (!sel) return;
  const currentId = sel.dataset.current || '';
  try {
    const res = await fetch('/spond-availability/events', { method: 'POST' });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Lookup failed');
    const now = Date.now() - 12 * 3600 * 1000;   // keep today's event even if it's already started
    const upcoming = (json.events || [])
      .filter(e => !e.startTimestamp || new Date(e.startTimestamp).getTime() >= now)
      .sort((a, b) => new Date(a.startTimestamp || 0) - new Date(b.startTimestamp || 0));
    if (!upcoming.length) {
      sel.innerHTML = '<option value="">No upcoming events found</option>';
      return;
    }
    sel.innerHTML = '<option value="">— pick an event —</option>' + upcoming.map(e => {
      const when = e.startTimestamp
        ? new Date(e.startTimestamp).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        : '';
      const label = [when, e.name].filter(Boolean).join(' · ');
      return `<option value="${escapeHtml(e.id)}" ${e.id === currentId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  } catch (e) {
    sel.innerHTML = `<option value="">Spond not connected</option>`;
    const summary = document.getElementById('spond-summary');
    if (summary) summary.textContent = /SPOND_EMAIL/.test(e.message) ? 'Add your Spond login in Settings to import RSVPs.' : 'Spond events error: ' + e.message;
  }
}

// Keep the "Open in Spond" link (new tab) pointing at the selected event.
function updateSpondLink(eventId) {
  const a = document.getElementById('spond-open-link');
  if (!a) return;
  a.href = eventId ? `https://spond.com/client/sponds/${encodeURIComponent(eventId)}/` : 'https://spond.com/client/';
  a.textContent = eventId ? 'Open this event in Spond ↗' : 'Open Spond ↗';
}

document.getElementById('spond-event-select')?.addEventListener('change', (e) => {
  updateSpondLink(e.target.value);
  if (e.target.value) importSpondEvent(e.target.value);
});

loadSpondEvents();

// ── Next fixture ──────────────────────────────────────────────────────────
// Pull date / kick-off / opposition / venue from the next fixture (from today)
// on the Fixtures page for the selected team.
async function applyNextFixture({ silent = false } = {}) {
  const btn = document.getElementById('next-fixture-btn');
  const status = document.getElementById('next-fixture-status');
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '↻ loading…'; }
  if (status && !silent) status.textContent = 'Looking up next fixture…';
  try {
    const team = document.getElementById('m-team').value;
    const res = await fetch('/fixtures/next?team=' + encodeURIComponent(team));
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Lookup failed');
    if (!json.fixture) {
      if (status && !silent) status.textContent = 'No upcoming fixtures — add them on the Fixtures page.';
      return false;
    }
    const f = json.fixture;
    const set = (id, v) => { if (v) document.getElementById(id).value = v; };
    set('m-date', f.date);
    set('m-kickoff', f.kickoff);
    set('m-opposition', f.opposition);
    set('m-venue', f.venue);
    set('m-homeaway', f.homeAway);
    if (f.competition && !document.getElementById('m-title').value) set('m-title', f.competition);
    state.fixtureId = f.id;
    scheduleSave();
    if (status) {
      const when = f.date ? new Date(f.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
      status.textContent = `Loaded: ${[f.opposition, f.homeAway === 'away' ? 'away' : 'home', f.venue, when].filter(Boolean).join(' · ')}`;
    }
    return true;
  } catch (e) {
    if (status) status.textContent = 'Error: ' + e.message;
    return false;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

document.getElementById('next-fixture-btn')?.addEventListener('click', () => applyNextFixture());

document.getElementById('multi-select-clear')?.addEventListener('click', () => {
  poolSelection.clear();
  renderPool();
});

const subPlan = createSubPlan({ state, fmt, squadById, onChange: render, escapeHtml });

renderBenchSizeOptions();
render();

// On first load, if the match details are blank, auto-fill from the next fixture
// so the builder opens already pointed at the upcoming game.
if (!data.selection.matchDate && !data.selection.opposition && !data.selection.venue) {
  applyNextFixture({ silent: true });
}

// After initial render, enable autosave so future render() calls persist changes
autosaveReady = true;
