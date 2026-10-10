import { expect, test, type Page } from '@playwright/test';

const items = [
  { kind: 'canDo', text: 'Built a Django app used by 30 students', origin: 'stated', evidence: 'Built a Django app used by 30 students' },
  { kind: 'softSkill', text: 'Teaching assistant for 25 students', origin: 'stated', evidence: 'Run weekly lab sessions for 25 first-year students' },
];
const GOAL = 'Software engineering intern: Python/Django, testing, explaining work to clinic staff.';

async function setup(page: Page) {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: false } }));
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'How do you test your code?', userTone: 'neutral', tonality: 'friendly' } }));
  await page.route('**/api/live-hint', route => route.fulfill({ json: { comment: null } }));
  await page.route('**/api/background**', route => route.fulfill({ json: { items, dropped: 0 } }));
  await page.goto('/');
  await page.getByLabel('Upload CV or notes').setInputFiles({ name: 'cv.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(page.getByText('cv.txt: 2 items.')).toBeVisible();
  await page.getByPlaceholder(/Paste the job description/).fill(GOAL);
}

test('matches the profile to the goal, then tracks coverage and the next best point', async ({ page }) => {
  await setup(page);
  const planBodies: Record<string, unknown>[] = [];
  await page.route('**/api/goal-plan', route => {
    const body = route.request().postDataJSON(); planBodies.push(body);
    const [django, teaching] = body.items as { id: string }[];
    return route.fulfill({ json: { points: [
      { id: 'p1', label: 'Python and Django experience', why: 'Core stack', itemIds: [django.id] },
      { id: 'p2', label: 'Testing and code review', why: 'Daily work', itemIds: [] },
      { id: 'p3', label: 'Explaining to clinic staff', why: 'Users are not technical', itemIds: [teaching.id] },
    ] } });
  });
  const checks: Record<string, unknown>[] = [];
  await page.route('**/api/goal-check', route => { checks.push(route.request().postDataJSON()); return route.fulfill({ json: { covered: checks.length === 1 ? [{ pointId: 'p1', quote: 'I built a Django app' }] : [] } }); });

  await page.getByRole('button', { name: 'Match my profile to this goal' }).click();
  await expect(page.getByText('2/3 backed by your profile')).toBeVisible();
  await expect(page.getByText('Backed by: Built a Django app used by 30 students')).toBeVisible();
  await expect(page.getByText('Gap: nothing in your profile yet. Prepare an example.')).toBeVisible();
  expect(planBodies[0]).toMatchObject({ target: GOAL, scenarioId: 'interview' });

  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.getByText('0/3 covered')).toBeVisible();
  expect(planBodies).toHaveLength(1);
  await expect(page.locator('.goal-next')).toContainText('Python and Django experience');

  await page.getByLabel('Your answer', { exact: true }).fill('I built a Django app that 30 students use.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('1/3 covered')).toBeVisible();
  await expect(page.getByText('You said: “I built a Django app”')).toBeVisible();
  await expect(page.locator('.goal-next')).toContainText('Explaining to clinic staff');
  expect(checks[0]).toMatchObject({ answer: 'I built a Django app that 30 students use.', coveredIds: [] });

  await page.getByLabel('Your answer', { exact: true }).fill('I write unit tests.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect.poll(() => checks.length).toBe(2);
  expect(checks[1].coveredIds).toEqual(['p1']);
  await expect(page.getByText('1/3 covered')).toBeVisible();
});

test('plans automatically at start, retries once, and never blocks the conversation', async ({ page }) => {
  await setup(page);
  let calls = 0;
  await page.route('**/api/goal-plan', route => { calls++; return route.fulfill({ status: 502, json: { error: 'Could not build the goal checklist. Try again.' } }); });
  await page.route('**/api/goal-check', route => route.fulfill({ status: 500, json: { error: 'x' } }));
  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.getByText(/Goal checklist unavailable/)).toBeVisible();
  expect(calls).toBe(2);
  await page.getByLabel('Your answer', { exact: true }).fill('Hello there.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByText('How do you test your code?').first()).toBeVisible();
  await expect(page.locator('.call-alert')).toHaveCount(0);
  await page.unroute('**/api/goal-plan');
  await page.route('**/api/goal-plan', route => route.fulfill({ json: { points: [{ id: 'p1', label: 'Testing', why: '', itemIds: [] }, { id: 'p2', label: 'Django', why: '', itemIds: [] }] } }));
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('0/2 covered')).toBeVisible();
});

test('changing the goal after matching asks to match again', async ({ page }) => {
  await setup(page);
  await page.route('**/api/goal-plan', route => route.fulfill({ json: { points: [{ id: 'p1', label: 'Testing', why: '', itemIds: [] }, { id: 'p2', label: 'Django', why: '', itemIds: [] }] } }));
  await page.getByRole('button', { name: 'Match my profile to this goal' }).click();
  await expect(page.getByText('0/2 backed by your profile')).toBeVisible();
  await page.getByPlaceholder(/Paste the job description/).fill(`${GOAL} Also SQL.`);
  await expect(page.getByText('Your goal or profile changed.')).toBeVisible();
});
