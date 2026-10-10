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

test('explicit voice overrides adaptive audio while keeping the sunflower', async ({ page }) => {
  await providers(page);
  let speech: { voiceId: string; format: string } | undefined;
  await page.route('**/api/speak', route => {
    speech = route.request().postDataJSON();
    return route.fulfill({ contentType: 'audio/wav', body: shortWav() });
  });
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'Tell me about your experience.', userTone: 'nervous', tonality: 'reassuring' } }));
  await page.goto('/');
  await expect(page.getByLabel('Their voice')).toHaveValue('auto');
  await page.getByLabel('Their voice').selectOption('lainey');
  await expect(page.getByText('Lainey · Interviewer', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sunflower happy to see you' })).toBeVisible();
  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.getByLabel('Their voice')).toBeDisabled();
  await page.getByLabel('Your answer').fill('I enjoy building useful tools.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  expect(speech).toMatchObject({ voiceId: 'lainey', format: 'pcm', tonality: 'reassuring' });
  await expect(page.getByRole('heading', { name: 'I’m sensing you feel nervous, so I’m adapting a reassuring tone. Lainey is here to train you.' })).toBeVisible();
  await expect(page.locator('.message-assistant .message-author').last()).toHaveText('Lainey');
});

test('speech starts from the first PCM chunk before the response completes', async ({ page }) => {
  await providers(page);
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'Let us discuss your experience.' } }));
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (String(input) !== '/api/speak') return originalFetch(input, init);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(19200));
          Object.assign(window, { finishSpeechStream: () => controller.close() });
        }
      });
      return new Response(stream, { headers: { 'Content-Type': 'audio/pcm', 'X-Audio-Sample-Rate': '48000' } });
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer').fill('I build applications.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('Let us discuss your experience.', { exact: true })).toBeVisible();
  await expect(page.getByText('Sunflower is speaking', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeDisabled();
  await page.evaluate(() => (window as unknown as { finishSpeechStream(): void }).finishSpeechStream());
  await expect(page.getByLabel('Your answer')).toBeEnabled();
});

