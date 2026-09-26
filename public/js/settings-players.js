(() => {
  const cfg = JSON.parse(document.getElementById('settings-data').textContent);
  const tbody = document.getElementById('players-tbody');

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  const checked = (root) => [...root.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || res.statusText);
    return json;
  }

  async function loadPlayers() {
    try {
      const res = await fetch('/players');
      const json = await res.json();
      renderTable(json.players || []);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Failed to load: ${esc(e.message)}</td></tr>`;
    }
  }

  // Sort key for squad-team membership:
  //   [1]→(1,1)  [1,2]→(1,2)  [2]→(2,1) … no team →(99,99). Ties break by name.
  function teamSortKey(teams) {
    const t = (teams || []).filter(n => Number.isInteger(n) && n >= 1 && n <= 3);
    if (!t.length) return [99, 99];
    return [Math.min(...t), t.length];
  }

  function tagPicker(cls, options, current) {
    return `<div class="tag-picker ${cls}">` + options.map(([v, l]) =>
      `<label class="tag-tick"><input type="checkbox" value="${esc(v)}" ${current.includes(v) ? 'checked' : ''}> ${esc(l)}</label>`).join('') + '</div>';
  }

  function renderTable(players) {
    if (!players.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No players yet. Paste names above to add your squad.</td></tr>';
      return;
    }
    const sorted = players.slice().sort((a, b) => {
      const ka = teamSortKey(a.teams), kb = teamSortKey(b.teams);
      return (ka[0] - kb[0]) || (ka[1] - kb[1]) || (a.name || '').localeCompare(b.name || '');
    });
    const teamOpts = [1, 2, 3].map(n => [String(n), cfg.teamNames[n - 1] || `Team ${n}`]);
    tbody.innerHTML = sorted.map(p => `
      <tr data-id="${esc(p.id)}">
        <td class="view-name"><strong>${esc(p.name)}</strong></td>
        <td class="muted small">${esc((p.positions || []).join(', ') || '—')}</td>
        <td class="muted small">${(p.teams || []).map(n => esc(cfg.teamNames[n - 1] || n)).join(', ') || '—'}</td>
        <td class="muted small">${esc(p.notes || '')}</td>
        <td class="muted small"><code>${esc(p.id)}</code></td>
        <td class="row-actions">
          <button class="btn small edit-btn">Edit</button>
          <button class="btn small danger delete-btn">Delete</button>
        </td>
      </tr>
      <tr class="edit-row" data-id="${esc(p.id)}" hidden>
        <td><input class="edit-name" value="${esc(p.name)}"></td>
        <td>${tagPicker('edit-positions', cfg.positionTags.map(t => [t, t]), p.positions || [])}</td>
        <td>${tagPicker('edit-teams', teamOpts, (p.teams || []).map(String))}</td>
        <td colspan="2"><input class="edit-notes" value="${esc(p.notes || '')}" placeholder="Notes"></td>
        <td class="row-actions">
          <button class="btn small primary save-btn">Save</button>
          <button class="btn small cancel-btn">Cancel</button>
        </td>
      </tr>`).join('');

    const viewRow = (id) => tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]:not(.edit-row)`);
    const editRow = (id) => tbody.querySelector(`tr.edit-row[data-id="${CSS.escape(id)}"]`);

    tbody.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      viewRow(id).hidden = true;
      editRow(id).hidden = false;
    }));
    tbody.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('tr').dataset.id;
      viewRow(id).hidden = false;
      editRow(id).hidden = true;
    }));
    tbody.querySelectorAll('.save-btn').forEach(btn => btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await post('/players/save', {
          id: row.dataset.id,
          name: row.querySelector('.edit-name').value,
          positions: checked(row.querySelector('.edit-positions')),
          teams: checked(row.querySelector('.edit-teams')).map(Number),
          notes: row.querySelector('.edit-notes').value,
        });
        await loadPlayers();
      } catch (e) {
        alert('Save failed: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    }));
    tbody.querySelectorAll('.delete-btn').forEach(btn => btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const name = row.querySelector('.view-name')?.textContent || row.dataset.id;
      if (!confirm(`Delete "${name}"? Their recorded match history is kept.`)) return;
      btn.disabled = true;
      try {
        await post('/players/delete', { id: row.dataset.id });
        await loadPlayers();
      } catch (e) {
        alert('Delete failed: ' + e.message);
        btn.disabled = false;
      }
    }));
  }

  document.getElementById('add-btn').addEventListener('click', async () => {
    const status = document.getElementById('add-status');
    const names = document.getElementById('add-names').value;
    if (!names.trim()) { status.textContent = 'Enter at least one name.'; return; }
    status.textContent = 'Adding…';
    try {
      const json = await post('/players/add', {
        names,
        positions: checked(document.getElementById('add-positions')),
        teams: checked(document.getElementById('add-teams')).map(Number),
      });
      status.textContent = `Added ${json.added}${json.skipped ? ` · ${json.skipped} already in the squad` : ''} · total ${json.total}.`;
      document.getElementById('add-names').value = '';
      await loadPlayers();
    } catch (e) {
      status.textContent = 'Failed: ' + e.message;
    }
  });

  document.getElementById('delete-all-btn').addEventListener('click', async () => {
    if (!confirm('Delete ALL players? Recorded match history is kept, but names will show as unknown.')) return;
    await post('/players/delete-all', {});
    await loadPlayers();
  });

  loadPlayers();
})();
