import express from 'express';
import { loadSettings, saveSettings } from '../data.js';
import { detectClaudeCli } from '../claude/reportGenerator.js';
import { configuredEmail } from '../spond/auth.js';
import { POSITION_TAGS } from '../../public/js/rugby.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [settings, claudeCli] = await Promise.all([loadSettings(), detectClaudeCli()]);
    const env = {
      claudeCli,
      spond: !!(process.env.SPOND_EMAIL && process.env.SPOND_PASSWORD),
      spondEmail: configuredEmail(),
    };
    res.render('settings', { settings, env, positionTags: POSITION_TAGS });
  } catch (e) { next(e); }
});

const HEX = /^#[0-9a-f]{6}$/i;
const SEASON = /^\d{4}\/\d{2}$/;

router.post('/save', async (req, res, next) => {
  try {
    const cur = await loadSettings();
    const b = req.body || {};
    const s = (v, fallback, n) => String(v ?? fallback ?? '').trim().slice(0, n);
    const next = {
      ...cur,
      club: {
        ...cur.club,
        name: s(b.clubName, cur.club.name, 100),
        shortName: s(b.clubShortName, cur.club.shortName, 40),
        founded: s(b.clubFounded, cur.club.founded, 10),
        primaryColor: HEX.test(b.primaryColor) ? b.primaryColor : cur.club.primaryColor,
        primaryDark: HEX.test(b.primaryDark) ? b.primaryDark : cur.club.primaryDark,
      },
      teams: {
        ...cur.teams,
        names: [1, 2, 3].map(n => s(b[`team${n}Name`], cur.teams.names[n - 1], 60)),
      },
      season: {
        ...cur.season,
        current: SEASON.test(String(b.currentSeason || '').trim()) ? String(b.currentSeason).trim() : cur.season.current,
      },
      homePostcode: s(b.homePostcode, cur.homePostcode, 12).toUpperCase(),
      spond: {
        ...cur.spond,
        currentEventId: s(b.spondEventId, cur.spond.currentEventId, 100),
      },
      matchReport: {
        ...cur.matchReport,
        tone: s(b.matchReportTone, cur.matchReport.tone, 1000),
        lengthWords: Number(b.matchReportLength) || cur.matchReport.lengthWords,
      },
    };
    await saveSettings(next);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
