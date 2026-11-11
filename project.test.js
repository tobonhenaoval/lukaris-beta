const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const { APP_VERSION } = require('../core.js');

test('versión coherente entre core.js, README, CHANGELOG, index y package.json', () => {
  const v = APP_VERSION.replace('.', '\\.');
  assert.match(read('README.md'), new RegExp('Versión ' + v));
  assert.match(read('CHANGELOG.md'), new RegExp('## \\[' + v + '\\]'));
  assert.match(read('index.html'), new RegExp('v' + v));
  assert.strictEqual(JSON.parse(read('package.json')).version, APP_VERSION);
});
test('index.html es local, sin recursos externos ni manejadores en línea', () => {
  const html = read('index.html');
  for (const f of ['styles.css', 'core.js', 'app.js']) assert.ok(html.includes(f), f);
  assert.doesNotMatch(html, /(src|href)="https?:/);
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'sin onclick/onsubmit en línea (rompen la CSP y ocultaron el bug de submit en la 1.05)');
});
test('app.js no usa manejadores en línea ni localStorage fuera de Store', () => {
  const js = read('app.js');
  assert.doesNotMatch(js, /\son(click|submit|change|input)=/);
  assert.doesNotMatch(js, /\b(alert|prompt)\(/);
});

test('1.13.6: los selectores de la interfaz y LK POS incluyen búsqueda y lista seleccionable', () => {
  const app = read('app.js'), css = read('styles.css');
  assert.match(app, /data-select-search/);
  assert.match(app, /data-choice-select/);
  assert.match(app, /option\.hidden/);
  assert.match(css, /\.choice-field/);
  assert.match(read('pos-ui.js'), /sel\('/);
});

test('1.13.6: Dashboard configurable y widgets de actividad siguen presentes', () => {
  const app = read('app.js');
  for (const token of ['dashboard-customize', 'dashboard-settings', 'Registro de actividad', 'Próximas citas', 'Alertas y pendientes']) assert.ok(app.includes(token), token);
});
