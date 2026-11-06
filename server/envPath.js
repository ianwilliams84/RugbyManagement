import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.join(__dirname, '..');

// Credentials live outside the repo, in the shared dev\secrets folder, so they
// can't be committed. IRONSIDES_ENV overrides the location if needed.
export const secretsEnvPath = process.env.IRONSIDES_ENV
  || path.join(projectRoot, '..', 'secrets', 'ironsides.env');

// Loaded here rather than in index.js because ES imports run before the
// importing module's body, so data.js would otherwise resolve its folders
// before the env file was read. The secrets file wins; a local pw.env / .env
// only fills in anything it lacks.
dotenv.config({ path: secretsEnvPath });
dotenv.config({ path: path.join(projectRoot, 'pw.env') });
dotenv.config({ path: path.join(projectRoot, '.env') });

// Squad, results, settings, photos and videos hold players' names and faces,
// so they never go in the repo. IRONSIDES_DATA_DIR points them at a shared
// folder (e.g. a NAS share, so several PCs see the same squad); unset, they
// stay in the project's own gitignored data/, photos/ and videos/.
const shared = (process.env.IRONSIDES_DATA_DIR || '').trim();
if (shared && !fs.existsSync(shared)) {
  // Refuse to start rather than quietly writing a fresh, empty squad locally
  // that then drifts from the shared one.
  console.error(`\nIRONSIDES_DATA_DIR is set to ${shared}, but that folder can't be reached.`);
  console.error('Check the NAS is on and the share is accessible, then start again.\n');
  process.exit(1);
}
export const dataRoot = shared || null;
export const dataDir = shared || path.join(projectRoot, 'data');
export const photosDir = path.join(shared || projectRoot, 'photos');
export const videosDir = path.join(shared || projectRoot, 'videos');
