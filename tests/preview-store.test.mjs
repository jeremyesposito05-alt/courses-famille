import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../preview-store.js', import.meta.url), 'utf8');
const KEY = 'cf.preview.database.v1';
let storage, api, sequence = 0;
async function fresh() { return import('data:text/javascript;base64,' + Buffer.from(source + '\n// instance ' + sequence++).toString('base64')); }
beforeEach(async () => {
  storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  api = await fresh();
});
const ref = id => api.doc(api.fs, 'familles', 'preview-demo', 'tests', id);
const data = async id => (await api.getDocFromServer(ref(id))).data();
const tick = () => new Promise(resolve => queueMicrotask(resolve));

test('Only the fictitious household is accepted and example data persists', async () => {
  assert.throws(() => api.doc(api.fs, 'familles', 'real-family', 'config', 'app'));
  const config = await api.getDocFromServer(api.doc(api.fs, 'familles', 'preview-demo', 'config', 'app'));
  assert.match(config.data().periode, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(storage.has(KEY));
  assert.doesNotMatch(source, /https?:\/\/|fetch\s*\(|XMLHttpRequest/);
});
test('Merge preserves nested siblings; update replaces maps and dotted paths change only their target', async () => {
  await api.setDoc(ref('a'), { trips: { one: { name: 'One', closed: false }, two: { name: 'Two' } } });
  await api.setDoc(ref('a'), { trips: { one: { closed: true } } }, { merge: true });
  assert.deepEqual((await data('a')).trips, { one: { name: 'One', closed: true }, two: { name: 'Two' } });
  await api.updateDoc(ref('a'), { 'trips.one.name': 'Changed', 'trips.two': api.deleteField() });
  assert.deepEqual((await data('a')).trips, { one: { name: 'Changed', closed: true } });
  await api.updateDoc(ref('a'), { trips: { last: {} } });
  assert.deepEqual((await data('a')).trips, { last: {} });
});
test('arrayUnion deduplicates exclusions and setDoc snapshots cannot mutate stored data', async () => {
  await api.setDoc(ref('a'), { sauf: ['2026-11-27'] });
  await api.updateDoc(ref('a'), { sauf: api.arrayUnion('2026-11-27', '2026-11-28') });
  const read = await data('a'); read.sauf.push('unwanted');
  assert.deepEqual((await data('a')).sauf, ['2026-11-27', '2026-11-28']);
});
test('Writes survive reloading the adapter and deletion persists', async () => {
  await api.setDoc(ref('a'), { title: 'Saved' });
  api = await fresh();
  assert.equal((await data('a')).title, 'Saved');
  await api.deleteDoc(ref('a'));
  api = await fresh();
  assert.equal((await api.getDocFromServer(ref('a'))).exists(), false);
});
test('Filtered subscriptions run asynchronously, refresh after writes, and unsubscribe', async () => {
  const collection = api.collection(api.fs, 'familles', 'preview-demo', 'tests');
  const seen = [];
  const stop = api.onSnapshot(api.query(collection, api.where('list', '==', 'one')), { includeMetadataChanges: true }, snapshot => seen.push(snapshot.docs.map(document => document.id)));
  assert.equal(seen.length, 0);
  await tick(); assert.deepEqual(seen, [[]]);
  const batch = api.writeBatch(api.fs);
  batch.set(ref('a'), { list: 'one' }).set(ref('b'), { list: 'two' });
  await batch.commit(); await tick();
  assert.deepEqual(seen.at(-1), ['a']);
  stop(); const count = seen.length;
  await api.updateDoc(ref('b'), { list: 'one' }); await tick();
  assert.equal(seen.length, count);
  assert.notEqual(api.doc(collection).id, api.doc(collection).id);
});
test('Failed batch validation and quota errors commit nothing', async () => {
  await api.setDoc(ref('a'), { value: 1 });
  const before = storage.get(KEY);
  const batch = api.writeBatch(api.fs);
  batch.update(ref('a'), { value: 2 }).update(ref('missing'), { value: 2 });
  await assert.rejects(batch.commit());
  assert.equal((await data('a')).value, 1);
  assert.equal(storage.get(KEY), before);
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(api.updateDoc(ref('a'), { value: 3 }));
  assert.equal((await data('a')).value, 1);
  assert.equal(storage.get(KEY), before);
});
test('Dangerous dotted keys cannot change object prototypes', async () => {
  await api.setDoc(ref('a'), {});
  await assert.rejects(api.updateDoc(ref('a'), { '__proto__.polluted': true }));
  assert.equal({}.polluted, undefined);
});
