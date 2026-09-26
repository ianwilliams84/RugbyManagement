// Interactive formation editor for the Spond export page.
// Drag each shirt around the pitch; positions (stored as percentages of the
// pitch box, keyed by shirt number) autosave to selection.formationPositions.
const data = JSON.parse(document.getElementById('formation-data').textContent);
const field = document.getElementById('field');
const statusEl = document.getElementById('formation-save-status');
const tbody = document.getElementById('formation-tbody');

// In-memory positions: { [shirtNumber]: { x, y } } as percentages (0–100).
const positions = { ...(data.positions || {}) };

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Chip label — surname, since that's what goes on the back of a shirt. Falls
// back to the position short code for unfilled shirts.
function chipLabel(p) {
  if (!p.name) return p.short;
  const parts = String(p.name).trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}

let saveTimer = null;
function scheduleSave() {
  if (statusEl) statusEl.textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 500);
}
async function doSave() {
  try {
    const res = await fetch('/spond/formation-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formationPositions: positions }),
    });
    if (!res.ok) throw new Error('save failed');
    if (statusEl) statusEl.textContent = `Saved · ${new Date().toLocaleTimeString('en-GB')}`;
  } catch {
    if (statusEl) statusEl.textContent = 'Save failed';
  }
}

function clampPct(v) { return Math.max(3, Math.min(97, v)); }

function placeChip(chip, pos) {
  chip.style.left = pos.x + '%';
  chip.style.top = pos.y + '%';
}

// Pointer drag: works for mouse and touch. Client coords are translated into a
// percentage of the pitch box so positions stay correct at any render size.
function makeDraggable(chip, num) {
  let dragging = false;
  const onDown = (e) => {
    dragging = true;
    chip.setPointerCapture?.(e.pointerId);
    chip.classList.add('dragging');
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!dragging) return;
    const rect = field.getBoundingClientRect();
    const x = clampPct(((e.clientX - rect.left) / rect.width) * 100);
    const y = clampPct(((e.clientY - rect.top) / rect.height) * 100);
    positions[num] = { x, y };
    placeChip(chip, positions[num]);
  };
  const onUp = (e) => {
    if (!dragging) return;
    dragging = false;
    chip.classList.remove('dragging');
    chip.releasePointerCapture?.(e.pointerId);
    scheduleSave();
  };
  chip.addEventListener('pointerdown', onDown);
  chip.addEventListener('pointermove', onMove);
  chip.addEventListener('pointerup', onUp);
  chip.addEventListener('pointercancel', onUp);
}

function render() {
  field.querySelectorAll('.pitch-chip').forEach(c => c.remove());
  for (const p of data.roster) {
    const chip = document.createElement('div');
    chip.className = 'pitch-chip' + (p.unit === 'back' ? ' is-back' : ' is-fwd') + (p.id ? '' : ' is-vacant');
    chip.innerHTML = `<span class="pc-num">${p.num}</span><span class="pc-name">${escapeHtml(chipLabel(p))}${p.isCaptain ? ' (C)' : ''}${p.isVice ? ' (VC)' : ''}</span>`;
    chip.title = `${p.num} · ${p.pos}${p.name ? ' — ' + p.name : ''}`;
    const pos = positions[p.num] || { x: p.x, y: p.y };
    placeChip(chip, pos);
    makeDraggable(chip, p.num);
    field.appendChild(chip);
  }
}

function renderTable() {
  if (!tbody) return;
  tbody.innerHTML = data.roster.map(p => `<tr${p.id ? '' : ' class="muted"'}>
      <td><strong>${p.num}</strong></td>
      <td>${escapeHtml(p.name || '—')}${p.isCaptain ? ' <span class="role-badge">C</span>' : ''}${p.isVice ? ' <span class="role-badge">VC</span>' : ''}</td>
      <td class="muted">${escapeHtml(p.pos)}</td>
    </tr>`).join('');
}

document.getElementById('formation-reset')?.addEventListener('click', () => {
  for (const k of Object.keys(positions)) delete positions[k];
  render();
  scheduleSave();
});

render();
renderTable();
