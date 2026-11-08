// Print just the team sheet, A4 portrait. Toggle a body class so the
// @media print rules can hide everything except the sheet; clear it again
// after the dialog closes (afterprint covers cancel + complete uniformly).
document.getElementById('print-sheet-btn')?.addEventListener('click', () => {
  document.body.classList.add('print-sheet-only');
  const cleanup = () => {
    document.body.classList.remove('print-sheet-only');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
});

// Render an element to PNG with html2canvas and trigger a download.
async function downloadPng(btn, target, name) {
  if (!target || !window.html2canvas) return;
  const original = btn.textContent;
  btn.textContent = 'Rendering…';
  btn.disabled = true;
  // Buttons inside the sheet shouldn't appear in the image
  document.body.classList.add('rendering-png');
  try {
    const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `rugby-${name}-${stamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    alert('PNG render failed: ' + err.message);
  } finally {
    document.body.classList.remove('rendering-png');
    btn.textContent = original;
    btn.disabled = false;
  }
}

document.getElementById('download-btn')?.addEventListener('click', (e) => {
  downloadPng(e.currentTarget, document.getElementById('team-sheet'), 'team-sheet');
});
document.getElementById('download-formation-btn')?.addEventListener('click', (e) => {
  downloadPng(e.currentTarget, document.getElementById('formation-graphic'), 'formation');
});
