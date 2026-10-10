import { expect, test, type Page } from '@playwright/test';

async function seedAudioReport(page: Page, { partial = false, missing = false, warning = false, failed = false, storageWarning = false } = {}) {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: false } }));
  await page.goto('/');
  await page.evaluate(async ({ partial, missing, warning, failed, storageWarning }) => {
    const makeSession = (id: string, completedAt: string, fillerCount: number) => ({
      id, completedAt, scenarioId: 'interview', difficulty: 'neutral', durationSeconds: 3,
      messages: [{ role: 'user', content: 'Um I built a useful tool for our team.' }],
      report: { summary: 'Audio review test report.', strengths: ['A clear example.', 'A relevant answer.'], improvements: ['Practise pausing.', 'Give more detail.'], suggestedResponse: 'I built a tool.' },
      audio: {
        recordings: [{ id: 'clip-1', durationSeconds: 3 }],
        analyses: id === 'current' && failed ? [] : [{ recordingId: 'clip-1', model: 'gemini-3.5-flash', transcript: 'Um I built a useful tool for our team.', fillers: Array.from({ length: fillerCount }, (_, index) => ({ word: 'um', startSeconds: 1.25 + index * .5, endSeconds: 1.45 + index * .5 })) }],
        ...(id === 'current' && warning ? { captureWarning: 'Recording stopped before the conversation ended.' } : {}),
        ...(id === 'current' && failed ? { error: 'Gemini was temporarily unavailable.' } : {}),
        ...(id === 'current' && storageWarning ? { storageWarning: 'The recording could not be saved locally.' } : {}),
      },
    });
    const earlier = makeSession('earlier', '2026-10-09T10:00:00.000Z', 2);
    const current = makeSession('current', '2026-10-10T10:00:00.000Z', 1);
    if (partial) current.audio.recordings.push({ id: 'clip-2', durationSeconds: 3 });
    localStorage.setItem('rehearsal.profile.v1', JSON.stringify({ version: 1, sessions: [earlier, current] }));
    if (missing) return;
    // A real, playable PCM WAV so seeking exercises the browser media element.
    const data = new ArrayBuffer(44 + 8000 * 3 * 2);
    const view = new DataView(data);
    const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, data.byteLength - 44, true);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('coach-session-audio', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('recordings', { keyPath: ['sessionId', 'id'] });
        store.createIndex('sessionId', 'sessionId');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('recordings', 'readwrite');
        tx.objectStore('recordings').put({ sessionId: 'current', id: 'clip-1', durationSeconds: 3, blob: new Blob([data], { type: 'audio/wav' }) });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, { partial, missing, warning, failed, storageWarning });
  await page.reload();
  await expect(page.locator('.intro')).toHaveCount(0);
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.getByRole('button', { name: 'Open report' }).first().click();
  if (!warning && !failed && !storageWarning) await page.locator('summary').filter({ hasText: 'Voice & recording' }).click();
}

test('saved audio survives reload, plays filler timestamps and graphs comparable sessions on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedAudioReport(page);
  await expect(page.getByRole('heading', { name: 'Hear your speaking habits' })).toBeVisible();
  const player = page.getByLabel('Your recorded voice');
  await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.readyState)).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Play um at 0:01.3' }).click();
  await expect.poll(() => player.evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThanOrEqual(1.25);
  await expect(page.getByRole('figure', { name: 'Filler word counts' })).toContainText('um');
  await expect(page.getByRole('figure', { name: 'Filler frequency across matching sessions' })).toBeVisible();
  await page.getByText('Read the verbatim audio transcript').click();
  await expect(page.getByRole('region', { name: 'Recorded voice analysis' }).getByText('Um I built a useful tool for our team.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('region', { name: 'Recorded voice analysis' }).screenshot({ path: '/private/tmp/audio-review-mobile.png' });
});

test('incomplete analysis is labelled partial and missing audio does not imply zero fillers', async ({ page }) => {
  await seedAudioReport(page, { partial: true, missing: true });
  await expect(page.getByText('Partial analysis: 1 of 2 recordings analysed.')).toBeVisible();
  await expect(page.getByText('This recording is unavailable in this browser. Your saved analysis is still here.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play um at 0:01.3' })).toBeDisabled();
  await expect(page.getByRole('figure', { name: 'Filler frequency across matching sessions' })).toHaveCount(0);
});

