import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.join(__dirname, '..');

// Credentials can live outside the app folder, in a "secrets" folder next to
// it, so a developer's copy can't commit them. RUGBY_ENV names the file
// directly. Without either, which is the usual case for someone the app was
// shared with, first-run setup writes them to the gitignored pw.env in the
// app folder instead. IRONSIDES_ENV and secrets\ironsides.env are the names
// from before 1.0, still read so existing installs keep working.
const secretsDir = path.join(projectRoot, '..', 'secrets');
export const secretsEnvPath = process.env.RUGBY_ENV || process.env.IRONSIDES_ENV
  || [path.join(secretsDir, 'rugby-management.env'), path.join(secretsDir, 'ironsides.env')]
    .find(f => fs.existsSync(f))
  || path.join(secretsDir, 'rugby-management.env');
export const localEnvPath = path.join(projectRoot, 'pw.env');

// Loaded here rather than in index.js because ES imports run before the
// importing module's body, so data.js would otherwise resolve its folders
// before the env file was read. The secrets file wins; a local pw.env / .env
// only fills in anything it lacks.
dotenv.config({ path: secretsEnvPath });
dotenv.config({ path: localEnvPath });
dotenv.config({ path: path.join(projectRoot, '.env') });

// Before 1.0 the data folder was saved as IRONSIDES_DATA_DIR. Setup now saves
// RUGBY_DATA_DIR, which wins once it's there.
if (!process.env.RUGBY_DATA_DIR && process.env.IRONSIDES_DATA_DIR) {
  process.env.RUGBY_DATA_DIR = process.env.IRONSIDES_DATA_DIR;
}

// Squad, results, settings, photos and videos hold players' names and faces,
// so they never go in the repo. RUGBY_DATA_DIR points them at a folder
// chosen during setup (often a NAS share, so several PCs see the same squad).
//
// `paths` is one shared, mutable object: setup can point it at a new folder
// while the server is running, so always read `paths.dataDir` at the moment
// you need it, never copy it into a module-level constant.
export const paths = { projectRoot, dataDir: null, photosDir: null, videosDir: null, dataRoot: null };

export function setDataRoot(folder) {
  const shared = String(folder || '').trim();
  paths.dataRoot = shared || null;
  paths.dataDir = shared || path.join(projectRoot, 'data');
  paths.photosDir = path.join(shared || projectRoot, 'photos');
  paths.videosDir = path.join(shared || projectRoot, 'videos');
}

setDataRoot(process.env.RUGBY_DATA_DIR);
