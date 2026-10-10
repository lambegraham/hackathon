import { pathToFileURL } from 'node:url';

// Exercise the real app routes without reading or printing credentials.
export async function checkGradium() {
  const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:3000';
  const request = async (path, stage, init = {}) => {
    let response;
    try {
      response = await fetch(`${appUrl}/api/${path}`, {
        ...init, signal: AbortSignal.timeout(30000), redirect: 'error'
      });
    } catch {
      throw new Error(`${stage} could not connect or timed out. Start the app with npm run dev.`);
    }
    if (!response.ok) {
      throw new Error(`${stage} failed (HTTP ${response.status}). Check your Gradium key, credits and voice in Studio.`);
    }
    return response;
  };

  const status = await (await request('status', 'Service check')).json();
  if (status.gradium !== true) {
    throw new Error('Set GRADIUM_API_KEY in .env.local and restart the app before running this check.');
  }
  const speech = await request('speak', 'Speech synthesis', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'I am ready to practise this conversation.' })
  });
  if (!speech.headers.get('content-type')?.includes('audio/wav')) {
    throw new Error('Speech synthesis returned an unexpected audio format.');
  }
  const audio = await speech.arrayBuffer();
  if (!audio.byteLength) throw new Error('Speech synthesis returned no audio.');
  const transcript = await (await request('transcribe', 'Transcription', {
    method: 'POST', headers: { 'content-type': 'audio/wav' }, body: audio
  })).json();
  if (typeof transcript.text !== 'string' || !transcript.text.trim()) {
    throw new Error('Transcription returned no text.');
  }
  return transcript.text.trim();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('Checking Gradium through the local app: one short TTS call and one STT call use credits.');
  try {
    await checkGradium();
    console.log('PASS: Gradium generated WAV audio and transcribed it through the app routes.');
  } catch (error) {
    console.error(error instanceof Error && !['SyntaxError', 'TypeError'].includes(error.name)
      ? error.message : 'Gradium check failed: the app returned an invalid response.');
    process.exitCode = 1;
  }
}
