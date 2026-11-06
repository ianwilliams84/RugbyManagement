import { projectRoot, dataRoot, dataDir, photosDir } from './envPath.js';   // first: loads the env file
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
import { loadSettings } from './data.js';

console.log(dataRoot ? `Data: shared folder ${dataRoot}` : `Data: local ${dataDir}`);

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(projectRoot, 'views'));
app.use(express.static(path.join(projectRoot, 'public')));
app.use('/photos', express.static(photosDir));
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
