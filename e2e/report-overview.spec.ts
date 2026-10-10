import { expect, test } from '@playwright/test';

test('report starts with a concise overview and reveals detail on demand', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: true } }));
  await page.addInitScript(() => {
    const answer = 'I built a tool that saved ten hours each month.';
    localStorage.setItem('rehearsal.profile.v1', JSON.stringify({ version: 1, sessions: [{
      id: 'overview', completedAt: '2026-10-10T12:00:00.000Z', scenarioId: 'interview', difficulty: 'neutral', durationSeconds: 90,
      messages: [{ role: 'assistant', content: 'What did you build?' }, { role: 'user', content: answer }],
      report: {
        summary: 'A clear example with measurable impact.', strengths: ['You explain your contribution.', 'You quantify impact.'], improvements: ['Explain the trade-off.', 'Name an alternative.'], suggestedResponse: 'I chose the simpler design to deliver earlier.',
        assessment: Object.fromEntries(['clarity', 'structure', 'specificity', 'relevance'].map(key => [key, { score: 3, evidence: answer, action: 'Explain the trade-off.' }])),
        coaching: { rubricVersion: 'interview-coach-v1', priority: 'Explain your decision.', drill: 'Rehearse with one alternative.', nextGoal: 'Name one rejected alternative and why.', progress: { changes: [] }, answerReviews: [{ messageIndex: 1, question: 'What did you build?', scores: { clarity: 3, structure: 3, specificity: 3, relevance: 3 }, evidence: answer, feedback: 'Explain the trade-off.' }] },
      },
    }] }));
  });
  await page.goto('/');
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 10000 });
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.getByRole('button', { name: 'Open report' }).click();
  await expect(page.getByText('A clear example with measurable impact.', { exact: true })).toBeVisible();
  await expect(page.getByText('Explain your decision.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your answers, at a glance' })).not.toBeVisible();
  await expect(page.locator('.score-chart')).not.toBeVisible();
  await expect(page.locator('.report-overview-score')).toHaveCount(4);
  const progress = page.locator('summary').filter({ hasText: 'Progress over time' });
  await progress.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.score-chart')).toBeVisible();
  await progress.click();
  await page.locator('summary').filter({ hasText: 'Answer feedback' }).click();
  await page.getByRole('button', { name: 'Answer 1: What did you build?' }).click();
  await expect(page.getByRole('button', { name: 'Practise this answer' })).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Answer feedback' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/report-overview-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: '/private/tmp/report-overview-desktop.png', fullPage: true });
});
