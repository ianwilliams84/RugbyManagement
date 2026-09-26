import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, '..', '..', 'data', 'cache');

async function ensureDir() {
  await fs.mkdir(cacheDir, { recursive: true });
}

export async function readCache(key) {
  try {
    return await fs.readFile(path.join(cacheDir, key), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function writeCache(key, value) {
  await ensureDir();
  await fs.writeFile(path.join(cacheDir, key), value);
}

export async function findCacheMatching(prefix) {
  try {
    const files = await fs.readdir(cacheDir);
    return files.filter(f => f.startsWith(prefix));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}
