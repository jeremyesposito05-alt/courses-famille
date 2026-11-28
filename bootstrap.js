// Surface startup failures instead of leaving an empty screen on mobile Safari.
import('./app.js').catch(error => {
  console.error('Preview startup failed', error);
  const main = document.querySelector('#app');
  main.textContent = '';
  const panel = document.createElement('main');
  const title = document.createElement('h1');
  title.textContent = 'La prévisualisation ne peut pas démarrer';
  const text = document.createElement('p');
  text.textContent = error.message;
  panel.append(title, text);
  main.append(panel);
});
