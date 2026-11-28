import test from 'node:test';
import assert from 'node:assert/strict';
import { demoTasksModule } from '../tasks-demo.js';

const KEY = 'cf.preview.todos.v2';
const date = offset => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const task = (id, extras = {}) => ({ id, text: 'Task ' + id, area: 'famille', due: '', priority: 'normal', done: false, created: 1, ...extras });
const store = (family = [], Papa = [], Maman = []) => ({ version: 2, family, personal: { Papa, Maman } });
function setup(initial, initialProfile = 'Papa') {
  const data = new Map(initial === undefined ? [] : [[KEY, typeof initial === 'string' ? initial : JSON.stringify(initial)]]);
  const events = new Map(), messages = [], reads = [];
  let person = initialProfile, failWrites = false, confirm = false, confirmations = 0;
  const main = { innerHTML: '' };
  const form = { hidden: true, reset() { this.resetCalled = true }, querySelector() { return { focus() { form.focused = true } } } };
  const opener = { dataset: {}, attributes: {}, hasAttribute: key => key === 'data-todo-add', setAttribute(key, value) { this.attributes[key] = value }, focus() { this.focused = true } };
  globalThis.document = {
    addEventListener(name, handler) { events.set(name, handler) },
    querySelector(selector) { return selector === '#todoForm' ? form : selector === '[data-todo-add]' ? opener : null }
  };
  globalThis.localStorage = {
    getItem(key) { reads.push(key); return data.get(key) ?? null },
    setItem(key, value) { if (failWrites) throw new Error('quota'); data.set(key, value) }
  };
  globalThis.window = { confirm() { confirmations++; return confirm } };
  const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let module;
  const reload = () => {
    module = demoTasksModule({ preview: true, me: () => person, esc, toast: message => messages.push(message), rerender: () => module.render(main) });
    module.render(main);
  };
  reload();
  const button = dataset => ({ dataset, hasAttribute: () => false });
  return {
    data, main, form, opener, messages, reads,
    module: () => module, reload,
    profile(value) { person = value; module.render(main) },
    state: () => JSON.parse(data.get(KEY)),
    failWrites(value) { failWrites = value },
    filter(value) { module.click(button({ todoFilter: value })) },
    confirm(value) { confirm = value }, confirmations: () => confirmations,
    remove(id) { module.click(button({ todoDelete: id })) },
    toggle(id, checked) {
      const target = { checked, dataset: { todoCheck: id }, matches: () => true };
      events.get('change')({ target }); return target;
    },
    add(values = {}) {
      const fields = Object.fromEntries(Object.entries({ text: 'New task', area: 'famille', priority: 'normal', due: '', ...values }).map(([k, value]) => [k, { value, focus() {} }]));
      events.get('submit')({ target: { id: 'todoForm', elements: { namedItem: key => fields[key] } }, preventDefault() {} });
    }
  };
}

test('preview seeds fictitious examples once and reads no former prototype keys', () => {
  const app = setup();
  assert.equal(app.module().count(), 3);
  assert.ok(app.reads.every(key => key === KEY));
  app.confirm(true);
  app.state().family.forEach(t => app.remove(t.id));
  app.reload();
  assert.equal(app.state().family.length, 0, 'removed examples must not return after reload');
});

test('creates categorized dated priorities, persists reload and escapes user text', () => {
  const app = setup(store());
  app.add({ text: '<img src=x onerror=alert(1)>', area: 'pro', priority: 'high', due: date(0) });
  const item = app.state().personal.Papa[0];
  assert.equal(item.priority, 'high'); assert.equal(item.due, date(0));
  assert.match(app.main.innerHTML, /&lt;img/); assert.doesNotMatch(app.main.innerHTML, /<img src=x/);
  app.reload();
  assert.equal(app.module().count(), 1);
  assert.equal(app.state().personal.Papa[0].id, item.id);
});

