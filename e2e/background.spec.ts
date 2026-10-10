import { expect, test, type Page } from '@playwright/test';

const items = [
  { kind: 'canDo', text: 'Led a team of 4 volunteers', origin: 'stated', evidence: 'Led a team of 4 volunteers to organise a hackathon' },
  { kind: 'implicit', text: 'Event coordination', origin: 'inferred', evidence: 'organise a hackathon with 120 participants' },
  { kind: 'improve', text: 'Not shown in your documents: measurable results', origin: 'stated', evidence: 'Tutored first-year students' },
];

async function setup(page: Page) {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: false } }));
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'What was the result?', userTone: 'neutral', tonality: 'friendly' } }));
  await page.goto('/');
  await page.getByRole('button', { name: /Got credits/ }).click({ timeout: 1500 }).catch(() => {});
}

test('uploads a document, edits the profile and only sends ticked items to the live coach', async ({ page }) => {
  await setup(page);
  let backgroundUrl = '';
  await page.route('**/api/background**', route => { backgroundUrl = route.request().url(); return route.fulfill({ json: { items, dropped: 1 } }); });
  const hints: Record<string, unknown>[] = [];
  await page.route('**/api/live-hint', route => {
    hints.push(route.request().postDataJSON());
    return route.fulfill({ json: { comment: hints.length === 1 ? { kind: 'mention', text: 'Good moment to mention: you led 4 volunteers.', keywords: ['team of 4'], itemId: 'x' } : null } });
  });

  await page.getByLabel('Upload CV or notes').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await expect(page.getByText('cv.pdf: 3 items (1 unverifiable lines left out).')).toBeVisible();
  expect(backgroundUrl).not.toContain('personal=1');
  await expect(page.getByLabel('Use in coaching: Led a team of 4 volunteers')).toBeChecked();
  await expect(page.getByLabel('Use in coaching: Event coordination')).not.toBeChecked();
  await expect(page.getByLabel('Use in coaching: Not shown in your documents: measurable results')).not.toBeChecked();
  await expect(page.getByText('Inferred', { exact: true })).toBeVisible();

  await page.getByLabel('Add your own line').fill('Speaks three languages');
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByLabel('Use in coaching: Speaks three languages')).toBeChecked();
  await page.getByPlaceholder(/Paste the job description/).fill('Backend engineer, team lead track');

  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Good moment to mention: you led 4 volunteers.' })).toBeVisible();
  await expect(page.getByLabel('Keywords you could use')).toContainText('team of 4');
  expect(hints[0]).toMatchObject({ scenarioId: 'interview', target: 'Backend engineer, team lead track' });
  const sent = (hints[0].items as { text: string }[]).map(item => item.text);
  expect(sent).toEqual(['Led a team of 4 volunteers', 'Speaks three languages']);
  expect(JSON.stringify(hints[0])).not.toContain('evidence');

  await page.getByRole('button', { name: 'Dismiss comment' }).click();
  await expect(page.getByLabel('Keywords you could use')).toHaveCount(0);

  await page.getByLabel('Your answer', { exact: true }).fill('I led a team.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('What was the result?').first()).toBeVisible();
  await expect.poll(() => hints.length).toBe(2);
  expect(hints[1].usedItemIds).toEqual(['x']);
});

test('no profile means no live-hint requests and the conversation still works', async ({ page }) => {
  await setup(page);
  let calls = 0;
  await page.route('**/api/live-hint', route => { calls++; return route.fulfill({ json: { comment: null } }); });
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer', { exact: true }).fill('Hello there.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('What was the result?').first()).toBeVisible();
  expect(calls).toBe(0);
});

test('failed uploads and failing hints never block practice', async ({ page }) => {
  await setup(page);
  await page.route('**/api/background**', route => route.fulfill({ status: 422, json: { error: 'No readable text found. Scanned PDFs are not supported: paste the text instead.' } }));
  await page.route('**/api/live-hint', route => route.fulfill({ status: 502, json: { error: 'x' } }));
  await page.getByLabel('Upload CV or notes').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
  await expect(page.getByText(/Scanned PDFs are not supported/)).toBeVisible();
  await page.getByLabel('Upload CV or notes').setInputFiles({ name: 'cv.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.getByText(/Use a PDF, .txt or .md file/)).toBeVisible();
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer', { exact: true }).fill('Hello there.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('What was the result?').first()).toBeVisible();
  await expect(page.locator('.call-alert')).toHaveCount(0);
});

test('live comments can be turned off', async ({ page }) => {
  await setup(page);
  await page.route('**/api/background**', route => route.fulfill({ json: { items, dropped: 0 } }));
  let calls = 0;
  await page.route('**/api/live-hint', route => { calls++; return route.fulfill({ json: { comment: null } }); });
  await page.getByLabel('Upload CV or notes').setInputFiles({ name: 'cv.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByText('cv.txt: 3 items.')).toBeVisible();
  await page.getByLabel('Live comments', { exact: true }).selectOption('off');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer', { exact: true }).fill('Hello there.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('What was the result?').first()).toBeVisible();
  expect(calls).toBe(0);
});
