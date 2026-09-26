(() => {
  const init = JSON.parse(document.getElementById('initial-data').textContent);

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  let current = null;   // match summary from /report/match/:id

  document.querySelectorAll('.load-match-btn').forEach(btn => {
    btn.addEventListener('click', () => loadMatch(btn.dataset.id));
  });

  // ── Step 2: load the match summary ─────────────────────────────────────────
  async function loadMatch(id) {
    const section = document.getElementById('scorecard-section');
    document.getElementById('report-output').hidden = true;
    document.querySelectorAll('.match-list-row').forEach(r => r.classList.toggle('active', r.dataset.id === id));
    try {
      const res = await fetch('/report/match/' + encodeURIComponent(id));
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      current = json.summary;
      renderSummary(current);
      document.getElementById('edit-match-link').href = '/results?id=' + encodeURIComponent(id);
      section.hidden = false;
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      alert('Failed to load match: ' + e.message);
    }
  }

  function renderSummary(s) {
    const ft = Object.entries(s.fullTime).map(([k, v]) => `${esc(k)} ${v === '' ? '?' : v}`).join(' – ');
    const ht = s.halfTime ? Object.values(s.halfTime).join('–') : null;
    document.getElementById('scorecard-title').textContent =
      `${s.team} ${s.homeAway === 'away' ? '@' : 'vs'} ${s.opposition} · ${s.date}${s.venue ? ' · ' + s.venue : ''}${s.competition ? ' · ' + s.competition : ''}`;
    let html = `<p class="score-headline"><strong>${ft}</strong> <span class="muted">(${esc(s.result)}${ht ? ` · HT ${esc(ht)}` : ''})</span></p>`;
    html += '<div class="report-meta">';
    if (s.playerOfTheMatch) html += `<span>Player of the Match: <strong>${esc(s.playerOfTheMatch)}</strong></span>`;
    if (s.captain) html += `<span>Captain: <strong>${esc(s.captain)}</strong></span>`;
    html += '</div>';
    html += '<table class="scorecard-table"><thead><tr><th>#</th><th>Player</th><th>Position</th><th>T</th><th>C</th><th>P</th><th>DG</th><th>Pts</th><th>Cards</th></tr></thead><tbody>';
    for (const l of s.teamSheet) {
      const cards = [l.yellowCards ? '🟨'.repeat(l.yellowCards) : '', l.redCards ? '🟥' : ''].join('');
      const dim = l.role === 'bench' && l.cameOn === false ? ' class="muted"' : '';
      html += `<tr${dim}><td>${l.shirt}</td><td>${esc(l.name)}</td><td class="muted">${esc(l.position)}</td><td>${l.tries || ''}</td><td>${l.conversions || ''}</td><td>${l.penalties || ''}</td><td>${l.dropGoals || ''}</td><td><strong>${l.points || ''}</strong></td><td>${cards}</td></tr>`;
    }
    html += '</tbody></table>';
    if (s.oppositionScorers) html += `<p class="muted small"><strong>Opposition scorers:</strong> ${esc(s.oppositionScorers)}</p>`;
    if (s.coachNotes) html += `<p class="muted small"><strong>Coach notes:</strong> ${esc(s.coachNotes)}</p>`;
    else html += '<p class="muted small">No coach notes on this match — the report will stick to the score and scorers.</p>';
    document.getElementById('scorecard-body').innerHTML = html;
  }

  // ── Step 3: generate report ──────────────────────────────────────────────
  document.getElementById('generate-btn').addEventListener('click', async () => {
    if (!current) return;
    const btn = document.getElementById('generate-btn');
    const status = document.getElementById('gen-status');
    const out = document.getElementById('report-output');
    btn.disabled = true;
    status.textContent = 'Asking Claude… (20–60 s)';
    out.hidden = true;
    try {
      const res = await fetch('/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || 'Failed');
      document.getElementById('report-body').innerHTML = json.report.html;
      if (json.report.usage) {
        const u = json.report.usage;
        document.getElementById('usage').textContent =
          `Model: ${json.report.model} · in ${u.input_tokens} / out ${u.output_tokens} tokens`;
      }
      out.hidden = false;
      status.textContent = 'Done.';
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('download-html')?.addEventListener('click', () => {
    const reportHtml = document.getElementById('report-body').innerHTML;
    if (!reportHtml.trim()) return;
    const filename = buildFilename();
    const doc = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${esc(filename.replace(/\.html?$/, ''))}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.55; color: #222; }
  h1 { color: ${init.primary}; border-bottom: 3px solid ${init.primary}; padding-bottom: .3rem; }
  h2 { color: ${init.dark}; margin-top: 1.8rem; }
  ul { padding-left: 1.4rem; } li { margin: .25rem 0; }
</style>
</head>
<body>
${reportHtml}
</body>
</html>`;
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });

  // e.g. 2026-10-04-1st-XV-vs-Old-Boys.html
  function buildFilename() {
    if (!current) return 'match-report.html';
    const name = [current.date, current.team, 'vs', current.opposition].join('-')
      .replace(/[\\/:*?"<>|]+/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100);
    return (name || 'match-report') + '.html';
  }

  document.getElementById('copy-html')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.getElementById('report-body').innerHTML);
    flash('copy-html', 'Copied HTML');
  });
  document.getElementById('copy-text')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.getElementById('report-body').innerText);
    flash('copy-text', 'Copied text');
  });

  function flash(id, msg) {
    const el = document.getElementById(id);
    const orig = el.textContent;
    el.textContent = msg;
    setTimeout(() => { el.textContent = orig; }, 1200);
  }

  if (init.openId) loadMatch(init.openId);
})();
