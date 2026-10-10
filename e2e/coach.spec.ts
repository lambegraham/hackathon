import { expect, test, type Page } from '@playwright/test';

test('real same-origin browser POST passes the server origin guard', async ({ page }) => {
  await page.goto('/');
  const response = await page.evaluate(async () => {
    const result = await fetch('/api/converse', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    return { status: result.status, body: await result.json() };
  });
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('Invalid request');
});

const report = {
  summary: 'You made a clear case and responded calmly to objections.',
  strengths: ['You named a concrete achievement.', 'You made a specific request.'],
  improvements: ['Quantify the impact.', 'Invite discussion about next steps.'],
  suggestedResponse: 'I would like to discuss a salary increase based on my expanded responsibilities.'
};

function shortWav() {
  const buffer = Buffer.alloc(44 + 1600);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24); buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(1600, 40);
  for (let i = 0; i < 800; i++) buffer.writeInt16LE(Math.round(Math.sin(i / 10) * 500), 44 + i * 2);
  return buffer;
}

async function providers(page: Page, voice = true) {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: voice } }));
  await page.route('**/api/speak', route => route.fulfill({ contentType: 'audio/wav', body: shortWav() }));
  await page.route('**/api/feedback', route => route.fulfill({ json: report }));
}

test('three turns preserve scenario/history, play voice, and produce feedback', async ({ page }) => {
  await providers(page);
  const requests: { scenarioId: string; difficulty: string; messages: { role: string; content: string }[] }[] = [];
  await page.route('**/api/converse', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { reply: `What evidence supports your request? Turn ${requests.length}.` } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/rehearsal-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Ask for a raise/ }).click();
  await page.getByLabel('Their approach').selectOption('challenging');
  await page.getByRole('button', { name: 'Start practising' }).click();
  const answers = ['I took ownership of onboarding.', 'It saved ten hours each month.', 'Could we agree on next steps?'];
  for (const [index, answer] of answers.entries()) {
    await page.getByLabel('Your answer').fill(answer);
    await page.getByRole('button', { name: 'Send answer' }).click();
    await expect(page.getByText(`What evidence supports your request? Turn ${index + 1}.`, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Your answer')).toBeEnabled();
  }
  expect(requests).toHaveLength(3);
  expect(requests[2].scenarioId).toBe('raise');
  expect(requests[2].difficulty).toBe('challenging');
  expect(requests[2].messages.filter(m => m.role === 'user').map(m => m.content)).toEqual([
    'I took ownership of onboarding.', 'It saved ten hours each month.', 'Could we agree on next steps?'
  ]);
  await page.getByRole('button', { name: 'End session & get feedback' }).click();
  await expect(page.getByText(report.summary)).toBeVisible();
  await expect(page.getByText(report.suggestedResponse, { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Practise another conversation' }).click();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeVisible();
  await expect(page.getByText('I took ownership of onboarding.', { exact: true })).toHaveCount(0);
});

test('microphone sends a genuine WAV, then transcribes and plays the reply', async ({ page }) => {
  await providers(page);
  let receivedAudio = false;
  await page.route('**/api/transcribe', route => {
    const body = route.request().postDataBuffer()!;
    expect(route.request().headers()['content-type']).toBe('audio/wav');
    expect(body.toString('ascii', 0, 4)).toBe('RIFF');
    expect(body.toString('ascii', 8, 12)).toBe('WAVE');
    expect(body.readUInt16LE(20)).toBe(1);
    expect(body.readUInt16LE(34)).toBe(16);
    receivedAudio = true;
    return route.fulfill({ json: { text: 'I would like to discuss my responsibilities.' } });
  });
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'What has changed in your role?' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByRole('button', { name: 'Record your answer' }).click();
  await expect(page.getByText('Listening to you', { exact: true })).toBeVisible();
  // Give the synthetic test microphone enough samples to exercise the worklet.
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Finish & send' }).click();
  await expect(page.getByText('I would like to discuss my responsibilities.', { exact: true })).toBeVisible();
  await expect(page.getByText('What has changed in your role?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record your answer' })).toBeEnabled();
  expect(receivedAudio).toBe(true);
});

test('failed speech preserves reply and allows a typed next turn', async ({ page }) => {
  await providers(page);
  await page.route('**/api/speak', route => route.fulfill({ status: 502, json: { error: 'Speech unavailable.' } }));
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'Tell me about the result.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer').fill('I built an onboarding tool.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('Tell me about the result.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Speech unavailable' })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
});

test('missing Gemini prevents a session instead of inventing answers', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: false, gradium: false } }));
  await page.goto('/');
  await expect(page.getByText('Connect Gemini to start practising.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeDisabled();
});

test('reset cancels a pending response and prevents stale transcript updates', async ({ page }) => {
  await providers(page, false);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/converse', async route => {
    await pending;
    await route.fulfill({ json: { reply: 'A stale response.' } }).catch(() => undefined);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer').fill('Please help me rehearse.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('Please help me rehearse.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset session' }).click();
  release();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeVisible();
  await expect(page.getByText('A stale response.', { exact: true })).toHaveCount(0);
});

test('mobile layout keeps setup and controls within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await providers(page, false);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await page.screenshot({ path: 'test-results/rehearsal-mobile.png', fullPage: true });
});

test('waiting for microphone permission cannot overlap a typed turn', async ({ page }) => {
  await providers(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>(() => undefined);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByRole('button', { name: 'Record your answer' }).click();
  await expect(page.getByLabel('Your answer')).toBeDisabled();
  await page.getByRole('button', { name: 'Reset session' }).click();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeEnabled();
});
