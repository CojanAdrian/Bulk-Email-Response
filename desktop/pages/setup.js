const desktop = window.bulkpostingDesktop;
const input = document.getElementById('address');
const error = document.getElementById('error');

desktop.address().then((current) => {
  if (current) input.value = current;
});

document.getElementById('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  const result = await desktop.setAddress(input.value);
  if (result && result.error) error.textContent = result.error;
});
