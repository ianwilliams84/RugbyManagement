import { readCache, writeCache } from './cache.js';

// In-process memo for hot lookups; on-disk JSON cache for persistence across restarts.
const geoMemo = new Map();
const routeMemo = new Map();

const GEO_CACHE_FILE = 'geocode-postcodes.json';
const ROUTE_CACHE_FILE = 'routes-osrm.json';

async function readJsonCache(file) {
  const raw = await readCache(file);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function writeJsonCache(file, obj) {
  await writeCache(file, JSON.stringify(obj, null, 2));
}

function normPostcode(pc) {
  return String(pc || '').toUpperCase().replace(/\s+/g, '').trim();
}

// Geocode a UK postcode via postcodes.io (free, no key).
// Returns { lat, lon } or null on failure.
export async function geocodePostcode(postcode) {
  const key = normPostcode(postcode);
  if (!key) return null;
  if (geoMemo.has(key)) return geoMemo.get(key);

  const disk = await readJsonCache(GEO_CACHE_FILE);
  if (disk[key]) {
    geoMemo.set(key, disk[key]);
    return disk[key];
  }

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(key)}`);
    if (!res.ok) {
      // Try outward-code fallback (e.g. "SW11") for partial postcodes.
      geoMemo.set(key, null);
      return null;
    }
    const json = await res.json();
    const r = json?.result;
    if (!r || typeof r.latitude !== 'number') {
      geoMemo.set(key, null);
      return null;
    }
    const point = { lat: r.latitude, lon: r.longitude };
    disk[key] = point;
    await writeJsonCache(GEO_CACHE_FILE, disk);
    geoMemo.set(key, point);
    return point;
  } catch (e) {
    geoMemo.set(key, null);
    return null;
  }
}

// Driving distance/time via OSRM public demo server.
// Destination may be a postcode string OR { lat, lon } from a ground page's
// embedded map — coordinates skip the postcode geocoding round-trip entirely.
// Returns { km, minutes } or null on failure.
export async function drivingRoute(fromPc, to) {
  const fKey = normPostcode(fromPc);
  if (!fKey) return null;

  let destPoint = null;
  let destKey = '';
  if (to && typeof to === 'object' && Number.isFinite(to.lat) && Number.isFinite(to.lon)) {
    destPoint = { lat: to.lat, lon: to.lon };
    destKey = `${to.lat.toFixed(5)},${to.lon.toFixed(5)}`;
  } else {
    destKey = normPostcode(to);
    if (!destKey) return null;
  }

  const cacheKey = `${fKey}|${destKey}`;
  if (routeMemo.has(cacheKey)) return routeMemo.get(cacheKey);

  const disk = await readJsonCache(ROUTE_CACHE_FILE);
  if (disk[cacheKey]) {
    routeMemo.set(cacheKey, disk[cacheKey]);
    return disk[cacheKey];
  }

  const from = await geocodePostcode(fKey);
  if (!destPoint) destPoint = await geocodePostcode(destKey);
  if (!from || !destPoint) {
    routeMemo.set(cacheKey, null);
    return null;
  }
  const toResolved = destPoint;

  // OSRM expects lon,lat (not lat,lon)
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${toResolved.lon},${toResolved.lat}?overview=false`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Ironsides-Rugby-Management/1.0' } });
    if (!res.ok) {
      routeMemo.set(cacheKey, null);
      return null;
    }
    const json = await res.json();
    const route = json?.routes?.[0];
    if (!route) {
      routeMemo.set(cacheKey, null);
      return null;
    }
    const out = {
      km: route.distance / 1000,
      minutes: route.duration / 60,
    };
    disk[cacheKey] = out;
    await writeJsonCache(ROUTE_CACHE_FILE, disk);
    routeMemo.set(cacheKey, out);
    return out;
  } catch (e) {
    routeMemo.set(cacheKey, null);
    return null;
  }
}
