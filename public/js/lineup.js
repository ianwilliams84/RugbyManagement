const data = JSON.parse(document.getElementById('initial-data').textContent);
const featuredSelect = document.getElementById('featured-player');
const subtitleInput = document.getElementById('subtitle');
const subtitleEl = document.getElementById('lg-subtitle');
const featuredImgWrap = document.getElementById('lg-right');

const SUBTITLE_KEY = 'ironsides.lineup.subtitle';
const FEATURED_KEY = 'ironsides.lineup.featuredId';

// No photo for this player → fall back to the club shirt badge image.
function setFeatured(id) {
  const photo = data.photoMap[id];
  featuredImgWrap.innerHTML = photo
    ? `<img src="${photo}" alt="" id="lg-featured-img">`
    : `<img src="/img/ironsides-shirt-badge.png" alt="" id="lg-featured-img" class="lg-default">`;
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
  try { localStorage.setItem(SUBTITLE_KEY, subtitleInput.value); } catch {}
});

// Restore a manually-saved subtitle/featured player if present
try {
  const saved = localStorage.getItem(SUBTITLE_KEY);
  if (saved !== null && saved !== '') subtitleInput.value = saved;
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
  if (!target || !window.html2canvas) return;
  const original = btn.textContent;
  btn.textContent = 'Rendering…';
  btn.disabled = true;
  try {
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `ironsides-lineup-${stamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('PNG render failed: ' + err.message);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
});
