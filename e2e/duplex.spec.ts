import { expect, test, type Page } from '@playwright/test';

async function liveProviders(page: Page, pendingPermission = false) {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: true } }));
  await page.route('**/api/voice-token', route => route.fulfill({ json: { token: 'test-token' } }));
  await page.route('**/api/speak', route => route.fulfill({ contentType: 'audio/pcm', body: Buffer.alloc(9600), headers: { 'X-Audio-Sample-Rate': '48000' } }));
  await page.addInitScript(({ pendingPermission }) => {
    type Harness = { socket?: FakeSocket; port?: { onmessage: ((event: { data: Float32Array }) => void) | null }; release?: () => void; stopped: number; audioStopped: number };
    const harness: Harness = { stopped: 0, audioStopped: 0 };
    Object.assign(window, { duplexHarness: harness });
    const node = () => ({ connect() {}, disconnect() {} });
    window.AudioContext = class {
      sampleRate = 24000; currentTime = 0; destination = {}; audioWorklet = { addModule: async () => {} };
      resume = async () => {}; close = async () => {}; createMediaStreamSource = node;
      createGain() { return { ...node(), gain: { value: 0 } }; }
      createBuffer(_channels: number, length: number, rate: number) { return { duration: length / rate, copyToChannel() {} }; }
      createBufferSource() { return { ...node(), buffer: null, onended: null as (() => void) | null, start() { setTimeout(() => this.onended?.(), (window as unknown as { holdDuplexAudio?: boolean }).holdDuplexAudio ? 5000 : 200); }, stop() { harness.audioStopped++; } }; }
    } as unknown as typeof AudioContext;
    window.AudioWorkletNode = class { port = { onmessage: null }; constructor() { harness.port = this.port; } connect() {} disconnect() {} } as unknown as typeof AudioWorkletNode;
    navigator.mediaDevices.getUserMedia = async () => {
      if (pendingPermission) await new Promise<void>(resolve => { harness.release = resolve; });
      return { getTracks: () => [{ stop() { harness.stopped++; } }] } as unknown as MediaStream;
    };
    const OriginalWebSocket = window.WebSocket;
    class FakeSocket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 1; bufferedAmount = 0; onopen: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null;
      onerror = null; onclose = null;
      constructor(url: string | URL, protocols?: string | string[]) {
        if (!String(url).startsWith('wss://api.gradium.ai/')) return new OriginalWebSocket(url, protocols) as unknown as FakeSocket;
        harness.socket = this; setTimeout(() => this.onopen?.(), 0);
      }
      send(data: string) { const message = JSON.parse(data); if (message.type === 'setup') this.emit({ type: 'ready' }); if (message.type === 'flush') this.emit({ type: 'flushed', flush_id: message.flush_id }); }
      emit(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
      close() { this.readyState = 3; }
    }
    window.WebSocket = FakeSocket as unknown as typeof WebSocket;
  }, { pendingPermission });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
}

async function say(page: Page, text: string) {
  await page.evaluate(text => {
    const h = (window as unknown as { duplexHarness: { socket: { emit(message: object): void } } }).duplexHarness;
    h.socket.emit({ type: 'text', text });
    h.socket.emit({ type: 'step', vad: [{ horizon_s: .5, inactivity_prob: .99 }] });
  }, text);
}

async function interrupt(page: Page) {
  await page.evaluate(() => {
    const h = (window as unknown as { duplexHarness: { port: { onmessage(event: { data: Float32Array }): void } } }).duplexHarness;
    for (let i = 0; i < 3; i++) h.port.onmessage({ data: new Float32Array(1920).fill(.1) });
  });
}

