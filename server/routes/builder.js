import express from 'express';
import { loadSquad, loadSelection, saveSelection, loadSettings, loadMatches } from '../data.js';
import { computeStats } from '../stats.js';
import { FORMATS, getFormat, normaliseFormat } from '../../public/js/rugby.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [squad, selection, settings, { matches }] = await Promise.all([loadSquad(), loadSelection(), loadSettings(), loadMatches()]);
    const stats = computeStats(matches, { season: settings.season.current });
    res.render('builder', { squad, selection, settings, stats, formats: FORMATS });
  } catch (e) { next(e); }
});

const cleanId = (x) => (typeof x === 'string' && x) ? x.slice(0, 64) : null;
const str = (v, n) => String(v ?? '').slice(0, n);

router.post('/save', async (req, res, next) => {
  try {
    const b = req.body || {};
    const format = normaliseFormat(b.format);
    const fmt = getFormat(format);
    const benchSize = Math.max(0, Math.min(fmt.maxBench, Number.isFinite(Number(b.benchSize)) ? Number(b.benchSize) : fmt.defaultBench));
    // Null entries are allowed so positional drops can leave gaps (e.g. only the #9 picked so far)
    const lineup = (Array.isArray(b.lineup) ? b.lineup : []).slice(0, fmt.slots.length).map(cleanId);
    const bench = (Array.isArray(b.bench) ? b.bench : []).slice(0, benchSize).map(cleanId);
    const existing = await loadSelection();
    await saveSelection({
      ...existing,
      matchTitle: str(b.matchTitle, 200),
      matchDate: str(b.matchDate, 32),
      kickoff: str(b.kickoff, 10),
      opposition: str(b.opposition, 100),
      venue: str(b.venue, 100),
      homeAway: b.homeAway === 'away' ? 'away' : 'home',
      team: [1, 2, 3].includes(Number(b.team)) ? Number(b.team) : 1,
      teamName: str(b.teamName, 60),
      fixtureId: cleanId(b.fixtureId),
      format,
      benchSize,
      lineup,
      bench,
      captainId: cleanId(b.captainId),
      viceCaptainId: cleanId(b.viceCaptainId),
      kickerId: cleanId(b.kickerId),
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