test('a truncated recording retains playback and counts but is excluded from progress comparisons', async ({ page }) => {
  await seedAudioReport(page, { warning: true });
  await expect(page.getByText('Recording stopped before the conversation ended.')).toBeVisible();
  await expect(page.getByText('This session has an audio recording or analysis warning, so it is excluded from progress comparisons.')).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Filler word counts' })).toContainText('um');
  await expect(page.getByRole('figure', { name: 'Filler frequency across matching sessions' })).toHaveCount(0);
});

test('successful retry keeps the capture warning and excludes truncated audio from progress', async ({ page }) => {
  await page.route('**/api/analyse-audio', route => route.fulfill({ json: {
    model: 'gemini-3.5-flash', transcript: 'Um I built a useful tool for our team.',
    fillers: [{ word: 'um', startSeconds: 1.25, endSeconds: 1.45 }],
  } }));
  await seedAudioReport(page, { warning: true, failed: true });
  await expect(page.getByText('Recording stopped before the conversation ended.')).toBeVisible();
  await expect(page.getByText('Gemini was temporarily unavailable.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry audio analysis' }).click();
  await expect(page.getByText('1 recording analysed.')).toBeVisible();
  await expect(page.getByText('Gemini was temporarily unavailable.')).toHaveCount(0);
  await expect(page.getByText('Recording stopped before the conversation ended.')).toBeVisible();
  await expect(page.getByText('This session has an audio recording or analysis warning, so it is excluded from progress comparisons.')).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Filler frequency across matching sessions' })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.intro')).toHaveCount(0);
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.getByRole('button', { name: 'Open report' }).first().click();
  await expect(page.getByText('Recording stopped before the conversation ended.')).toBeVisible();
});

test('a storage warning preserves comparisons from fully analysed recordings', async ({ page }) => {
  await seedAudioReport(page, { storageWarning: true, missing: true });
  await expect(page.getByText('The recording could not be saved locally.')).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Filler frequency across matching sessions' })).toBeVisible();
});

test('retry accepts a point timestamp and saves playable filler graphs after reload', async ({ page }) => {
  await page.route('**/api/analyse-audio', route => route.fulfill({ json: {
    model: 'gemini-3.5-transcribe', transcript: 'Um I built a useful tool for our team.',
    fillers: [{ word: 'um', startSeconds: 1.25, endSeconds: 1.25 }],
  } }));
  await seedAudioReport(page, { failed: true });
  await page.getByRole('button', { name: 'Retry audio analysis' }).click();
  await expect(page.getByText('1 recording analysed.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rehearsal.profile.v1')!).sessions.find((s: { id: string }) => s.id === 'current').audio.analyses.length)).toBe(1);
  await page.reload();
  await expect(page.locator('.intro')).toHaveCount(0);
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.getByRole('button', { name: 'Open report' }).first().click();
  await page.locator('summary').filter({ hasText: 'Voice & recording' }).click();
  await expect(page.getByRole('figure', { name: 'Filler frequency across matching sessions' })).toBeVisible();
  await page.getByRole('button', { name: 'Play um at 0:01.3' }).click();
  await expect.poll(() => page.getByLabel('Your recorded voice').evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThanOrEqual(1.25);
});

for (const action of ['delete', 'clear'] as const) test(`${action} removes saved audio from IndexedDB`, async ({ page }) => {
  await seedAudioReport(page);
  await page.getByRole('button', { name: 'My profile' }).click();
  if (action === 'delete') await page.getByRole('button', { name: 'Delete session' }).first().click();
  else {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Clear history' }).click();
  }
  await expect(page.getByRole('button', { name: 'Open report' })).toHaveCount(action === 'delete' ? 1 : 0);
  await expect.poll(() => page.evaluate(() => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('coach-session-audio', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const count = db.transaction('recordings', 'readonly').objectStore('recordings').index('sessionId').count('current');
      count.onsuccess = () => { db.close(); resolve(count.result); };
      count.onerror = () => { db.close(); reject(count.error); };
    };
  }))).toBe(0);
});
