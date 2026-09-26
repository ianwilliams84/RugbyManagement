import express from 'express';
import { loadSquad, loadSettings, loadMatches } from '../data.js';
import { computeStats, teamRecord, availableSeasons } from '../stats.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [squad, settings, { matches }] = await Promise.all([loadSquad(), loadSettings(), loadMatches()]);
    const seasons = availableSeasons(matches, settings.season.current);
    const season = seasons.includes(req.query.season) ? req.query.season : settings.season.current;
    const team = [1, 2, 3].includes(Number(req.query.team)) ? Number(req.query.team) : 0;
    const stats = computeStats(matches, { season, team });
    const scoped = matches.filter(m => m.season === season && (!team || Number(m.team) === team));
    res.render('squad', { squad, settings, stats, seasons, season, team, record: teamRecord(scoped), matchCount: scoped.length });
  } catch (e) { next(e); }
});

export default router;
