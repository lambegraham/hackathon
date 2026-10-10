import { expect, test } from '@playwright/test';

test('garden wardrobe, profile and feedback share a responsive visual style', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: true } }));
  await page.addInitScript(() => {
    const answer = 'I built a tool that saved ten hours each month.';
    localStorage.setItem('rehearsal.profile.v1', JSON.stringify({ version: 1, sessions: [{
      id: 'garden-review', completedAt: '2026-10-10T12:00:00.000Z', scenarioId: 'interview', difficulty: 'neutral', durationSeconds: 90,
      messages: [{ role: 'assistant', content: 'What did you build?' }, { role: 'user', content: answer }],
      report: { summary: 'A clear example with measurable impact.', strengths: ['You explain your contribution.', 'You quantify impact.'], improvements: ['Explain the trade-off.', 'Name an alternative.'], suggestedResponse: answer,
        assessment: Object.fromEntries(['clarity', 'structure', 'specificity', 'relevance'].map(key => [key, { score: 3, evidence: answer, action: 'Explain the trade-off.' }])),
        coaching: { rubricVersion: 'interview-coach-v1', priority: 'Explain your decision.', drill: 'Rehearse with one alternative.', nextGoal: 'Name an alternative and why.', progress: { changes: [] }, answerReviews: [{ messageIndex: 1, question: 'What did you build?', scores: { clarity: 3, structure: 3, specificity: 3, relevance: 3 }, evidence: answer, feedback: 'Explain the trade-off.' }] },
      },
    }] }));
  });
  await page.goto('/');
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator('.call-frame .flower')).toBeVisible();
  await expect(page.locator('.aura-visualizer-canvas')).toHaveCount(0);
  await page.getByLabel('Scenario').selectOption('relationship');
  await expect(page.locator('.flower')).toHaveAttribute('data-outfit', 'relationship');
  await page.screenshot({ path: '/private/tmp/garden-wardrobe-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeVisible();
  await page.screenshot({ path: '/private/tmp/garden-wardrobe-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'My profile' }).click();
  await expect(page.getByRole('heading', { name: 'Your local profile' })).toBeVisible();
  expect(await page.locator('.profile-dashboard').evaluate(el => getComputedStyle(el).color)).toBe('rgb(29, 42, 20)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/garden-profile-mobile.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '/private/tmp/garden-profile-desktop.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Open report' }).click();
  await expect(page.getByRole('heading', { name: 'Your conversation report' })).toBeVisible();
  expect(await page.locator('.session-report .primary').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(62, 92, 65)');
  await expect(page.locator('.score-chart')).not.toBeVisible();
  await page.screenshot({ path: '/private/tmp/garden-report-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/garden-report-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Practise another conversation' }).click();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeVisible();
});
