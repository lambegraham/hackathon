import { expect, test, type Page } from '@playwright/test';

function report(scores = [3, 4, 2, 4]) {
  return { summary: 'A clear start with room for more detail.', strengths: ['You stated your experience.', 'You stayed on topic.'], improvements: ['Add a concrete result.', 'Explain your contribution.'], suggestedResponse: 'I built a tool that saved ten hours.', assessment: Object.fromEntries(['clarity', 'structure', 'specificity', 'relevance'].map((key, index) => [key, { score: scores[index], evidence: 'I built a tool.', action: 'Add a concrete result.' }])) };
}
async function setup(page: Page) {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: false } }));
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'What was the result?' } }));
}
async function complete(page: Page) {
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer').fill('I built a tool.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await page.getByRole('button', { name: 'End session & get feedback' }).click();
  await expect(page.getByText('Saved to your local profile', { exact: true })).toBeVisible();
}
test('reports save, survive reload and compare matching sessions', async ({ page }) => {
  await setup(page);
  let count = 0;
  await page.route('**/api/feedback', route => route.fulfill({ json: report(count++ ? [4, 3, 3, 4] : undefined) }));
  await page.goto('/'); await complete(page);
  await expect(page.getByText('No scored comparison is available yet for this scenario and difficulty.')).toBeVisible();
  await page.getByRole('button', { name: 'Practise another conversation' }).click();
  await complete(page);
  await expect(page.getByText('Improved +1', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Declined −1', { exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('heading', { name: 'Your local profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open report' })).toHaveCount(2);
  await page.getByRole('button', { name: 'Open report' }).first().click();
  await expect(page.getByText('A clear start with room for more detail.')).toBeVisible();
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.getByRole('button', { name: 'Delete session' }).first().click();
  await expect(page.getByRole('button', { name: 'Open report' })).toHaveCount(1);
});
test('storage failure keeps report usable and retry does not duplicate', async ({ page }) => {
  await setup(page); await page.route('**/api/feedback', route => route.fulfill({ json: report() }));
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (!(window as unknown as { allowSave?: boolean }).allowSave) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer').fill('I built a tool.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await page.getByRole('button', { name: 'End session & get feedback' }).click();
  await expect(page.getByText('A clear start with room for more detail.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry save' })).toBeVisible();
  await page.evaluate(() => Object.assign(window, { allowSave: true }));
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByText('Saved to your local profile', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('button', { name: 'Open report' })).toHaveCount(1);
});
test('mobile report graphs fit the screen and clear history works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page); await page.route('**/api/feedback', route => route.fulfill({ json: report() }));
  await page.goto('/'); await complete(page);
  await expect(page.getByRole('img', { name: 'Conversation skill scores, scale 1 to 5' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'My profile' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear history' }).click();
  await expect(page.getByText('Your next conversation starts the story.')).toBeVisible();
});
test('unreadable profile can be cleared without overwriting it silently', async ({ page }) => {
  await setup(page);
  await page.route('**/api/feedback', route => route.fulfill({ json: report() }));
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('rehearsal.profile.v1', '{broken'));
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'unreadable' })).toContainText('unreadable');
  expect(await page.evaluate(() => localStorage.getItem('rehearsal.profile.v1'))).toBe('{broken');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Clear history' }).click();
  await page.getByRole('button', { name: 'Back to practice' }).click();
  await complete(page);
});
test('reset while feedback is pending prevents stale reports and profile saves', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/feedback', async route => {
    await pending;
    await route.fulfill({ json: report() }).catch(() => undefined);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer').fill('I built a tool.');
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await page.getByRole('button', { name: 'End session & get feedback' }).click();
  await expect(page.getByRole('button', { name: 'End session & get feedback' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset session' }).click();
  release();
  await page.getByRole('button', { name: 'Start practising' }).click();
  await expect(page.getByText('A clear start with room for more detail.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset session' }).click();
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByText('Your next conversation starts the story.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open report' })).toHaveCount(0);
});


test('coach receives target role and previous matching session after reload', async ({page}) => {
  await setup(page);
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/feedback', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({json:report()});
  });
  await page.goto('/');
  await page.getByLabel('Target role').fill('Backend Engineer');
  await complete(page);
  expect(requests[0].targetRole).toBe('Backend Engineer');
  expect(requests[0].previousSession).toBeUndefined();
  await page.reload();
  await page.getByLabel('Target role').fill('Backend Engineer');
  await complete(page);
  expect(requests[1].previousSession).toMatchObject({scenarioId:'interview',targetRole:'Backend Engineer'});
  const sessions = await page.evaluate(() => JSON.parse(localStorage.getItem('rehearsal.profile.v1')!).sessions);
  expect(sessions).toHaveLength(2);
  expect(sessions[1].targetRole).toBe('Backend Engineer');
});
