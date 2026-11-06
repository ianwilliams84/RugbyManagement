import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { loadSquad, saveSquad, loadSelection, saveSelection, loadSettings, newId, paths } from '../data.js';
import { listEvents, getEvent, extractAvailability, autoMatch, groupPlayerNames } from '../spond/api.js';
import { loginInfo, reloginWith, configuredEmail } from '../spond/auth.js';
import { secretsEnvPath } from '../envPath.js';

const DEBUG_DIR = path.join(paths.dataDir, 'cache');

const router = express.Router();

router.post('/test', async (req, res) => {
  try {
    const info = await loginInfo();
    res.json(info);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Re-login with new credentials. Body: { email, password }. Both required.
// On success the new creds are also persisted to the secrets env file
// (preserving any other lines in that file) so they survive a server restart.
router.post('/relogin', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'Both email and password are required.' });
  try {
    await reloginWith({ email, password });
    // Persist to the secrets file (best-effort — auth still works for this session even if writing fails)
    try {
      let text = '';
      try { text = await fs.readFile(secretsEnvPath, 'utf8'); } catch {}
      text = upsertEnvLine(text, 'SPOND_EMAIL', email);
      text = upsertEnvLine(text, 'SPOND_PASSWORD', password);
      await fs.writeFile(secretsEnvPath, text, 'utf8');
    } catch (e) { console.error(`Could not persist ${secretsEnvPath}:`, e.message); }
    res.json({ ok: true, email: configuredEmail() });
  } catch (e) {
    res.status(401).json({ ok: false, error: e.message });
  }
});

// Add or update a `KEY=VALUE` line in a .env-style text blob. Preserves the
// rest of the file. Values containing spaces or # get double-quoted.
function upsertEnvLine(text, key, value) {
  const needsQuote = /\s|#/.test(value);
  const escaped = needsQuote ? `"${String(value).replace(/"/g, '\\"')}"` : String(value);
  const newLine = `${key}=${escaped}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (re.test(text)) return text.replace(re, newLine);
  const sep = text.length === 0 || text.endsWith('\n') ? '' : '\n';
  return text + sep + newLine + '\n';
}

router.post('/events', async (req, res) => {
  try {
    const events = await listEvents({ max: 30 });
    res.json({
      ok: true,
      events: (events || []).map(e => ({
        id: e.id,
        name: e.heading || e.name || '(unnamed)',
        startTimestamp: e.startTimestamp,
        memberCount: (e.recipients?.group?.members || []).length,
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Add every player in the event's Spond group who isn't already in the squad
// (matched on name, case-insensitive). Body: { eventId }.
router.post('/add-to-squad', async (req, res) => {
  try {
    const eventId = req.body?.eventId;
    if (!eventId) return res.status(400).json({ ok: false, error: 'Pick a Spond event first.' });
    const event = await getEvent(eventId);
    const squad = await loadSquad();
    const existing = new Set(squad.players.map(p => p.name.trim().toLowerCase()));
    let added = 0;
    for (const name of groupPlayerNames(event)) {
      const clean = name.replace(/\s+/g, ' ').slice(0, 100);
      if (existing.has(clean.toLowerCase())) continue;
      existing.add(clean.toLowerCase());
      squad.players.push({ id: newId('p'), name: clean, positions: [], teams: [], notes: '' });
      added++;
    }
    await saveSquad(squad);
    res.json({ ok: true, added, total: squad.players.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const settings = await loadSettings();
    const eventId = req.body?.eventId || settings.spond?.currentEventId;
    if (!eventId) {
      return res.status(400).json({ ok: false, error: 'No event id. Set one in Settings or pass {eventId} in the body.' });
    }
    const event = await getEvent(eventId);

    // Stash a copy of the raw event for diagnostics — the user can share this
    // file when names aren't matching so we can see what Spond actually sent.
    try {
      await fs.mkdir(DEBUG_DIR, { recursive: true });
      await fs.writeFile(
        path.join(DEBUG_DIR, `spond-event-${String(eventId).replace(/[^A-Z0-9]/gi, '').slice(0, 32)}.json`),
        JSON.stringify(event, null, 2)
      );
    } catch (e) { /* non-fatal */ }

    const members = extractAvailability(event);
    const squad = await loadSquad();
    const result = autoMatch(members, squad.players);

    if (result.unmatchedSquad.length || result.unmatchedSpond.length) {
      console.log('\n[spond-import] ===== Match diagnostics =====');
      console.log(`  Spond members (${members.length}):`);
      members.forEach(m => {
        const raw = m._raw || {};
        console.log(`    id=${m.id} firstName="${m.firstName}" lastName="${m.lastName}"  raw: ${JSON.stringify(raw)}`);
      });
      console.log(`  Squad players (${squad.players.length}):`);
      squad.players.forEach(p => console.log(`    id=${p.id} name="${p.name}"`));
      if (result.unmatchedSquad.length) {
        console.log(`  Unmatched squad (${result.unmatchedSquad.length}):`);
        result.unmatchedSquad.forEach(p => {
          const hint = p.closestSpond ? ` — closest Spond: "${p.closestSpond.name}" (dist=${p.closestSpond.distance})` : '';
          console.log(`    "${p.squadName}" → norm="${p.squadNameNorm || ''}"${hint}`);
        });
      }
      if (result.unmatchedSpond.length) {
        console.log(`  Unmatched Spond (${result.unmatchedSpond.length}):`);
        result.unmatchedSpond.forEach(p => console.log(`    "${p.name}" → norm="${p.nameNorm}" raw=${JSON.stringify(p.raw)}`));
      }
      console.log('[spond-import] ============================\n');
    }

    const availability = {};
    for (const m of result.matched) availability[m.squadId] = m.status;

    const sel = await loadSelection();
    sel.availability = availability;
    sel.spondEvent = {
      id: event.id,
      name: event.heading || event.name || '',
      startTimestamp: event.startTimestamp,
      importedAt: new Date().toISOString(),
      url: req.body?.sourceUrl || sel.spondEvent?.url || '',
    };
    await saveSelection(sel);

    res.json({
      ok: true,
      eventName: sel.spondEvent.name,
      eventDate: sel.spondEvent.startTimestamp,
      availability,
      matched: result.matched,
      unmatchedSquad: result.unmatchedSquad,
      unmatchedSpond: result.unmatchedSpond,
      totalMembers: members.length,
    });
  } catch (e) {
    console.error('Spond import failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