test('continuous voice sends consecutive turns with full history and stops microphone for feedback', async ({ page }) => {
  const requests: { messages: { content: string }[] }[] = [];
  await page.route('**/api/converse', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { reply: `Reply ${requests.length}` } }); });
  await page.route('**/api/feedback', route => route.fulfill({ json: { summary: 'Good practice.', strengths: [], improvements: [], suggestedResponse: 'Try again.' } }));
  await liveProviders(page);
  await page.getByRole('button', { name: 'Start live voice' }).click();
  await expect(page.getByRole('button', { name: 'Stop live voice' })).toBeVisible();
  await say(page, 'First answer');
  await expect(page.getByText('Reply 1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await say(page, 'Second answer');
  await expect(page.getByText('Reply 2', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  expect(requests[1].messages.map(item => item.content)).toEqual(expect.arrayContaining(['First answer', 'Reply 1', 'Second answer']));
  await page.getByRole('button', { name: 'End session & get feedback' }).click();
  await expect(page.getByText('Good practice.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { duplexHarness: { stopped: number } }).duplexHarness.stopped)).toBe(1);
});

test('speech interrupts a pending response and prevents its stale reply', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/converse', async route => { await pending; await route.fulfill({ json: { reply: 'Stale answer' } }).catch(() => {}); });
  await liveProviders(page);
  await page.getByRole('button', { name: 'Start live voice' }).click();
  await expect(page.getByRole('button', { name: 'Stop live voice' })).toBeVisible();
  await say(page, 'Initial answer');
  await expect(page.getByText('Initial answer', { exact: true })).toBeVisible();
  await interrupt(page);
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  release();
  await expect(page.getByText('Stale answer', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop live voice' })).toBeVisible();
});

test('reset during microphone permission cleans late permission without reactivating voice', async ({ page }) => {
  await liveProviders(page, true);
  await page.getByRole('button', { name: 'Start live voice' }).click();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { duplexHarness: { release?: () => void } }).duplexHarness.release)).toBe(true);
  await page.getByRole('button', { name: 'Reset session' }).click();
  await page.evaluate(() => (window as unknown as { duplexHarness: { release(): void } }).duplexHarness.release());
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { duplexHarness: { stopped: number } }).duplexHarness.stopped)).toBe(1);
});

test('speech stops playing audio immediately while keeping the live microphone open', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { holdDuplexAudio: true });
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => String(input) === '/api/speak' && JSON.parse(String(init?.body)).text === 'Tell me more.'
      ? new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9600)); } }), { headers: { 'Content-Type': 'audio/pcm', 'X-Audio-Sample-Rate': '48000' } })
      : original(input, init);
  });
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'Tell me more.' } }));
  await liveProviders(page);
  await page.getByRole('button', { name: 'Start live voice' }).click();
  await expect(page.getByRole('button', { name: 'Stop live voice' })).toBeVisible();
  await say(page, 'My first answer');
  await expect(page.getByText('Sunflower is speaking', { exact: true })).toBeVisible();
  await interrupt(page);
  await expect(page.getByText('Listening · you can interrupt anytime', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { duplexHarness: { stopped: number } }).duplexHarness.stopped)).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { duplexHarness: { audioStopped: number } }).duplexHarness.audioStopped)).toBeGreaterThan(0);
});

