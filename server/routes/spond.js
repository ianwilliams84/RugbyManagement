import express from 'express';
import { loadSquad, loadSelection, saveSelection, loadSettings, loadMatches, teamName } from '../data.js';
import { computeStats } from '../stats.js';
import { getFormat } from '../../public/js/rugby.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [squad, selection, settings, { matches }] = await Promise.all([loadSquad(), loadSelection(), loadSettings(), loadMatches()]);
    const stats = computeStats(matches, { season: settings.season.current });
    res.render('spond', {
      squad, selection, settings, stats,
      format: getFormat(selection.format),
      teamLabel: teamName(settings, selection.team),
    });
  } catch (e) { next(e); }
});

// Persist the formation layout from the Spond export page.
// Body: { formationPositions: { [shirtNumber]: { x, y } } } with x/y as 0–100 %.
// Keyed by shirt number (not player) so the shape survives a change of personnel.
router.post('/formation-save', async (req, res, next) => {
  try {
    const incoming = req.body?.formationPositions;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ ok: false, error: 'formationPositions object required' });
    }
    const clean = {};
    for (const [num, pos] of Object.entries(incoming)) {
      if (!/^\d{1,2}$/.test(num) || !pos || typeof pos !== 'object') continue;
      const x = Number(pos.x), y = Number(pos.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      clean[num] = { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
    }
    const sel = await loadSelection();
    sel.formationPositions = sel.formationPositions || {};
    sel.formationPositions[sel.format] = clean;
    await saveSelection(sel);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
