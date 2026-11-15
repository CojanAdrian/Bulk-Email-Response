// The title bar shows how many inquiries are waiting, from BulkPosting's
// page title: "(16) BulkPosting" means 16 waiting.
const desktop = window.bulkpostingDesktop;
const waiting = document.getElementById('waiting');
const pageName = document.getElementById('page');

function show(title) {
  const text = String(title || '');
  const match = text.match(/^\((\d+)\)\s*/);
  const count = match ? Number(match[1]) : 0;
  waiting.textContent = count ? `${count} waiting` : '';
  waiting.classList.toggle('on', count > 0);
  // Anything after "BulkPosting" (e.g. "BulkPosting · Inquiries") is shown faintly.
  const rest = text.replace(/^\(\d+\)\s*/, '').replace(/^BulkPosting\s*[·|—-]?\s*/i, '');
  pageName.textContent = rest;
}

desktop.onTitle(show);
desktop.onFocus((focused) => document.body.classList.toggle('away', !focused));
