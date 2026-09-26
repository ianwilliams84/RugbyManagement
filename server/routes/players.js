import express from 'express';
import { loadSquad, saveSquad, loadSelection, saveSelection, newId } from '../data.js';
import { POSITION_TAGS } from '../../public/js/rugby.js';

const router = express.Router();

function cleanPositions(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(list.map(s => String(s).trim()).filter(s => POSITION_TAGS.includes(s)))];
}
function cleanTeams(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(list.map(Number).filter(n => [1, 2, 3].includes(n)))].sort();
}

router.get('/', async (req, res, next) => {
  try {
    const squad = await loadSquad();
    res.json({ players: squad.players });
  } catch (e) { next(e); }
});

// Add one player, or many at once with { names: "one per line" }.
router.post('/add', async (req, res, next) => {
  try {
    const b = req.body || {};
    const squad = await loadSquad();
    const existing = new Set(squad.players.map(p => p.name.trim().toLowerCase()));
    const names = (b.names != null ? String(b.names).split(/\r?\n/) : [b.name])
      .map(s => String(s || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (!names.length) return res.status(400).json({ error: 'Enter at least one name.' });
    let added = 0, skipped = 0;
    for (const name of names) {
      if (existing.has(name.toLowerCase())) { skipped++; continue; }
      existing.add(name.toLowerCase());
      squad.players.push({
        id: newId('p'),
        name: name.slice(0, 100),
        positions: cleanPositions(b.positions),
        teams: cleanTeams(b.teams),
        notes: '',
      });
      added++;
    }
    await saveSquad(squad);
    res.json({ ok: true, added, skipped, total: squad.players.length });
  } catch (e) { next(e); }
});

router.post('/save', async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = String(b.id || '');
    if (!id) return res.status(400).json({ error: 'id is required' });
    const squad = await loadSquad();
    const player = squad.players.find(p => p.id === id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (typeof b.name === 'string' && b.name.trim()) player.name = b.name.trim().slice(0, 100);
    if (b.positions !== undefined) player.positions = cleanPositions(b.positions);
    if (b.teams !== undefined) player.teams = cleanTeams(b.teams);
    if (typeof b.notes === 'string') player.notes = b.notes.slice(0, 500);
    await saveSquad(squad);
    res.json({ ok: true, player });
  } catch (e) { next(e); }
});

router.post('/delete', async (req, res, next) => {
  try {
    const id = String(req.body?.id || '');
    if (!id) return res.status(400).json({ error: 'id is required' });
    const squad = await loadSquad();
    const before = squad.players.length;
    squad.players = squad.players.filter(p => p.id !== id);
    if (squad.players.length === before) return res.status(404).json({ error: 'Player not found' });
    await saveSquad(squad);

    // Drop them from the working selection too (recorded matches keep their history).
    const sel = await loadSelection();
    sel.lineup = (sel.lineup || []).map(x => x === id ? null : x);
    sel.bench = (sel.bench || []).map(x => x === id ? null : x);
    for (const k of ['captainId', 'viceCaptainId', 'kickerId']) if (sel[k] === id) sel[k] = null;
    if (sel.availability) delete sel.availability[id];
    await saveSelection(sel);

    res.json({ ok: true, remaining: squad.players.length });
  } catch (e) { next(e); }
});

router.post('/delete-all', async (req, res, next) => {
  try {
    await saveSquad({ players: [] });
    const sel = await loadSelection();
    Object.assign(sel, { lineup: [], bench: [], captainId: null, viceCaptainId: null, kickerId: null, availability: {} });
    await saveSelection(sel);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
