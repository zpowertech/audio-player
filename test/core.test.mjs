import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { PacketFramer, PacketCache } from '../dist/silk/packets.js';
import { loadSilk } from '../dist/silk/loader.js';
import { createAudioPlayer } from '../dist/index.js';
const fixture = new Uint8Array(await readFile(new URL('./fixtures/test.slk', import.meta.url)));
// Buffer's backing store need not start at zero.
const referenceBytes = await readFile(new URL('./fixtures/test_16000.pcm', import.meta.url));
const expected = Array.from({ length: referenceBytes.length / 2 }, (_, i) => referenceBytes.readInt16LE(i * 2));
function parse(bytes, size = 1) {
  const framer = new PacketFramer(); const packets = [];
  for (let i = 0; i < bytes.length; i += size) packets.push(...framer.push(bytes.subarray(i, i + size)));
  framer.finish(); return packets;
}
for (const skip of [0, 1, 2]) for (const size of [1, 2, 7, 1024, 65536]) {
  test(`incremental header ${skip}, chunk size ${size}, exact reference PCM`, async () => {
    const silk = await loadSilk(); const stream = silk.stream();
    try {
      const packets = parse(fixture.subarray(skip), size);
      assert.equal(packets.length, 250);
      const actual = packets.flatMap(packet => Array.from(stream.decode(packet)));
      assert.equal(stream.sampleRate, 16000); assert.equal(actual.length, 80000);
      assert.deepEqual(actual, expected);
    } finally { stream.dispose(); silk.dispose(); }
  });
}
test('end marker may cross chunks, and trailing bytes are rejected', () => {
  assert.equal(parse(new Uint8Array([...fixture, 255, 255])).length, 250);
  assert.throws(() => parse(new Uint8Array([...fixture, 255, 255, 0])), /after SILK end marker/);
});
for (const [name, bytes] of [
  ['partial header', fixture.slice(0, 4)], ['empty', fixture.slice(0, 10)],
  ['partial length', fixture.slice(0, 11)], ['partial body', fixture.slice(0, 14)],
  ['zero length', new Uint8Array([...fixture.slice(0, 10), 0, 0])],
  ['oversized packet', new Uint8Array([...fixture.slice(0, 10), 1, 4])],
]) test(name, () => assert.throws(() => parse(bytes), error => ['DECODE', 'NOT_SUPPORTED'].includes(error.code)));
test('invalid header is unsupported', () => assert.throws(() => parse(new Uint8Array([10])), { code: 'NOT_SUPPORTED' }));
test('decoder failure, independent state, repeated disposal', async () => {
  const a = await loadSilk(); const b = await loadSilk(); const s = a.stream();
  assert.throws(() => s.decode(new Uint8Array([255, 255, 255, 255])));
  s.dispose(); s.dispose(); assert.throws(() => s.sampleRate, /disposed/);
  assert.deepEqual(Array.from(b.decode(fixture).samples), expected);
  a.dispose(); b.dispose();
});
test('compiled-module failure is retryable', async () => {
  const { loadSilk: retry } = await import('../dist/silk/loader.js?retry');
  const original = WebAssembly.compile;
  WebAssembly.compile = async () => { throw new Error('temporary compile failure'); };
  try { await assert.rejects(retry(), /temporary compile failure/); }
  finally { WebAssembly.compile = original; }
  const silk = await retry(); assert.equal(silk.decode(fixture).duration, 5); silk.dispose();
});
test('cache is bounded and reusable only after a validated EOF', () => {
  const cache = new PacketCache(4); cache.add(new Uint8Array(3)); assert.equal(cache.complete, false);
  cache.add(new Uint8Array(2)); cache.finish(); assert.equal(cache.complete, false); assert.equal(cache.values().length, 0);
  const full = new PacketCache(4); full.add(new Uint8Array(3)); full.finish(); assert.equal(full.complete, true);
});
test('main export, SSR-safe construction, stable snapshots, terminal disposal', async () => {
  const process = spawnSync(globalThis.process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    globalThis.fetch = () => { throw Error('unexpected network'); };
    globalThis.Audio = class { constructor() { throw Error('unexpected audio'); } };
    globalThis.AudioContext = class { constructor() { throw Error('unexpected context'); } };
    WebAssembly.compile = () => { throw Error('unexpected WASM'); };
    const sdk = await import('./dist/index.js');
    assert.deepEqual(Object.keys(sdk), ['createAudioPlayer']);
    const player = sdk.createAudioPlayer();
    assert.equal(player.getSnapshot(), player.getSnapshot());
    assert(Object.isFrozen(player.getSnapshot()));
    await assert.rejects(player.play('https://example.invalid/a.mp3'), {code:'NOT_SUPPORTED'});
    await player.dispose(); await player.dispose();
    await assert.rejects(player.play(), {code:'DISPOSED'});
  `], { encoding: 'utf8' });
  assert.equal(process.status, 0, process.stderr);
});
test('unsubscribe and dispose notify exactly once', async () => {
  const player = createAudioPlayer(); let count = 0; const remove = player.subscribe(() => count++);
  remove(); await player.dispose(); assert.equal(count, 0);
  const other = createAudioPlayer(); other.subscribe(() => count++); await other.dispose(); await other.dispose();
  assert.equal(count, 1); assert.equal(other.getSnapshot().status, 'disposed');
});
