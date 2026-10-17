import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.outputChunks = [];
    window.contexts = [];
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(options) {
        // Exercise an environment whose default differs from the playback rate.
        super({ sampleRate: 44100, ...options });
        window.contexts.push(this);
      }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start;
        source.start = function (when, ...rest) {
          window.outputChunks.push({ when, rate: this.buffer.sampleRate, samples: Array.from(this.buffer.getChannelData(0)) });
          return start.call(this, when, ...rest);
        };
        return source;
      }
    };
  });
  await page.goto('/');
  await expect(page.locator('#ready')).toHaveText('ready');
});

test.afterEach(async ({ page }) => { await page.evaluate(() => player.dispose()); });

async function play(page, url) {
  await page.evaluate(url => {
    window.started = false;
    window.run = () => player.play(url).then(() => window.started = true);
  }, url);
  await page.locator('#run').click();
  await expect.poll(() => page.evaluate(() => window.started)).toBe(true);
}

async function expectReferencePCM(page) {
  const result = await page.evaluate(async () => {
    const bytes = await (await fetch('/test/fixtures/test_48000.pcm')).arrayBuffer();
    const reference = new Int16Array(bytes);
    const samples = outputChunks.flatMap(c => c.samples);
    return {
      rate: contexts.at(-1).sampleRate,
      rates: [...new Set(outputChunks.map(c => c.rate))],
      samples: samples.length,
      exact: samples.length === reference.length && samples.every((s, i) => s === reference[i] / 32768),
    };
  });
  expect(result).toEqual({ rate: 48000, rates: [48000], samples: 240000, exact: true });
}

test('SILK chunk rendering matches a continuous reference without resampling spikes', async ({ page }) => {
  await play(page, '/test/fixtures/test.slk');
  await expect.poll(() => page.evaluate(() => player.getSnapshot().status), { timeout: 10000 }).toBe('ended');
  await expectReferencePCM(page);
  const difference = await page.evaluate(async () => {
    const reference = new Int16Array(await (await fetch('/test/fixtures/test_48000.pcm')).arrayBuffer());
    const rate = contexts[0].sampleRate;
    const first = outputChunks[0].when;
    async function render(chunks) {
      const context = new OfflineAudioContext(1, Math.ceil((first + 5.05) * rate), rate);
      for (const c of chunks) {
        const buffer = context.createBuffer(1, c.samples.length, c.rate);
        buffer.copyToChannel(Float32Array.from(c.samples), 0);
        const source = context.createBufferSource(); source.buffer = buffer;
        source.connect(context.destination); source.start(c.when);
      }
      return (await context.startRendering()).getChannelData(0);
    }
    const actual = await render(outputChunks);
    const expected = await render([{ when: first, rate: 48000, samples: Array.from(reference, s => s / 32768) }]);
    let maxError = 0;
    for (let i = 0; i < actual.length; i++) maxError = Math.max(maxError, Math.abs(actual[i] - expected[i]));
    return { maxError, chunks: outputChunks.length };
  });
  expect(difference.chunks).toBeGreaterThan(2);
  // Well below one 16-bit PCM step; the old path produced large boundary spikes.
  expect(difference.maxError).toBeLessThan(1e-6);
});

test('SILK resampling keeps its history through streaming underflow, pause and cached replay', async ({ page }) => {
  const id = 'resampling-stream';
  await play(page, `/stream.silk?id=${id}&delay=20&batch=5&gap=1`);
  const initial = await page.evaluate(id => fetch('/stats?id=' + id).then(r => r.json()), id);
  expect(initial.done).toBe(false);
  await expect.poll(() => page.evaluate(() => player.getSnapshot().status)).toBe('buffering');
  await page.evaluate(() => player.pause());
  await expect.poll(() => page.evaluate(() => player.getSnapshot().status)).toBe('paused');
  await expect.poll(() => page.evaluate(() => contexts.at(-1).state)).toBe('suspended');
  await play(page);
  await expect.poll(() => page.evaluate(() => player.getSnapshot().status), { timeout: 10000 }).toBe('ended');
  await expectReferencePCM(page);

  await page.evaluate(() => { window.outputChunks = []; });
  await play(page);
  await expect.poll(() => page.evaluate(() => player.getSnapshot().status), { timeout: 10000 }).toBe('ended');
  await expectReferencePCM(page);
  const replay = await page.evaluate(id => fetch('/stats?id=' + id).then(r => r.json()), id);
  expect(replay.requests).toBe(initial.requests);
});