test('local family priorities are shared between demo profiles, personal lists remain distinct', () => {
  const app = setup(store([], [task('p', { area: 'pro' })], [task('m', { area: 'general' })]));
  app.add({ text: 'Shared family task' });
  app.profile('Maman');
  assert.match(app.main.innerHTML, /Shared family task/);
  assert.match(app.main.innerHTML, /Task m/);
  assert.doesNotMatch(app.main.innerHTML, /Task p|value="pro"/);
  app.add({ area: 'general', text: 'Maman personal' });
  app.add({ area: 'pro', text: 'Not allowed by demo UI' });
  assert.equal(app.state().personal.Papa.length, 1);
  assert.equal(app.state().personal.Maman.length, 2);
  assert.ok(app.messages.includes('Catégorie indisponible.'));
  app.profile('Papa');
  assert.doesNotMatch(app.main.innerHTML, /Maman personal/);
});

test('filters all, urgent, today and completed use their advertised scope', () => {
  const app = setup(store([
    task('urgent', { priority: 'high', due: date(0) }),
    task('late', { due: date(-1) }), task('later', { due: date(1) }), task('done', { done: true })
  ]));
  assert.match(app.main.innerHTML, /Task done/);
  app.filter('urgent'); assert.match(app.main.innerHTML, /Task urgent/); assert.doesNotMatch(app.main.innerHTML, /Task late|Task done/);
  app.filter('today'); assert.match(app.main.innerHTML, /Task urgent/); assert.doesNotMatch(app.main.innerHTML, /Task late|Task done/);
  app.filter('done'); assert.match(app.main.innerHTML, /Task done/); assert.doesNotMatch(app.main.innerHTML, /Task urgent/);
  app.filter('all'); assert.match(app.main.innerHTML, /Task late/); assert.match(app.main.innerHTML, /En retard/);
});

test('checking and reopening update persisted counts and summary', () => {
  const app = setup(store([task('a', { priority: 'high' })]));
  assert.equal(app.module().count(), 1);
  app.toggle('a', true); assert.equal(app.module().count(), 0); assert.equal(app.state().family[0].done, true);
  assert.match(app.module().summary(), /0 en attente/);
  app.reload(); assert.equal(app.module().count(), 0);
  app.toggle('a', false); assert.equal(app.module().count(), 1); assert.equal(app.state().family[0].done, false);
});

test('deleting requires confirmation and cancellation preserves the task', () => {
  const app = setup(store([task('a')]));
  app.remove('a'); assert.equal(app.module().count(), 1); assert.equal(app.confirmations(), 1);
  app.confirm(true); app.remove('a'); assert.equal(app.module().count(), 0); assert.equal(app.confirmations(), 2);
});

test('invalid dates and whitespace titles are rejected; malformed stored dates do not crash', () => {
  const app = setup(store([task('bad-date', { due: '2026-99-99' })]));
  assert.match(app.main.innerHTML, /Sans échéance/);
  app.add({ text: '   ' }); app.add({ due: '2026-02-30' });
  assert.equal(app.module().count(), 1);
  assert.ok(app.messages.includes('Indique une date valide.'));
});

test('corrupt local storage is retained and cannot be overwritten by a new task', () => {
  const app = setup('{broken');
  assert.equal(app.module().count(), 0);
  app.add();
  assert.equal(app.data.get(KEY), '{broken');
  assert.ok(app.messages.some(message => message.includes('illisibles')));
});

test('storage quota failure rolls the checkbox back and reports unsaved change', () => {
  const app = setup(store([task('a')]));
  app.failWrites(true);
  const checkbox = app.toggle('a', true);
  assert.equal(checkbox.checked, false); assert.equal(app.state().family[0].done, false);
  assert.ok(app.messages.some(message => message.includes('non enregistrée')));
});

test('form only opens on request; cancelling restores focus to its opener', () => {
  const app = setup(store());
  assert.match(app.main.innerHTML, /id="todoForm" class="sk-task-form" hidden/);
  app.module().click(app.opener); assert.equal(app.form.hidden, false); assert.equal(app.form.focused, true);
  app.module().click({ dataset: {}, hasAttribute: key => key === 'data-todo-cancel' });
  assert.equal(app.form.hidden, true); assert.equal(app.opener.focused, true); assert.equal(app.opener.attributes['aria-expanded'], 'false');
});
