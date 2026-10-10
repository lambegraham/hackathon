import { expect, test } from '@playwright/test';

for (const { mode, retry } of [{ mode: 'manual', retry: false }, { mode: 'live', retry: false }, { mode: 'manual', retry: true }]) {
  test(`${mode} records microphone audio, analyses after feedback and retains playback on reload${retry ? ' after analysis failure and retry' : ''}`, async ({ page }) => {
    let audioCalls = 0;
    let feedbackRequested = false;
    await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: true } }));
    await page.route('**/api/voice-token', route => route.fulfill({ json: { token: 'test-token' } }));
    await page.route('**/api/speak', route => route.fulfill({ contentType: 'audio/pcm', body: Buffer.alloc(9600), headers: { 'X-Audio-Sample-Rate': '48000' } }));
    await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'Tell me the result.' } }));
    await page.route('**/api/transcribe', route => route.fulfill({ json: { text: 'I built a tool.' } }));
    await page.route('**/api/feedback', route => {
      feedbackRequested = true;
      return route.fulfill({ json: { summary: 'A useful practice session.', strengths: ['Clear.', 'Specific.'], improvements: ['Add impact.', 'Explain ownership.'], suggestedResponse: 'I built a useful tool.' } });
    });
    await page.route('**/api/analyse-audio', route => {
      expect(feedbackRequested).toBe(true);
      const wav = route.request().postDataBuffer()!;
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.readUInt32LE(24)).toBe(16000);
      expect(wav.length).toBe(44 + 32000 * 2);
      audioCalls++;
      if (retry && audioCalls === 1) return route.fulfill({ status: 503, json: { error: 'Audio service is temporarily unavailable.' } });
      return route.fulfill({ json: { model: 'gemini-3.5-transcribe', transcript: 'Um, I built a tool.', fillers: [{ word: 'Um', startSeconds: .2, endSeconds: .5 }] } });
    });
    await page.addInitScript(() => {
      type Port = { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (message: unknown) => void };
      const harness: { port?: Port; socket?: { emit: (value: object) => void } } = {};
      Object.assign(window, { audioTest: harness });
      const node = () => ({ connect() {}, disconnect() {} });
      window.AudioContext = class {
        sampleRate = 24000; currentTime = 0; destination = {}; audioWorklet = { addModule: async () => {} };
        resume = async () => {}; close = async () => {}; createMediaStreamSource = node;
        createGain() { return { ...node(), gain: { value: 0 } }; }
        createBuffer(_channels: number, length: number, rate: number) { return { duration: length / rate, copyToChannel() {} }; }
        createBufferSource() { return { ...node(), buffer: null, onended: null as (() => void) | null, start() { setTimeout(() => this.onended?.(), 0); }, stop() {} }; }
      } as unknown as typeof AudioContext;
      window.AudioWorkletNode = class {
        port: Port = { onmessage: null, postMessage: () => { this.port.onmessage?.({ data: { type: 'drained' } }); } };
        constructor() { harness.port = this.port; } connect() {} disconnect() {}
      } as unknown as typeof AudioWorkletNode;
      navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] }) as unknown as MediaStream;
      const OriginalSocket = window.WebSocket;
      class Socket {
        readyState = 1; bufferedAmount = 0; onopen: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null;
        constructor(url: string | URL, protocols?: string | string[]) {
          if (!String(url).startsWith('wss://api.gradium.ai/')) return new OriginalSocket(url, protocols) as unknown as Socket;
          harness.socket = this; setTimeout(() => this.onopen?.(), 0);
        }
        send(data: string) { const message = JSON.parse(data); if (message.type === 'setup') this.emit({ type: 'ready' }); if (message.type === 'flush') this.emit({ type: 'flushed', flush_id: message.flush_id }); }
        emit(value: object) { this.onmessage?.({ data: JSON.stringify(value) }); }
        close() { this.readyState = 3; }
      }
      window.WebSocket = Socket as unknown as typeof WebSocket;
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Start practising' }).click();
    await expect(page.getByRole('button', { name: 'Record your answer', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: mode === 'manual' ? 'Record your answer' : 'Start live voice', exact: true }).click();
    await expect(page.getByRole('button', { name: mode === 'manual' ? 'Finish & send' : 'Stop live voice', exact: true })).toBeVisible();
    await page.evaluate(mode => {
      const h = (window as unknown as { audioTest: { port: { onmessage(event: object): void }; socket: { emit(value: object): void } } }).audioTest;
      h.port.onmessage({ data: new Float32Array(48000).fill(.1) });
      if (mode === 'live') h.socket.emit({ type: 'text', text: 'I built a tool.', start_s: 0 });
    }, mode);
    expect(audioCalls).toBe(0);
    if (mode === 'manual') await page.getByRole('button', { name: 'Finish & send' }).click();
    await expect(page.getByText('Tell me the result.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'End session & get feedback' })).toBeEnabled();
    await page.getByRole('button', { name: 'End session & get feedback' }).click();
    if (retry) {
      await expect(page.getByRole('button', { name: 'Retry audio analysis' })).toBeEnabled();
      await expect(page.getByText('Audio service is temporarily unavailable.')).toBeVisible();
      await page.reload();
      await page.getByRole('button', { name: 'My profile' }).click();
      await page.getByRole('button', { name: 'Open report' }).first().click();
      await expect(page.getByLabel('Your recorded voice')).toHaveAttribute('src', /^blob:/);
      await page.getByRole('button', { name: 'Retry audio analysis' }).click();
    }
    await expect(page.getByText('1 recording analysed.', { exact: true })).toBeVisible();
    expect(audioCalls).toBe(retry ? 2 : 1);
    await expect(page.getByRole('button', { name: 'Play Um at 0:00.2' })).toBeEnabled();
    await page.reload();
    await page.getByRole('button', { name: 'My profile' }).click();
    await page.getByRole('button', { name: 'Open report' }).first().click();
    await page.locator('summary').filter({ hasText: 'Voice & recording' }).click();
    await expect(page.getByLabel('Your recorded voice')).toHaveAttribute('src', /^blob:/);
    await expect(page.getByRole('figure', { name: 'Filler word counts' })).toContainText('um');
  });
}
