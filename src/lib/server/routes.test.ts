import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', async importOriginal => ({
    ...(await importOriginal<typeof import('@google/genai')>()),
    GoogleGenAI: class { models = { generateContent }; }
}));
import { POST as converse } from '@/app/api/converse/route';
import { POST as feedback } from '@/app/api/feedback/route';
import { POST as transcribe } from '@/app/api/transcribe/route';
import { POST as speak } from '@/app/api/speak/route';
import { GET as status } from '@/app/api/status/route';
import { reportSchema } from '@/lib/feedback';
import { resetRateLimit } from './http';
import { validateWav } from './gradium';
const input = {
    scenarioId: 'interview', difficulty: 'neutral', messages: [{
            role: 'user', content: 'I built a project.'
        }]
};
function assessment(evidence = 'I built a project.') {
    return Object.fromEntries(['clarity', 'structure', 'specificity', 'relevance'].map(key => [key, {
        score: 3, evidence, action: 'Explain the impact of your work.'
    }]));
}
function coaching(evidence = 'I built a project.', messageIndex = 0) {
    return {
        rubricVersion: 'interview-coach-v1',
        answerReviews: [{ messageIndex, question: 'Tell me about your experience.', scores: { clarity: 3, structure: 2, specificity: null, relevance: 3 }, evidence, feedback: 'Name your contribution and explain the outcome.' }],
        priority: 'Make your contribution explicit.', drill: 'Practise a sixty-second answer.', nextGoal: 'Include your action and a factual result.',
        progress: { changes: [] }
    };
}
const turn = (reply: string, extra: Record<string, unknown> = {}) => ({ text: JSON.stringify({ reply, userTone: 'neutral', tonality: 'friendly', ...extra }) });
const request = (body: unknown, headers: Record<string, string> = {}) => new Request('http://localhost/api/converse', {
    method: 'POST', headers: {
        'content-type': 'application/json', ...headers
    }, body: JSON.stringify(body)
});
function wav(seconds = 1) {
    const bytes = new Uint8Array(44 + 16000 * 2 * seconds);
    const view = new DataView(bytes.buffer);
    const str = (offset: number, s: string) => Array.from(s).forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    str(0, 'RIFF');
    view.setUint32(4, bytes.length - 8, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, bytes.length - 44, true);
    return bytes;
}
describe('WAV boundaries', () => {
    it('rejects incomplete trailing chunks even when RIFF size matches', () => {
        const source = wav();
        const bytes = new Uint8Array(source.length + 2);
        bytes.set(source);
        new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
        expect(() => validateWav(bytes)).toThrow();
    });
    it('rejects invalid byte rate and unsupported encoded audio', () => {
        const bytes = wav();
        const view = new DataView(bytes.buffer);
        view.setUint32(28, 1, true);
        expect(() => validateWav(bytes)).toThrow();
        view.setUint32(28, 32000, true);
        view.setUint16(20, 3, true);
        expect(() => validateWav(bytes)).toThrow();
    });
});
describe('coach API', () => {
    beforeEach(() => {
        resetRateLimit();
        vi.restoreAllMocks();
        generateContent.mockReset();
        process.env.GEMINI_API_KEY = 'test';
        process.env.GRADIUM_API_KEY = 'test';
        vi.stubEnv('GEMINI_MODEL', undefined);
        vi.stubEnv('GEMINI_CONVERSATION_MODEL', undefined);
        vi.stubEnv('GEMINI_FEEDBACK_MODEL', undefined);
    });
    afterEach(() => vi.unstubAllEnvs());
    it.each([
        [undefined, undefined, undefined, 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview'],
        ['global-model', undefined, undefined, 'global-model', 'global-model'],
        ['global-model', 'conversation-model', 'feedback-model', 'conversation-model', 'feedback-model'],
        ['global-model', 'conversation-model', undefined, 'conversation-model', 'global-model'],
        ['global-model', undefined, 'feedback-model', 'global-model', 'feedback-model']
    ])('routes conversation and feedback models with explicit role override precedence (%s, %s, %s)', async (globalModel, conversationModel, feedbackModel, expectedConversation, expectedFeedback) => {
        vi.stubEnv('GEMINI_MODEL', globalModel);
        vi.stubEnv('GEMINI_CONVERSATION_MODEL', conversationModel);
        vi.stubEnv('GEMINI_FEEDBACK_MODEL', feedbackModel);
        generateContent.mockResolvedValueOnce(turn('Tell me more.')).mockResolvedValueOnce({ text: JSON.stringify({
            summary: 'Clear example.', observations: [], strengths: ['Specific', 'Concise'], improvements: ['Add impact', 'Explain decisions'], suggestedResponse: 'I built the feature.', assessment: assessment(), coaching: coaching()
        }) });
        expect((await converse(request(input))).status).toBe(200);
        expect((await feedback(request(input))).status).toBe(200);
        expect(generateContent.mock.calls[0][0].model).toBe(expectedConversation);
        expect(generateContent.mock.calls[1][0].model).toBe(expectedFeedback);
        if (expectedFeedback === 'gemini-3.1-pro-preview') expect(generateContent.mock.calls[1][0].config.thinkingConfig).toEqual({thinkingLevel:'MEDIUM'});
        else expect(generateContent.mock.calls[1][0].config).not.toHaveProperty('thinkingConfig');
        expect(generateContent.mock.calls[1][0].config.maxOutputTokens).toBe(8192);
    });
    it.each([
        [undefined, 'MINIMAL'],
        ['gemini-3.5-flash-lite', 'MINIMAL'],
        ['gemini-3.8-flash', 'LOW'],
        ['event-model-override', undefined]
    ])('uses supported fast conversation thinking only for known models (%s)', async (model, thinkingLevel) => {
        vi.stubEnv('GEMINI_MODEL', model);
        generateContent.mockResolvedValue(turn('Tell me more.'));
        expect((await converse(request(input))).status).toBe(200);
        const config = generateContent.mock.calls[0][0].config;
        if (thinkingLevel) expect(config.thinkingConfig).toEqual({ thinkingLevel });
        else expect(config).not.toHaveProperty('thinkingConfig');
        expect(config.maxOutputTokens).toBe(500);
    });
    it('passes full history to Gemini and returns reply with detected tones', async () => {
        generateContent.mockResolvedValue(turn('What was your contribution?', { userTone: 'nervous', tonality: 'reassuring' }));
        const response = await converse(request(input));
        expect(await response.json()).toEqual({ reply: 'What was your contribution?', userTone: 'nervous', tonality: 'reassuring' });
        expect(generateContent.mock.calls[0][0].contents).toEqual([{
                role: 'user', parts: [{ text: 'I built a project.' }]
            }]);
        expect(generateContent.mock.calls[0][0].config.responseJsonSchema.required).toEqual(['reply', 'userTone', 'tonality']);
        // Default thinking can exhaust the token budget and truncate the JSON.
        expect(generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({ thinkingLevel: 'MINIMAL' });
    });
    it('preserves measured speech metadata while requesting a fixed reply tone', async () => {
        const speech = { source: 'gradium', segments: [{ text: 'I built a project.', startSeconds: 1, endSeconds: 3 }] };
        generateContent.mockResolvedValue(turn('Go on.', { tonality: 'excited' }));
        const response = await converse(request({ ...input, tonality: 'calm', messages: [{ ...input.messages[0], speech }] }));
        expect(await response.json()).toEqual({ reply: 'Go on.', userTone: 'neutral', tonality: 'calm' });
        // The roleplay consumes dialogue text; speech timestamps remain factual metadata.
        expect(generateContent.mock.calls[0][0].contents).toEqual([{ role: 'user', parts: [{ text: 'I built a project.' }] }]);
        expect((await converse(request({ ...input, tonality: 'calm', messages: [{ ...input.messages[0], speech: { ...speech, segments: [{ text: 'I built a project.', startSeconds: 3, endSeconds: 1 }] } }] }))).status).toBe(400);
    });
    it('lets the model choose tonality in auto mode but enforces a fixed one', async () => {
        generateContent.mockResolvedValue(turn('Go on.', { tonality: 'excited' }));
        expect((await (await converse(request({ ...input, tonality: 'auto' }))).json()).tonality).toBe('excited');
        expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain('Choose the tonality');
        expect((await (await converse(request({ ...input, tonality: 'calm' }))).json()).tonality).toBe('calm');
        expect(generateContent.mock.calls[1][0].config.systemInstruction).toContain('Use the tonality "calm"');
        expect((await converse(request({ ...input, tonality: 'angry' }))).status).toBe(400);
    });
    it('rejects replies with unknown tones or without JSON', async () => {
        generateContent.mockResolvedValue(turn('Hi', { userTone: 'sarcastic' }));
        expect((await converse(request(input))).status).toBe(502);
        generateContent.mockResolvedValue({ text: 'Plain text reply' });
        expect((await converse(request(input))).status).toBe(502);
    });
    it.each([
        ['flatmate', 'flatmate'],
        ['coldcall', 'sales call'],
        ['bazaar', 'haggling'],
        ['relationship', 'break up']
    ])('accepts the %s wardrobe scenario and plays its role', async (scenarioId, role) => {
        generateContent.mockResolvedValue(turn('Go on.'));
        expect((await converse(request({ ...input, scenarioId }))).status).toBe(200);
        expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain(role);
    });
    it('rejects invalid scenario and overlong history', async () => {
        expect((await converse(request({
            ...input, scenarioId: 'bad'
        }))).status).toBe(400);
        expect((await converse(request({
            ...input, messages: [{
                    role: 'user', content: 'a'.repeat(4001)
                }]
        }))).status).toBe(400);
    });
    it('rejects cross-origin requests', async () => {
        expect((await converse(request(input, { origin: 'https://evil.test' }))).status).toBe(403);
        expect(generateContent).not.toHaveBeenCalled();
    });
    it('accepts the browser host when Next normalizes loopback to localhost', async () => {
        generateContent.mockResolvedValue(turn('Tell me more.'));
        const r = new Request('http://localhost:3000/api/converse', {
            method: 'POST', headers: {
                'content-type': 'application/json', host: '127.0.0.1:3000',
                origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin'
            }, body: JSON.stringify(input)
        });
        expect((await converse(r)).status).toBe(200);
    });
    it.each([
        ['http://localhost:3000', 'same-origin'],
        ['http://127.0.0.1:3001', 'same-origin'],
        ['https://127.0.0.1:3000', 'same-origin'],
        ['http://127.0.0.1:3000', 'cross-site'],
        ['null', 'same-origin']
    ])('rejects mismatched browser origin or cross-site metadata (%s, %s)', async (origin, site) => {
        const r = new Request('http://localhost:3000/api/converse', {
            method: 'POST', headers: {
                'content-type': 'application/json', host: '127.0.0.1:3000',
                origin, 'sec-fetch-site': site, 'x-forwarded-host': 'evil.test'
            }, body: JSON.stringify(input)
        });
        expect((await converse(r)).status).toBe(403);
        expect(generateContent).not.toHaveBeenCalled();
    });
    it('returns actionable config error without provider call', async () => {
        delete process.env.GEMINI_API_KEY;
        const r = await converse(request(input));
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: 'GEMINI_API_KEY is not configured.' });
    });
    it('sanitizes provider errors', async () => {
        generateContent.mockRejectedValue(new Error('secret token'));
        const r = await converse(request(input));
        expect(r.status).toBe(502);
        expect(JSON.stringify(await r.json())).not.toContain('secret');
    });
    it('validates structured feedback', async () => {
        const report = {
            summary: 'Clear example.', observations: [], strengths: ['Specific', 'Concise'], improvements: ['Add impact', 'Explain decisions'], suggestedResponse: 'I built the feature and measured its impact.', assessment: assessment(), coaching: coaching()
        };
        generateContent.mockResolvedValue({ text: JSON.stringify(report) });
        expect(await (await feedback(request(input))).json()).toEqual(report);
        generateContent.mockResolvedValue({ text: '{}' });
        expect((await feedback(request(input))).status).toBe(502);
    });
    it.each([0, 6, 2.5])('rejects out-of-range or fractional assessment scores (%s)', async score => {
        const report = {
            summary: 'Good', observations: [], strengths: ['Clear', 'Concise'], improvements: ['Impact', 'Details'], suggestedResponse: 'Better answer',
            assessment: { ...assessment(), clarity: { score, evidence: 'I built a project.', action: 'Explain impact.' } }
        };
        generateContent.mockResolvedValue({ text: JSON.stringify(report) });
        expect((await feedback(request(input))).status).toBe(502);
    });
    it('requires assessments in new reports and rejects invented or assistant-only evidence', async () => {
        const report = { summary: 'Good', observations: [], strengths: ['Clear', 'Concise'], improvements: ['Impact', 'Details'], suggestedResponse: 'Better answer' };
        generateContent.mockResolvedValue({ text: JSON.stringify(report) });
        expect((await feedback(request(input))).status).toBe(502);
        generateContent.mockResolvedValue({ text: JSON.stringify({ ...report, assessment: assessment('Invented impact') }) });
        expect((await feedback(request(input))).status).toBe(502);
        generateContent.mockResolvedValue({ text: JSON.stringify({ ...report, assessment: assessment('Tell me more.') }) });
        expect((await feedback(request({ ...input, messages: [...input.messages, { role: 'assistant', content: 'Tell me more.' }] }))).status).toBe(502);
    });
    it('keeps legacy stored reports valid while requiring complete dimensions for new feedback', async () => {
        const report = { summary: 'Good', observations: [], strengths: ['Clear', 'Concise'], improvements: ['Impact', 'Details'], suggestedResponse: 'Better answer' };
        expect(reportSchema.safeParse(report).success).toBe(true);
        const incomplete = { clarity: assessment().clarity, structure: assessment().structure, specificity: assessment().specificity };
        generateContent.mockResolvedValue({ text: JSON.stringify({ ...report, assessment: incomplete }) });
        expect((await feedback(request(input))).status).toBe(502);
    });
    it('accepts exact evidence from any user answer and rejects oversized evidence or actions', async () => {
        const report = { summary: 'Good', observations: [], strengths: ['Clear', 'Concise'], improvements: ['Impact', 'Details'], suggestedResponse: 'Better answer', assessment: assessment('measured the result'), coaching: { ...coaching(), answerReviews: [...coaching().answerReviews, { ...coaching('measured the result', 2).answerReviews[0], question: 'What happened?' }] } };
        const messages = [...input.messages, { role: 'assistant', content: 'What happened?' }, { role: 'user', content: 'I measured the result after shipping.' }];
        generateContent.mockResolvedValue({ text: JSON.stringify(report) });
        expect((await feedback(request({ ...input, messages }))).status).toBe(200);
        for (const item of [
            { ...report.assessment.clarity, evidence: 'a'.repeat(401) },
            { ...report.assessment.clarity, action: 'a'.repeat(501) }
        ]) {
            generateContent.mockResolvedValue({ text: JSON.stringify({ ...report, assessment: { ...report.assessment, clarity: item } }) });
            expect((await feedback(request({ ...input, messages }))).status).toBe(502);
        }
    });
    it('uses a dedicated anchored coach, target role and bounded comparable history', async () => {
        const previousSession = { id: 'previous', ...input, messages: [{role: 'user', content: 'I helped.'}], report: { summary: 'Old' } };
        const report = { summary: 'Good', observations: [], strengths: ['Clear', 'Brief'], improvements: ['Results', 'Ownership'], suggestedResponse: 'I built a project.', assessment: assessment(), coaching: { ...coaching(), progress: { previousSessionId: 'previous', changes: [{ dimension: 'specificity', direction: 'improved', currentEvidence: 'I built a project.', previousEvidence: 'I helped.', explanation: 'More explicit contribution, but neither answer states impact.' }] } } };
        generateContent.mockResolvedValue({text: JSON.stringify(report)});
        expect((await feedback(request({...input, targetRole: 'Software engineer', previousSession: {...previousSession, targetRole:'Software engineer'}}))).status).toBe(200);
        const generated = generateContent.mock.calls[0][0];
        expect(generated.config.systemInstruction).not.toContain('Play');
        expect(generated.config.systemInstruction).toContain('STAR');
        expect(generated.config.systemInstruction).toContain('1 =');
        expect(generated.config.httpOptions.timeout).toBe(60000);
        expect(generated.contents[0].parts[0].text).toContain('Software engineer');
        expect(generated.contents[0].parts[0].text).toContain('I helped.');
        expect((await converse(request({...input, targetRole: 'Software engineer'}))).status).toBe(400);
    });
    it('uses provider-compatible arrays and enums instead of JSON Schema tuples and constants', async () => {
        generateContent.mockResolvedValue({text:JSON.stringify({summary:'Good',observations: [], strengths:['Clear','Brief'],improvements:['Details','Results'],suggestedResponse:'I built a project.',assessment:assessment(),coaching:coaching()})});
        expect((await feedback(request(input))).status).toBe(200);
        const schema = generateContent.mock.calls[0][0].config.responseJsonSchema;
        expect(JSON.stringify(schema)).not.toContain('prefixItems');
        expect(schema).not.toHaveProperty('$schema');
        expect(schema.properties.strengths).toMatchObject({type:'array',items:{type:'string'}});
        for (const keyword of ['maxItems','minItems','maxLength','minLength','minimum','maximum','additionalProperties']) expect(JSON.stringify(schema)).not.toContain(keyword);
        expect(schema.properties.coaching.properties.rubricVersion).toEqual({type:'string',enum:['interview-coach-v1']});
    });
    it('provides exact indexed evidence banks and forbids ellipses or combined quotations', async () => {
        const messages=[{role:'assistant',content:'What did you build?'},{role:'user',content:'I built a project. I measured its outcome. '+ 'x'.repeat(450)}];
        const report={summary:'Good',observations: [], strengths:['Clear','Brief'],improvements:['Details','Results'],suggestedResponse:'I built a project.',assessment:assessment(),coaching:coaching('I built a project.',1)};
        generateContent.mockResolvedValue({text:JSON.stringify(report)});
        expect((await feedback(request({...input,messages}))).status).toBe(200);
        const generation=generateContent.mock.calls[0][0];
        expect(generation.config.systemInstruction).toContain('Never insert ellipses');
        const text=generation.contents[0].parts[0].text;
        const line=text.split('\n').find((value:string)=>value.startsWith('Current evidence bank (exact source snippets): '));
        const bank=JSON.parse(line.slice('Current evidence bank (exact source snippets): '.length));
        expect(bank).toHaveLength(1);
        expect(bank[0].messageIndex).toBe(1);
        expect(bank[0].quotes).toContain('I built a project.');
        expect(bank[0].quotes).toContain('I measured its outcome.');
        for (const quote of bank[0].quotes) {
            expect(quote.length).toBeLessThanOrEqual(400);
            expect(messages[1].content).toContain(quote);
        }
    });
    it('rejects incomparable prior history before a provider call', async () => {
        const report = {summary: 'Old'};
        for (const previousSession of [
            {id: 'old', ...input, difficulty: 'challenging', report},
            {id: 'old', ...input, scenarioId: 'raise', report},
            {id: 'old', ...input, messages: Array.from({length: 41}, () => input.messages[0]), report}
        ]) expect((await feedback(request({...input, previousSession}))).status).toBe(400);
        expect(generateContent).not.toHaveBeenCalled();
    });
    it('requires new coaching, rejects duplicate answer and skill reviews, and bounds the feedback payload', async () => {
        const report = {summary: 'Good', observations: [], strengths: ['Clear','Brief'], improvements: ['Details','Results'], suggestedResponse: 'I built a project.', assessment: assessment()};
        generateContent.mockResolvedValue({text:JSON.stringify(report)});
        expect((await feedback(request(input))).status).toBe(502);
        generateContent.mockResolvedValue({text:JSON.stringify({...report,coaching:{...coaching(),answerReviews:[...coaching().answerReviews,...coaching().answerReviews]}})});
        expect((await feedback(request(input))).status).toBe(502);
        expect((await feedback(request(input,{'content-length':'196609'}))).status).toBe(413);
        expect((await feedback(request({...input,targetRole:'x'.repeat(301)}))).status).toBe(400);
        const previousSession={id:'old',...input,report:{summary:'Old'}};
        const change={dimension:'clarity',direction:'unchanged',currentEvidence:'I built a project.',previousEvidence:'I built a project.',explanation:'The same answer.'};
        generateContent.mockResolvedValue({text:JSON.stringify({...report,coaching:{...coaching(),progress:{previousSessionId:'old',changes:[change,change]}}})});
        expect((await feedback(request({...input,previousSession}))).status).toBe(502);
    });
    it('only accepts matching target roles and normalized matching custom descriptions', async () => {
        const previousSession={id:'old',...input,targetRole:'Designer',report:{summary:'Old'}};
        expect((await feedback(request({...input,targetRole:'Engineer',previousSession}))).status).toBe(400);
        const custom={...input,scenarioId:'custom',customScenario:' Ask for support '};
        const prior={id:'old',...custom,customScenario:'ask  for support',report:{summary:'Old'}};
        const report={summary:'Good',observations: [], strengths:['Clear','Brief'],improvements:['Details','Results'],suggestedResponse:'I built a project.',assessment:assessment(),coaching:{...coaching(),progress:{previousSessionId:'old',changes:[]}}};
        generateContent.mockResolvedValue({text:JSON.stringify(report)});
        expect((await feedback(request({...custom,previousSession:prior}))).status).toBe(200);
        expect((await feedback(request({...custom,previousSession:{...prior,customScenario:'Different topic'}}))).status).toBe(400);
    });
    it('rejects invented answer indexes, current evidence, missing reviews and false progress', async () => {
        const report = {summary: 'Good', observations: [], strengths: ['Clear','Brief'], improvements: ['Details','Results'], suggestedResponse: 'I built a project.', assessment: assessment()};
        const invalid = [
            {...coaching(), answerReviews: [{...coaching().answerReviews[0], messageIndex: 1}]},
            {...coaching(), answerReviews: [{...coaching().answerReviews[0], evidence: 'invented'}]},
            {...coaching(), answerReviews: []},
            {...coaching(), progress: {previousSessionId: 'nonexistent', changes: []}},
            {...coaching(), progress: {changes: [{dimension: 'clarity', direction: 'improved', currentEvidence: 'I built a project.', previousEvidence: 'old', explanation: 'Better'}]}}
        ];
        for (const value of invalid) {
            generateContent.mockResolvedValue({text: JSON.stringify({...report, coaching:value})});
            expect((await feedback(request(input))).status).toBe(502);
        }
    });
    it('rejects invented prior evidence and missing baseline ids', async () => {
        const report = {summary: 'Good', observations: [], strengths: ['Clear','Brief'], improvements: ['Details','Results'], suggestedResponse: 'I built a project.', assessment: assessment()};
        const previousSession = {id:'previous', ...input, messages:[{role:'user',content:'I helped.'}], report: {summary:report.summary}};
        for (const progress of [
            {previousSessionId:'previous',changes:[{dimension:'clarity',direction:'improved',currentEvidence:'I built a project.',previousEvidence:'invented',explanation:'Better'}]},
            {changes:[]}
        ]) {
            generateContent.mockResolvedValue({text:JSON.stringify({...report,coaching:{...coaching(),progress}})});
            expect((await feedback(request({...input, previousSession}))).status).toBe(502);
        }
    });
    it('transcribes WAV NDJSON and surfaces upstream error events', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"type":"text","text":"hello"}\n{"type":"text","text":"world"}\n'));
        const req = () => new Request('http://localhost/api/transcribe', {
            method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav()
        });
        expect(await (await transcribe(req())).json()).toEqual({ text: 'hello world', speech: { source: 'gradium', segments: [{ text: 'hello' }, { text: 'world' }] } });
        expect(String(fetchMock.mock.calls[0][0])).toContain('speech/asr');
        fetchMock.mockResolvedValue(new Response('{"type":"error","message":"secret"}\n'));
        expect((await transcribe(req())).status).toBe(502);
    });
    it('preserves raw filler words and punctuation with provider timing in final ASR', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response([
            {type: 'text', text: ' um,  um ', start_s: 0.5, stream_id: 1},
            {type: 'end_text', stop_s: 1.2, stream_id: 1},
            {type: 'text', text: 'like... I—I', start_s: 3, stream_id: 2},
            {type: 'end_text', stop_s: 4.2, stream_id: 2},
        ].map(item => JSON.stringify(item)).join('\n')));
        const response = await transcribe(new Request('http://localhost/api/transcribe', {
            method: 'POST', headers: {'content-type': 'audio/wav'}, body: wav(),
        }));
        expect(await response.json()).toEqual({text: ' um,  um like... I—I', speech: {source: 'gradium', segments: [
            {text: ' um,  um ', startSeconds: 0.5, endSeconds: 1.2},
            {text: 'like... I—I', startSeconds: 3, endSeconds: 4.2},
        ]}});
    });
    it('sends the scenario keyword boost id to Gradium only when configured', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"type":"text","text":"hello"}\n'));
        const req = (scenario?: string) => new Request('http://localhost/api/transcribe', {
            method: 'POST', headers: { 'content-type': 'audio/wav', ...(scenario ? { 'x-scenario': scenario } : {}) }, body: wav()
        });
        const config = (call: number) => JSON.parse(new URL(String(fetchMock.mock.calls[call][0])).searchParams.get('json_config')!);
        vi.stubEnv('KEYWORD_BOOST_INTERVIEW', 'boost-interview');
        vi.stubEnv('KEYWORD_BOOST_RELATIONSHIP', '');
        await transcribe(req('interview'));
        expect(config(0)).toEqual({ language: 'en', keyword_boost_id: 'boost-interview' });
        await transcribe(req('relationship'));
        expect(config(1)).toEqual({ language: 'en' });
        await transcribe(req('raise'));
        expect(config(2)).toEqual({ language: 'en' });
        await transcribe(req());
        expect(config(3)).toEqual({ language: 'en' });
        vi.unstubAllEnvs();
    });
    it('rejects malformed and long audio', async () => {
        for (const body of [new Uint8Array(45), wav(61)]) {
            const r = await transcribe(new Request('http://localhost/api/transcribe', {
                method: 'POST', headers: { 'content-type': 'audio/wav' }, body
            }));
            expect(r.status).toBe(400);
        }
    });
    it('returns synthesized WAV and rejects bad output', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(wav()));
        const response = await speak(request({ text: 'Hello' }));
        expect(response.headers.get('content-type')).toBe('audio/wav');
        expect((await response.arrayBuffer()).byteLength).toBe(wav().length);
        fetchMock.mockResolvedValue(new Response('not audio'));
        expect((await speak(request({ text: 'Hello' }))).status).toBe(502);
    });
    it('picks the Gradium voice for the tonality, with env overrides', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(wav()));
        const voice = (i: number) => JSON.parse(String(fetchMock.mock.calls[i][1]?.body)).voice_id;
        await speak(request({ text: 'Hello' }));
        expect(voice(0)).toBe('YTpq7expH9539ERJ');
        await speak(request({ text: 'Hello', tonality: 'calm' }));
        expect(voice(1)).toBe('7c5UOKm7AiBgJADg');
        vi.stubEnv('GRADIUM_VOICE_CALM', 'my-studio-voice');
        await speak(request({ text: 'Hello', tonality: 'calm' }));
        expect(voice(2)).toBe('my-studio-voice');
        expect((await speak(request({ text: 'Hello', tonality: 'angry' }))).status).toBe(400);
    });
    it('streams tonality audio and honors an explicitly selected voice', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'audio/pcm' } }));
        const toneResponse = await speak(request({ text: 'Hello', tonality: 'calm', format: 'pcm' }));
        expect(toneResponse.status).toBe(200);
        await toneResponse.arrayBuffer();
        expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).voice_id).toBe('7c5UOKm7AiBgJADg');
        const selectedResponse = await speak(request({ text: 'Hello', tonality: 'calm', voiceId: 'lainey', format: 'pcm' }));
        expect(selectedResponse.status).toBe(200);
        await selectedResponse.arrayBuffer();
        expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).voice_id).toBe('cHM7Jx6qSF32itXw');
    });
    it('finalizes Gradium streaming WAV lengths without accepting them as uploads', async () => {
        const bytes = wav();
        const view = new DataView(bytes.buffer);
        view.setUint32(4, 0xffffffff, true);
        view.setUint32(40, 0xffffffff, true);
        expect(() => validateWav(bytes)).toThrow();
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes));
        const response = await speak(request({ text: 'Hello' }));
        expect(response.status).toBe(200);
        const output = new Uint8Array(await response.arrayBuffer());
        expect(() => validateWav(output)).not.toThrow();
        expect(new DataView(output.buffer).getUint32(4, true)).toBe(output.length - 8);
        expect(new DataView(output.buffer).getUint32(40, true)).toBe(output.length - 44);
        expect(output.subarray(44)).toEqual(bytes.subarray(44));
    });
    it('retains assistant turns and accepts finished feedback', async () => {
        const messages = [{
                role: 'user', content: 'My experience'
            }, {
                role: 'assistant', content: 'Tell me more.'
            }];
        generateContent.mockResolvedValue(turn('Hello'));
        expect((await converse(request({
            ...input, messages
        }))).status).toBe(400);
        generateContent.mockResolvedValue({ text: JSON.stringify({
                summary: 'Good', observations: [], strengths: ['Clear', 'Specific'], improvements: ['Impact', 'Details'], suggestedResponse: 'Better answer', assessment: assessment('My experience'), coaching: coaching('My experience')
            }) });
        expect((await feedback(request({
            ...input, messages
        }))).status).toBe(200);
        const contents = generateContent.mock.calls[0][0].contents;
        expect(contents).toHaveLength(1);
        expect(contents[0].role).toBe('user');
        expect(contents[0].parts[0].text).toContain(JSON.stringify(messages));
        expect(contents[0].parts[0].text).toContain('Completed practice transcript');
        expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain('dialogue data');
    });
    it('does not accept the report request wrapper as user evidence', async () => {
        generateContent.mockResolvedValue({ text: JSON.stringify({
            summary: 'Good', observations: [], strengths: ['Clear', 'Specific'], improvements: ['Impact', 'Details'], suggestedResponse: 'Better answer',
            assessment: assessment('Produce report now.')
        }) });
        expect((await feedback(request(input))).status).toBe(502);
    });
    it('rejects missing custom context, bad JSON and oversized requests', async () => {
        expect((await converse(request({
            ...input, scenarioId: 'custom'
        }))).status).toBe(400);
        expect((await converse(new Request('http://localhost/api/converse', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
        }))).status).toBe(400);
        expect((await converse(request(input, { 'content-length': '70000' }))).status).toBe(413);
        expect((await speak(request({ text: 'a'.repeat(2001) }))).status).toBe(400);
    });
    it('rejects empty or overlong model replies', async () => {
        generateContent.mockResolvedValue({ text: '' });
        expect((await converse(request(input))).status).toBe(502);
        generateContent.mockResolvedValue(turn('a'.repeat(2001)));
        expect((await converse(request(input))).status).toBe(502);
    });
    it('rejects audio MIME mismatch, missing speech and upstream HTTP failures', async () => {
        expect((await transcribe(request({}))).status).toBe(415);
        const req = () => new Request('http://localhost/api/transcribe', {
            method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav()
        });
        const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''));
        expect((await transcribe(req())).status).toBe(422);
        f.mockResolvedValue(new Response('secret', { status: 401 }));
        expect((await transcribe(req())).status).toBe(502);
        delete process.env.GRADIUM_API_KEY;
        expect((await transcribe(req())).status).toBe(503);
    });
    it('returns only provider presence and rate limits', async () => {
        expect(await (await status()).json()).toEqual({
            gemini: true, gradium: true
        });
        generateContent.mockResolvedValue(turn('Hello'));
        for (let i = 0; i < 60; i++)
            await converse(request(input));
        expect((await converse(request(input))).status).toBe(429);
    });
});
