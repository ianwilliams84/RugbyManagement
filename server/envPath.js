import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.join(__dirname, '..');

// Credentials live outside the repo, in the shared dev\secrets folder, so they
// can't be committed. IRONSIDES_ENV overrides the location if needed. On a PC
// without that folder (someone the app was shared with), first-run setup
// writes them to the gitignored pw.env in the project instead.
export const secretsEnvPath = process.env.IRONSIDES_ENV
  || path.join(projectRoot, '..', 'secrets', 'ironsides.env');
export const localEnvPath = path.join(projectRoot, 'pw.env');

// Loaded here rather than in index.js because ES imports run before the
// importing module's body, so data.js would otherwise resolve its folders
// before the env file was read. The secrets file wins; a local pw.env / .env
// only fills in anything it lacks.
dotenv.config({ path: secretsEnvPath });
dotenv.config({ path: localEnvPath });
dotenv.config({ path: path.join(projectRoot, '.env') });

// Squad, results, settings, photos and videos hold players' names and faces,
// so they never go in the repo. IRONSIDES_DATA_DIR points them at a folder
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

setDataRoot(process.env.IRONSIDES_DATA_DIR);