test('three turns preserve scenario/history, play voice, and produce feedback', async ({ page }) => {
  await providers(page);
  const requests: { scenarioId: string; difficulty: string; messages: { role: string; content: string }[] }[] = [];
  await page.route('**/api/converse', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { reply: `What evidence supports your request? Turn ${requests.length}.` } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeEnabled();
  await expect(page.locator('.intro')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/rehearsal-desktop.png', fullPage: true });
  await page.getByRole('radio', { name: /Bazaar negotiation/ }).click();
  await page.getByRole('button', { name: 'Start practising' }).click();
  const answers = ['I took ownership of onboarding.', 'It saved ten hours each month.', 'Could we agree on next steps?'];
  for (const [index, answer] of answers.entries()) {
    await page.getByLabel('Your answer').fill(answer);
    await page.getByRole('button', { name: 'Send answer' }).click();
    await expect(page.getByText(`What evidence supports your request? Turn ${index + 1}.`)).toBeVisible();
    await expect(page.getByLabel('Your answer')).toBeEnabled();
  }
  expect(requests).toHaveLength(3);
  expect(requests[2].scenarioId).toBe('bazaar');
  expect(requests[2].difficulty).toBe('neutral');
  expect(requests[2].messages.filter(m => m.role === 'user').map(m => m.content)).toEqual([
    'I took ownership of onboarding.', 'It saved ten hours each month.', 'Could we agree on next steps?'
  ]);
  await page.getByRole('button', { name: 'End session & get feedback' }).click();
  await expect(page.getByText(report.summary)).toBeVisible();
  await expect(page.getByText(report.suggestedResponse, { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Practise again' }).click();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeVisible();
  await expect(page.getByText('I took ownership of onboarding.')).toHaveCount(0);
});

test('sunflower states the detected feeling, adapted tone and voice, and shows it on its face', async ({ page }) => {
  await providers(page);
  const spoken: { text: string; tonality?: string }[] = [];
  const conversed: { tonality?: string }[] = [];
  await page.route('**/api/speak', route => {
    spoken.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'audio/wav', body: shortWav() });
  });
  await page.route('**/api/converse', route => {
    conversed.push(route.request().postDataJSON());
    const [userTone, tonality] = conversed.length === 1 ? ['nervous', 'reassuring'] : ['frustrated', 'empathic'];
    return route.fulfill({ json: { reply: `Take your time. Turn ${conversed.length}.`, userTone, tonality } });
  });
  await page.goto('/');
  await expect(page.getByRole('img', { name: 'Sunflower happy to see you' })).toBeVisible();
  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.getByRole('heading', { name: 'Talk to me. I’ll sense how you feel and adapt my tone.' })).toBeVisible();
  await page.getByLabel('Your answer').fill('Um, I think maybe I deserve more?');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByRole('heading', { name: 'I’m sensing you feel nervous, so I’m adapting a reassuring tone. Hadley is here to train you.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sunflower looking nervous' })).toBeVisible();
  await page.locator('.flower').screenshot({ path: 'test-results/sunflower-nervous.png' });
  await page.getByLabel('Your answer').fill('Nobody has answered me for weeks.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByRole('heading', { name: 'I’m sensing you feel frustrated, so I’m adapting an empathic tone. Drew is here to train you.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Sunflower looking frustrated' })).toBeVisible();
  await page.locator('.flower').screenshot({ path: 'test-results/sunflower-frustrated.png' });
  expect(conversed.map(body => body.tonality)).toEqual(['auto', 'auto']);
  expect(spoken.map(body => body.tonality)).toEqual(['reassuring', 'empathic']);
});

test('intro shows Got credits? :) and then reveals the sunflower', async ({ page }) => {
  await providers(page, false);
  await page.goto('/');
  await expect(page.locator('.intro')).toContainText('Got credits?');
  await expect(page.locator('.intro')).toContainText(':)');
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeEnabled();
});

test('wardrobe dresses the sunflower and picks the scenario to train', async ({ page }) => {
  await providers(page, false);
  const requests: { scenarioId: string }[] = [];
  await page.route('**/api/converse', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { reply: 'Hello? Who is this?' } });
  });
  await page.goto('/');
  const rail = page.getByRole('radiogroup', { name: 'Choose an outfit' });
  await expect(rail.getByRole('radio')).toHaveCount(5);
  await expect(page.getByRole('radio', { name: 'Job interview: Suit & tie' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.flower')).toHaveAttribute('data-outfit', 'interview');
  await page.getByRole('button', { name: 'Next outfit' }).click();
  await expect(page.locator('.flower')).toHaveAttribute('data-outfit', 'relationship');
  await expect(page.locator('.wardrobe-text')).toContainText('Relationship breakup');
  await expect(page.locator('.wardrobe-text')).toContainText('Handbag & pearls');
  await page.getByRole('radio', { name: /Relationship breakup/ }).press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Flatmate talk: Cosy beanie & mug' })).toBeFocused();
  await page.getByRole('button', { name: 'Previous outfit' }).click();
  await page.getByRole('button', { name: 'Previous outfit' }).click();
  await page.getByRole('button', { name: 'Previous outfit' }).click();
  await expect(page.locator('.flower')).toHaveAttribute('data-outfit', 'bazaar');
  await page.getByRole('button', { name: 'Previous outfit' }).click();
  await expect(page.locator('.flower')).toHaveAttribute('data-outfit', 'coldcall');
  await page.locator('.flower').screenshot({ path: 'test-results/sunflower-coldcall.png' });
  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.getByText('Hello? Who is this?')).toBeVisible();
  await expect(page.locator('.flower')).toHaveAttribute('data-outfit', 'coldcall');
  await page.getByLabel('Your answer').fill('Hi, I am calling about your energy bills.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  expect(requests[0].scenarioId).toBe('coldcall');
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
  await expect(page.getByText('What has changed in your role?')).toBeVisible();
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
  await expect(page.getByText('Tell me about the result.')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Speech unavailable' })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
});

test('unavailable browser audio still sends the answer and preserves text', async ({ page }) => {
  await providers(page);
  await page.addInitScript(() => {
    window.AudioContext = class { constructor() { throw new Error('Audio unavailable'); } } as unknown as typeof AudioContext;
  });
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'Your experience sounds relevant.' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer').fill('I have built several applications.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('Your experience sounds relevant.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Audio could not start' })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
});

test('missing Gemini prevents a session instead of inventing answers', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: false, gradium: false } }));
  await page.goto('/');
  await expect(page.getByText('Connect Gemini to start practising.', { exact: false })).toBeVisible();
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
  await expect(page.getByText('A stale response.')).toHaveCount(0);
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

test('studio focus and full stage retain the sunflower, outfit and conversation', async ({ page }) => {
  await providers(page, false);
  await page.goto('/');
  await page.getByRole('radio', { name: 'Flatmate talk: Cosy beanie & mug' }).click();
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(page.locator('.studio-grid')).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('.flower')).toHaveAttribute('data-outfit', 'flatmate');
  await expect(page.locator('.aura-visualizer-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Maximize stage' }).click();
  await expect(page.locator('.studio-grid')).toHaveClass(/stage-maximized/);
  await page.getByRole('button', { name: 'Restore view' }).click();
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Choose an outfit' })).toBeVisible();
});
