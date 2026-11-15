const desktop = window.bulkpostingDesktop;
desktop.address().then((current) => {
  document.getElementById('where').textContent = current || 'none set';
});
document.getElementById('retry').addEventListener('click', () => desktop.retry());
document.getElementById('change').addEventListener('click', () => desktop.changeAddress());
// Back online: try again by itself.
window.addEventListener('online', () => desktop.retry());
