import express from 'express';
import fs from 'fs/promises';
import { loadSquad, loadSelection, loadSettings, paths, selectionTeamName } from '../data.js';
import { getFormat } from '../../public/js/rugby.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const [squad, selection, settings] = await Promise.all([loadSquad(), loadSelection(), loadSettings()]);
    const photoMap = await buildPhotoMap();
    res.render('lineup', {
      squad, selection, settings, photoMap, format: getFormat(selection.format),
      teamName: selectionTeamName(settings, selection),
    });
  } catch (e) { next(e); }
});

async function buildPhotoMap() {
  try {
    const files = await fs.readdir(paths.photosDir);
    const map = {};
    for (const f of files) {
      const m = f.match(/^([^.]+)\.(jpg|jpeg|png|webp)$/i);
      if (m) map[m[1]] = `/photos/${f}`;
    }
    return map;
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}

export default router;
