import { POINTS } from './rugby.js';

const data = JSON.parse(document.getElementById('initial-data').textContent);
const squadById = Object.fromEntries(data.squad.players.map(p => [p.id, p]));
const editor = document.getElementById('match-editor');
const tbody = document.getElementById('lines-tbody');
const $ = (id) => document.getElementById(id);

let current = null;   // the match being edited

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const linePoints = (l) => (l.tries || 0) * POINTS.try + (l.cons || 0) * POINTS.con + (l.pens || 0) * POINTS.pen + (l.dgs || 0) * POINTS.dg;

function open(match, title) {
  current = JSON.parse(JSON.stringify(match));
  $('editor-title').textContent = title;
  $('r-date').value = current.date || '';
  $('r-kickoff').value = current.kickoff || '';
  $('r-team').value = String(current.team || 1);
  $('r-opposition').value = current.opposition || '';
  $('r-homeaway').value = current.homeAway || 'home';
  $('r-venue').value = current.venue || '';
  $('r-competition').value = current.competition || '';
  $('r-format').value = String(current.format || 15);
  $('r-for').value = current.scoreFor ?? '';
  $('r-against').value = current.scoreAgainst ?? '';
  $('r-htfor').value = current.htFor ?? '';
  $('r-htagainst').value = current.htAgainst ?? '';
  $('r-oppscorers').value = current.oppositionScorers || '';
  $('r-notes').value = current.notes || '';
  $('fixture-select').value = current.fixtureId || '';
  $('delete-match-btn').hidden = !current.id;
  const link = $('report-link');
  link.hidden = !current.id;
  if (current.id) link.href = '/report?id=' + encodeURIComponent(current.id);
  $('match-status').textContent = '';
  renderLines();
  editor.hidden = false;
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// People on the team sheet drive the captain / POTM dropdowns and the
// "add player" list (everyone not already listed).
function refreshSelects() {
  const listed = current.players.map(l => l.id);
  const opts = (sel) => '<option value="">— none —</option>' + listed
    .map(id => `<option value="${esc(id)}" ${id === sel ? 'selected' : ''}>${esc(squadById[id]?.name || '?')}</option>`).join('');
  if (current.captainId && !listed.includes(current.captainId)) current.captainId = null;
  if (current.momId && !listed.includes(current.momId)) current.momId = null;
  $('r-captain').innerHTML = opts(current.captainId);
  $('r-mom').innerHTML = opts(current.momId);
  const rest = data.squad.players.filter(p => !listed.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  $('add-line-select').innerHTML = rest.length
    ? rest.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')
    : '<option value="">(whole squad listed)</option>';
}

function renderLines() {
  const num = (l, key, max) => `<input type="number" min="0" max="${max}" class="n-in" data-key="${key}" value="${l[key] || 0}">`;
  tbody.innerHTML = current.players.map((l, i) => `
    <tr data-i="${i}" class="${l.role === 'bench' && l.played === false ? 'muted' : ''}">
      <td><input type="number" min="1" max="99" class="n-in shirt-in" data-key="shirt" value="${l.shirt || ''}"></td>
      <td>${esc(squadById[l.id]?.name || 'Removed player')}</td>
      <td><select class="role-in"><option value="start" ${l.role === 'start' ? 'selected' : ''}>Start</option><option value="bench" ${l.role === 'bench' ? 'selected' : ''}>Bench</option></select></td>
      <td><input type="checkbox" class="played-in" ${l.role === 'start' || l.played !== false ? 'checked' : ''} ${l.role === 'start' ? 'disabled' : ''}></td>
      <td>${num(l, 'tries', 20)}</td><td>${num(l, 'cons', 30)}</td><td>${num(l, 'pens', 30)}</td><td>${num(l, 'dgs', 10)}</td>
      <td>${num(l, 'yellow', 2)}</td><td>${num(l, 'red', 1)}</td>
      <td class="pts"><strong>${linePoints(l)}</strong></td>
      <td><button type="button" class="btn small x-line" title="Remove from this match">×</button></td>
    </tr>`).join('') || '<tr><td colspan="12" class="muted">No players listed — pick a team in the Team Builder, or add players below.</td></tr>';

  tbody.querySelectorAll('tr[data-i]').forEach(tr => {
    const l = current.players[Number(tr.dataset.i)];
    tr.querySelectorAll('.n-in').forEach(inp => inp.addEventListener('input', () => {
      l[inp.dataset.key] = Math.max(0, parseInt(inp.value, 10) || 0);
      tr.querySelector('.pts strong').textContent = linePoints(l);
      checkPoints();
    }));
    tr.querySelector('.role-in').addEventListener('change', (e) => { l.role = e.target.value; if (l.role === 'start') l.played = true; renderLines(); });
    tr.querySelector('.played-in').addEventListener('change', (e) => { l.played = e.target.checked; renderLines(); });
    tr.querySelector('.x-line').addEventListener('click', () => { current.players.splice(Number(tr.dataset.i), 1); renderLines(); });
  });
  refreshSelects();
  checkPoints();
}

// Sanity check: do the individual scores add up to our final score?
function checkPoints() {
  const el = $('points-check');
  const total = current.players.reduce((s, l) => s + linePoints(l), 0);
  const ft = $('r-for').value;
  if (ft === '') { el.textContent = total ? `Scorers total ${total} pts.` : ''; return; }
  const diff = Number(ft) - total;
  el.innerHTML = diff === 0
    ? `✓ Scorers add up to ${total}.`
    : `Scorers total <strong>${total}</strong> vs final score <strong>${ft}</strong> (${diff > 0 ? diff + ' unaccounted — penalty try?' : Math.abs(diff) + ' too many'}).`;
}
$('r-for').addEventListener('input', checkPoints);

$('add-line-btn').addEventListener('click', () => {
  const id = $('add-line-select').value;
  if (!id) return;
  const maxShirt = current.players.reduce((m, l) => Math.max(m, l.shirt || 0), 0);
  current.players.push({ id, shirt: maxShirt + 1, role: 'bench', played: true, tries: 0, cons: 0, pens: 0, dgs: 0, yellow: 0, red: 0 });
  renderLines();
});

$('fixture-select').addEventListener('change', async (e) => {
  if (!e.target.value) { current.fixtureId = null; return; }
  const res = await fetch('/results/draft?fixture=' + encodeURIComponent(e.target.value));
  const json = await res.json();
  if (!json.ok) return;
  const d = json.match;
  current.fixtureId = d.fixtureId;
  for (const [key, el] of [['date', 'r-date'], ['kickoff', 'r-kickoff'], ['opposition', 'r-opposition'], ['venue', 'r-venue'], ['competition', 'r-competition'], ['homeAway', 'r-homeaway'], ['team', 'r-team']]) {
    if (d[key]) $(el).value = String(d[key]);
  }
});

$('new-match-btn').addEventListener('click', async () => {
  const res = await fetch('/results/draft');
  const json = await res.json();
  if (json.ok) open(json.match, 'Record match');
});

document.querySelectorAll('.edit-match-btn').forEach(btn => btn.addEventListener('click', () => loadAndOpen(btn.dataset.id)));

async function loadAndOpen(id) {
  const res = await fetch('/results/match/' + encodeURIComponent(id));
  const json = await res.json();
  if (json.ok) open(json.match, 'Edit match');
}

$('cancel-match-btn').addEventListener('click', () => { editor.hidden = true; current = null; });

$('save-match-btn').addEventListener('click', async () => {
  const status = $('match-status');
  const body = {
    ...current,
    date: $('r-date').value,
    kickoff: $('r-kickoff').value,
    team: Number($('r-team').value),
    opposition: $('r-opposition').value,
    homeAway: $('r-homeaway').value,
    venue: $('r-venue').value,
    competition: $('r-competition').value,
    format: Number($('r-format').value),
    scoreFor: $('r-for').value,
    scoreAgainst: $('r-against').value,
    htFor: $('r-htfor').value,
    htAgainst: $('r-htagainst').value,
    captainId: $('r-captain').value || null,
    momId: $('r-mom').value || null,
    oppositionScorers: $('r-oppscorers').value,
    notes: $('r-notes').value,
  };
  status.textContent = 'Saving…';
  try {
    const res = await fetch('/results/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || res.statusText);
    status.textContent = 'Saved. Reloading…';
    const season = json.match.season;
    setTimeout(() => { location.href = `/results?season=${encodeURIComponent(season)}&id=${encodeURIComponent(json.match.id)}`; }, 500);
  } catch (e) {
    status.textContent = 'Failed: ' + e.message;
  }
});

$('delete-match-btn').addEventListener('click', async () => {
  if (!current?.id || !confirm(`Delete the match vs ${current.opposition}? Player stats from it will be removed.`)) return;
  const res = await fetch('/results/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: current.id }) });
  if (res.ok) location.href = '/results';
});

// Deep links: /results?id=… opens that match; /results?fixture=… starts a new one from a fixture.
if (data.openId) loadAndOpen(data.openId);
else if (data.fixtureId) {
  fetch('/results/draft?fixture=' + encodeURIComponent(data.fixtureId)).then(r => r.json()).then(json => { if (json.ok) open(json.match, 'Record match'); });
}
