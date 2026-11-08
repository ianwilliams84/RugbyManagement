const data = JSON.parse(document.getElementById('initial-data').textContent);
const featuredSelect = document.getElementById('featured-player');
const subtitleInput = document.getElementById('subtitle');
const subtitleEl = document.getElementById('lg-subtitle');
const featuredImgWrap = document.getElementById('lg-right');

const SUBTITLE_KEY = 'ironsides.lineup.subtitle';
const SUBTITLE_FOR_KEY = 'ironsides.lineup.subtitleFor';
// The server-built subtitle (team, opposition, date). A manual edit is only
// restored while this is unchanged, so a new match or team isn't hidden.
const defaultSubtitle = subtitleInput?.value || '';
const FEATURED_KEY = 'ironsides.lineup.featuredId';

// No photo for this player → fall back to the club shirt badge image.
function setFeatured(id) {
  const photo = data.photoMap[id];
  featuredImgWrap.innerHTML = photo
    ? `<img src="${photo}" alt="" id="lg-featured-img">`
    : `<img src="/brand/badge" alt="" id="lg-featured-img" class="lg-default">`;
}

function setSubtitle(text) {
  subtitleEl.textContent = text || '';
}

featuredSelect?.addEventListener('change', () => {
  setFeatured(featuredSelect.value);
  try { localStorage.setItem(FEATURED_KEY, featuredSelect.value); } catch {}
});
subtitleInput?.addEventListener('input', () => {
  setSubtitle(subtitleInput.value);
  // Persist so the user's manual edit survives navigating between tabs
  try {
    localStorage.setItem(SUBTITLE_KEY, subtitleInput.value);
    localStorage.setItem(SUBTITLE_FOR_KEY, defaultSubtitle);
  } catch {}
});

// Restore a manually-saved subtitle/featured player if present
try {
  const saved = localStorage.getItem(SUBTITLE_KEY);
  const savedFor = localStorage.getItem(SUBTITLE_FOR_KEY);
  if (saved !== null && saved !== '' && savedFor === defaultSubtitle) subtitleInput.value = saved;
  const savedFeatured = localStorage.getItem(FEATURED_KEY);
  if (savedFeatured && featuredSelect && [...featuredSelect.options].some(o => o.value === savedFeatured)) {
    featuredSelect.value = savedFeatured;
  }
} catch {}

setSubtitle(subtitleInput.value);
if (featuredSelect && featuredSelect.value) setFeatured(featuredSelect.value);

document.getElementById('download-btn').addEventListener('click', async () => {
  const btn = document.getElementById('download-btn');
  const target = document.getElementById('lineup-graphic');
  if (!target || !window.htmlToImage) return;
  const original = btn.textContent;
  btn.textContent = 'Rendering…';
  btn.disabled = true;
  try {
    // html-to-image draws through the browser's own layout, so mixed font
    // weights keep their baseline (html2canvas set bold surnames too high).
    const png = await htmlToImage.toPng(target, { pixelRatio: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `rugby-lineup-${stamp}.png`;
    link.href = png;
    link.click();
  } catch (err) {
    alert('PNG render failed: ' + err.message);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
});