test('a recognized quiet turn supersedes a pending response without an onset callback', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const requests: { messages: { content: string }[] }[] = [];
  await page.route('**/api/converse', async route => {
    requests.push(route.request().postDataJSON());
    const first = requests.length === 1;
    if (first) await pending;
    await route.fulfill({ json: { reply: first ? 'Old answer' : 'New answer' } }).catch(() => {});
  });
  await liveProviders(page);
  await page.getByRole('button', { name: 'Start live voice' }).click();
  await expect(page.getByRole('button', { name: 'Stop live voice' })).toBeVisible();
  await say(page, 'First question');
  await expect(page.getByText('First question', { exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await say(page, 'Let me clarify');
  await expect(page.getByText('New answer', { exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  release();
  expect(requests[1].messages.map(item => item.content)).toEqual(expect.arrayContaining(['First question', 'Let me clarify']));
  await expect(page.getByText('Old answer', { exact: true })).toHaveCount(0);
});

test('speech streams into one visible chat bubble before sending a completed turn', async ({page}) => {
  const requests: unknown[] = [];
  await page.route('**/api/converse', route => {requests.push(route.request().postDataJSON());return route.fulfill({json:{reply:'Tell me more.'}});});
  await liveProviders(page);
  await page.getByRole('button',{name:'Start live voice'}).click();
  await expect(page.getByRole('button',{name:'Stop live voice'})).toBeVisible();
  const words='I contributed to the project by implementing payment processing and testing its behavior. '.repeat(12);
  await page.evaluate(words => {
    const h=(window as unknown as {duplexHarness:{socket:{emit(message:object):void}}}).duplexHarness;
    h.socket.emit({type:'text',text:words});
  },words);
  const bubble=page.getByLabel('Live transcript');
  await expect(bubble).toContainText('I contributed to the project');
  expect(requests).toHaveLength(0);
  await expect(bubble).toBeVisible();
  await page.evaluate(()=>{
    const h=(window as unknown as {duplexHarness:{socket:{emit(message:object):void}}}).duplexHarness;
    h.socket.emit({type:'text',text:'That was my role.'});
    h.socket.emit({type:'step',vad:[{horizon_s:.5,inactivity_prob:.99}]});
  });
  await expect(page.getByText('Tell me more.',{exact:true})).toBeVisible();
  await expect(bubble).toHaveCount(0);
  await expect(page.locator('.message-user')).toHaveCount(1);
});

test('recorded answer displays live words without submitting until Finish and send',async({page})=>{
  const requests:unknown[]=[];
  await page.route('**/api/transcribe',r=>r.fulfill({json:{text:'I built a payment tool.'}}));
  await page.route('**/api/converse',r=>{requests.push(r.request().postDataJSON());return r.fulfill({json:{reply:'What was the result?'}});});
  await liveProviders(page);
  await page.getByRole('button',{name:'Record your answer',exact:true}).click();
  await expect(page.getByRole('button',{name:'Finish & send'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean((window as unknown as {duplexHarness:{socket?:unknown}}).duplexHarness.socket))).toBe(true);
  await page.evaluate(()=>{
    const h=(window as unknown as {duplexHarness:{socket:{emit(message:object):void};port:{onmessage(event:{data:Float32Array}):void}}}).duplexHarness;
    h.port.onmessage({data:new Float32Array(2400).fill(.1)});
    h.socket.emit({type:'text',text:'I built'});
  });
  await expect(page.getByLabel('Live transcript')).toContainText('I built');
  await page.evaluate(()=>{
    const h=(window as unknown as {duplexHarness:{socket:{emit(message:object):void}}}).duplexHarness;
    h.socket.emit({type:'text',text:'a payment tool.'});
    h.socket.emit({type:'step',vad:[{horizon_s:.5,inactivity_prob:.99}]});
  });
  await expect(page.getByLabel('Live transcript')).toContainText('I built a payment tool.');
  expect(requests).toHaveLength(0);
  await page.getByRole('button',{name:'Finish & send'}).click();
  await expect(page.getByText('What was the result?',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Live transcript')).toHaveCount(0);
  await expect(page.locator('.message-user')).toHaveCount(1);
});


test('raw spoken fillers and timed gaps survive the report and profile reload',async({page})=>{
  await page.route('**/api/converse',r=>r.fulfill({json:{reply:'What was the outcome?'}}));
  await page.route('**/api/feedback',r=>r.fulfill({json:{summary:'Clear ownership.',strengths:['Ownership.','Relevant.'],improvements:['Outcome.','Structure.'],suggestedResponse:'I built a tool.'}}));
  await liveProviders(page);
  await page.getByRole('button',{name:'Start live voice'}).click();
  await expect(page.getByRole('button',{name:'Stop live voice'})).toBeVisible();
  await page.evaluate(()=>{
    const h=(window as unknown as {duplexHarness:{socket:{emit(message:object):void}}}).duplexHarness;
    h.socket.emit({type:'text',text:'Um...',start_s:.2,stream_id:0});
    h.socket.emit({type:'end_text',stop_s:.6,stream_id:0});
    h.socket.emit({type:'text',text:' I, I built a tool!',start_s:1.4,stream_id:1});
    h.socket.emit({type:'end_text',stop_s:2.8,stream_id:1});
    h.socket.emit({type:'step',vad:[{horizon_s:.5,inactivity_prob:.99}]});
  });
  await expect(page.getByText('What was the outcome?',{exact:true})).toBeVisible();
  await expect(page.locator('.message-user p')).toHaveCSS('white-space','pre-wrap');
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await page.getByRole('button',{name:'End session & get feedback'}).click();
  await expect(page.getByText('Saved to your local profile',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Words, fillers and gaps'})).toBeVisible();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('rehearsal.profile.v1')!).sessions[0]);
  expect(saved.messages.find((m:{role:string})=>m.role==='user').speech.segments).toEqual([{text:'Um...',startSeconds:.2,endSeconds:.6},{text:' I, I built a tool!',startSeconds:1.4,endSeconds:2.8}]);
  await page.reload();await page.getByRole('button',{name:'My profile'}).click();await page.getByRole('button',{name:'Open report'}).click();
  await expect(page.getByRole('heading',{name:'Words, fillers and gaps'})).toBeVisible();
});
