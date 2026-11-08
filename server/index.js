import { projectRoot, paths } from './envPath.js';   // first: loads the env file
import express from 'express';
import path from 'path';

import squadRouter from './routes/squad.js';
import builderRouter from './routes/builder.js';
import spondRouter from './routes/spond.js';
import lineupRouter from './routes/lineup.js';
import resultsRouter from './routes/results.js';
import reportRouter from './routes/report.js';
import settingsRouter from './routes/settings.js';
import spondAvailabilityRouter from './routes/spondAvailability.js';
import playersRouter from './routes/players.js';
import fixturesRouter from './routes/fixtures.js';
import setupRouter from './routes/setup.js';
import { loadSettings } from './data.js';
import { setupStatus } from './config.js';

const startup = await setupStatus({ fresh: true });
if (!startup.dataFolder.folder) console.log('Data: no folder chosen yet. Finish setup in the browser.');
else if (!startup.dataFolder.reachable) console.log(`Data: CAN'T REACH ${startup.dataFolder.folder}. The app will show the setup screen until it's back.`);
else console.log(`Data: ${paths.dataRoot}`);
if (!startup.complete) console.log('Setup isn\'t finished: every page will open the setup screen.');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(projectRoot, 'views'));
app.use(express.static(path.join(projectRoot, 'public')));

// Photos live in the data folder, which setup can change while the server is
// running, so pick the static handler for the current folder on each request.
const photoServers = new Map();
app.use('/photos', (req, res, next) => {
  if (!photoServers.has(paths.photosDir)) photoServers.set(paths.photosDir, express.static(paths.photosDir));
  photoServers.get(paths.photosDir)(req, res, next);
});

app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: true }));

// Club name + colours are needed by every page's head/nav partials.
app.use(async (req, res, next) => {
  try {
    const settings = await loadSettings();
    res.locals.club = settings.club;
  } catch { res.locals.club = null; }
  next();
});

// Until setup is finished, every page opens the setup screen. That includes
// a data folder that's set but unreachable (NAS off): rather than quietly
// starting a fresh, empty squad somewhere else, nothing runs until it's back.
app.use('/setup', setupRouter);
app.use(async (req, res, next) => {
  try {
    if ((await setupStatus()).complete) return next();
  } catch (e) { return next(e); }
  if (req.method === 'GET' && req.accepts('html')) return res.redirect('/setup');
  res.status(503).json({ ok: false, setup: true, error: 'Finish setup first: open /setup in the browser.' });
});

app.get('/', (req, res) => res.redirect('/squad'));
app.use('/squad', squadRouter);
app.use('/builder', builderRouter);
app.use('/spond', spondRouter);
app.use('/lineup-photo', lineupRouter);
app.use('/results', resultsRouter);
app.use('/report', reportRouter);
app.use('/settings', settingsRouter);
app.use('/spond-availability', spondAvailabilityRouter);
app.use('/players', playersRouter);
app.use('/fixtures', fixturesRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Ironsides Rugby Management — http://localhost:${port}`);
});
