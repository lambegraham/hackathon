import { expect, test, type Page } from '@playwright/test';

async function openProfile(page: Page, count = 3) {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: false } }));
  await page.addInitScript(({ count }) => {
    const sessions = Array.from({ length: count }, (_, index) => ({
      id: `chart-${index}`, completedAt: `2026-10-0${index + 1}T12:00:00.000Z`,
      scenarioId: 'interview', difficulty: 'neutral', durationSeconds: 60,
      messages: [{ role: 'user', content: `Example ${index + 1}` }],
      report: {
        summary: `Conversation ${index + 1}`, strengths: ['Clear start.', 'Relevant example.'],
        improvements: ['Add detail.', 'Describe impact.'], suggestedResponse: 'I delivered a useful tool.',
        assessment: Object.fromEntries(['clarity', 'structure', 'specificity', 'relevance'].map((key, skill) => [key, {
          score: Math.min(5, index + skill + 1), evidence: `${key} evidence ${index + 1}`, action: `${key} next action ${index + 1}`,
        }])),
      },
    }));
    localStorage.setItem('rehearsal.profile.v1', JSON.stringify({ version: 1, sessions }));
  }, { count });
  await page.goto('/');
  await page.getByRole('button', { name: 'My profile' }).click();
}

test('progress filters and keyboard session selection expose evidence and exact values', async ({ page }) => {
  await openProfile(page);
  const chart = page.locator('.trend-chart');
  await expect(chart.getByRole('button', { name: 'All skills', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await chart.getByRole('button', { name: 'Clarity', exact: true }).click();
  await expect(chart.getByRole('button', { name: 'Clarity', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const first = chart.getByRole('button', { name: /Select conversation 1:/ });
  await first.focus();
  await page.keyboard.press('Enter');
  const detail = chart.getByRole('region', { name: 'Selected conversation' });
  await expect(detail).toContainText('clarity evidence 1');
  await expect(detail).toContainText('clarity next action 1');
  await expect(detail).toContainText('Clarity 1/5');
  await expect(detail).toContainText('Relevance 4/5');
  await expect(detail.locator('time')).toHaveAttribute('datetime', '2026-10-01T12:00:00.000Z');
  await expect(detail).not.toContainText('structure evidence 1');
  await chart.getByRole('button', { name: 'All skills', exact: true }).click();
  await expect(detail).toContainText('structure evidence 1');
  await chart.getByText('View progress values', { exact: true }).click();
  await expect(chart.getByRole('table')).toContainText('Clarity /5');
  await expect(chart.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await chart.getByRole('button', { name: /Select conversation 3:/ }).click();
  await expect(detail).toContainText('clarity evidence 3');
  await page.getByLabel('Progress for').selectOption('chart-1');
  await expect(chart.getByRole('button', { name: /Select conversation/ })).toHaveCount(2);
  await expect(detail).toContainText('clarity evidence 2');
  await expect(detail).not.toContainText('clarity evidence 3');
});

test('mobile progress and score charts fit with reduced motion and preserve score tables', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openProfile(page);
  await expect(page.getByRole('button', { name: 'Specificity', exact: true })).toBeVisible();
  expect(await page.locator('.growth-line').first().evaluate(line => getComputedStyle(line).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open report' }).first().click();
  await page.locator('summary').filter({ hasText: 'Progress over time' }).click();
  const scores = page.locator('.score-chart');
  await expect(scores.getByRole('img')).toBeVisible();
  await expect(scores.getByRole('table')).toContainText('Last time');
  await expect(scores.getByRole('table')).toContainText('3/5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('one scored conversation invites another practice without inventing a trend', async ({ page }) => {
  await openProfile(page, 1);
  await expect(page.getByText('Complete another matching conversation to see your progress over time.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'All skills', exact: true })).toHaveCount(0);
});
