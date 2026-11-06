const BASE = 'https://api.spond.com/core/v1';
const STALE_MS = 12 * 60 * 60 * 1000;
const UA = 'Ironsides-TeamManager/0.1 (+personal-club-tool)';

let cache = { token: null, userId: null, fetchedAt: 0 };

async function login() {
  const email = process.env.SPOND_EMAIL;
  const password = process.env.SPOND_PASSWORD;
  if (!email || !password) {
    throw new Error('SPOND_EMAIL / SPOND_PASSWORD not set in dev\\secrets\\ironsides.env.');
  }
  // Spond moved /core/v1/login → /core/v1/auth2/login (the old path now
   //  returns 404). Matches the upstream `Olen/Spond` python lib.
  const res = await fetch(`${BASE}/auth2/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spond login failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  // Spond switched the login response shape: legacy `loginToken` is gone; the
  // new shape returns `{ accessToken: { token: <JWT>, expiration: ... }, ... }`.
  // Accept either so a future revert won't break us.
  const token = (json && json.accessToken && json.accessToken.token) || json.loginToken;
  if (!token) {
    throw new Error('Spond login response missing accessToken.token — the unofficial API may have changed.');
  }
  const userId = json.userId || (json.profile && json.profile.id) || null;
  cache = { token, userId, fetchedAt: Date.now() };
  return cache.token;
}

async function getToken({ force = false } = {}) {
  if (!force && cache.token && (Date.now() - cache.fetchedAt) < STALE_MS) return cache.token;
  return login();
}

export async function spondFetch(pathOrUrl, options = {}) {
  let token = await getToken();
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const doFetch = (t) => fetch(url, {
    ...options,
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json',
      ...(options.headers || {}),
      'Authorization': `Bearer ${t}`,
    },
  });
  let res = await doFetch(token);
  if (res.status === 401) {
    token = await getToken({ force: true });
    res = await doFetch(token);
  }
  return res;
}

export async function spondJson(pathOrUrl, options) {
  const res = await spondFetch(pathOrUrl, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Spond ${pathOrUrl} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function loginInfo() {
  const token = await getToken();
  return {
    ok: true,
    userId: cache.userId,
    tokenAcquiredAt: new Date(cache.fetchedAt).toISOString(),
    tokenLength: token.length,
  };
}

// Force the cached token to be discarded so the next request triggers a fresh
// login. Useful after rotating the password.
export function clearToken() {
  cache = { token: null, userId: null, fetchedAt: 0 };
}

// Update the in-process Spond credentials and immediately re-login with them
// (clearing any cached token first). Throws on auth failure.
//   email / password : new credentials. Either may be omitted to keep the
//                      existing process.env value.
export async function reloginWith({ email, password } = {}) {
  if (email != null && email !== '') process.env.SPOND_EMAIL = String(email).trim();
  if (password != null && password !== '') process.env.SPOND_PASSWORD = String(password);
  clearToken();
  return login();
}

// Best-effort: what email is currently configured (for the Settings UI to
// display so the user knows which account is being used). Never returns the
// password.
export function configuredEmail() {
  return process.env.SPOND_EMAIL || '';
}
