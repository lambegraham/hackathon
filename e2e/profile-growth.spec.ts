import { expect, test, type Page } from '@playwright/test';

const answer = 'I built a tool that saved ten hours each month.';
const report = {
  summary: 'You show concrete impact. Explain how you made your decision next.',
  strengths: ['You name your own contribution.', 'You quantify the result.'],
  improvements: ['Explain the trade-off.', 'Describe the alternative you considered.'],
  suggestedResponse: answer,
  assessment: Object.fromEntries(['clarity', 'structure', 'specificity', 'relevance'].map(key => [key, { score: 3, evidence: answer, action: 'Explain the trade-off.' }])),
  observations: [
    { topic: 'measurable_outcome', kind: 'strength', evidence: answer, detail: 'The ten-hour result makes the impact tangible.', action: 'Keep explaining outcomes using real measurements.' },
    { topic: 'tradeoff_reasoning', kind: 'improvement', evidence: answer, detail: 'You describe the tool but omit the alternative you considered.', action: 'Name one alternative and explain why you rejected it.' }
  ],
  coaching: {
    rubricVersion: 'interview-coach-v1',
    answerReviews: [{ messageIndex: 1, question: 'What did you build?', scores: { clarity: 3, structure: 3, specificity: 3, relevance: 3 }, evidence: answer, feedback: 'Explain the trade-off.' }],
    priority: 'Explain your decision.', drill: 'Rehearse with one alternative.', nextGoal: 'Name one rejected alternative and why.', progress: { changes: [] }
  }
};

async function providers(page: Page) {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: false } }));
  await page.route('**/api/converse', route => route.fulfill({ json: { reply: 'What did you learn?' } }));
  await page.route('**/api/feedback', route => route.fulfill({ json: report }));
}
async function complete(page: Page) {
  await page.getByRole('button', { name: 'Start practising' }).click();
  await page.getByLabel('Your answer').fill(answer);
  await page.getByRole('button', { name: 'Send answer' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await page.getByRole('button', { name: 'End session & get feedback' }).click();
  await expect(page.getByText('Saved to your local profile', { exact: true })).toBeVisible();
}

test('repeated observations link to evidence and plans persist across reload', async ({ page }) => {
  await providers(page);
  await page.goto('/');
  await complete(page);
  await page.locator('summary').filter({ hasText: 'Progress over time' }).click();
  await expect(page.getByText('No recurring patterns yet.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'I completed this practice drill' }).check();
  await page.getByRole('button', { name: 'Practise another conversation' }).click();
  await complete(page);
  await page.locator('summary').filter({ hasText: 'Progress over time' }).click();
  await expect(page.getByText('Observed in 2 of 2 reviewed sessions').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keep building on this' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A pattern to work on' })).toBeVisible();
  await page.getByText('See the evidence (2 sessions)').first().click();
  await expect(page.getByRole('button', { name: 'Open supporting report' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open supporting report' }).first().click();
  await expect(page.getByRole('checkbox', { name: 'I completed this practice drill' })).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByText('1 of 2 practice drills completed')).toBeVisible();
  await page.getByRole('button', { name: 'Open report' }).last().click();
  await expect(page.getByRole('checkbox', { name: 'I completed this practice drill' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'I completed this practice drill' }).uncheck();
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByText('0 of 2 practice drills completed')).toBeVisible();
  await expect(page.locator('.intro')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/growth-profile-mobile.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'test-results/growth-profile-desktop.png', fullPage: true, animations: 'disabled' });
});

test('plan write failure does not mark a drill completed', async ({ page }) => {
  await providers(page);
  await page.goto('/');
  await complete(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage full'); }; });
  await page.getByRole('checkbox', { name: 'I completed this practice drill' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'could not be saved' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'I completed this practice drill' })).not.toBeChecked();
});
