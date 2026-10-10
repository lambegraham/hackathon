import { expect, test } from '@playwright/test';

const dimensions = ['clarity', 'structure', 'specificity', 'relevance'];
const messages = [{ role: 'assistant', content: 'What did you build?' }, { role: 'user', content: 'I built a tool.' }];
function savedSession(id: string, date: string, rich: boolean) {
  return { id, completedAt: date, scenarioId: 'interview', difficulty: 'neutral', durationSeconds: 60, messages,
    report: { summary: 'Make your contribution measurable.', strengths: ['Clear ownership.', 'On topic.'], improvements: ['Add a result.', 'Describe the problem.'], suggestedResponse: 'I built a tool that [measurable result].',
      assessment: Object.fromEntries(dimensions.map(key => [key, { score: 3, evidence: 'I built a tool.', action: 'Add the result.' }])),
      ...(rich ? { coaching: { rubricVersion: 'interview-coach-v1', answerReviews: [{ messageIndex: 1, question: 'What did you build?', scores: { clarity: 3, structure: 2, specificity: null, relevance: 4 }, evidence: 'I built a tool.', feedback: 'State who benefited and the outcome.' }], priority: 'Make your contribution measurable.', drill: 'Repeat the answer with one result.', nextGoal: 'Include a measurable result in the next answer.', progress: { previousSessionId: 'old', changes: [{ dimension: 'clarity', direction: 'unchanged', currentEvidence: 'I built a tool.', previousEvidence: 'I built a tool.', explanation: 'Both answers state your ownership clearly.' }] } } } : {}) }
  };
}
test('rich coaching exposes evidence, unscored heatmap cells and skill trends', async ({ page }) => {
  await page.route('**/api/status', route => route.fulfill({ json: { gemini: true, gradium: false } }));
  await page.goto('/');
  await page.evaluate(sessions => localStorage.setItem('rehearsal.profile.v1', JSON.stringify({ version: 1, sessions })), [savedSession('old', '2026-10-09T10:00:00.000Z', false), savedSession('new', '2026-10-10T10:00:00.000Z', true)]);
  await page.getByRole('button', { name: 'My profile' }).click();
  await page.getByRole('button', { name: 'Open report' }).first().click();
  await expect(page.getByRole('heading', { name: 'Your answers, at a glance' })).toBeVisible();
  await expect(page.getByText('Not enough evidence', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Answer 1: What did you build/ }).click();
  await expect(page.getByText('State who benefited and the outcome.')).toBeVisible();
  await page.locator('.progress-change summary').click();
  await expect(page.getByText('Both answers state your ownership clearly.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Four coaching skills over comparable conversations, scale 1 to 5' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/interview-coach-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Practise this answer' }).click();
  await expect(page.getByRole('button', { name: 'Start practising' })).toBeVisible();
  await expect(page.getByLabel('What would you like to practise?')).toHaveValue(/What did you build\?/);
  await expect(page.getByLabel('What would you like to practise?')).toHaveValue(/Include a measurable result/);
  await expect(page.getByLabel('Your answer')).toHaveValue('I built a tool.');
  await page.getByRole('button', {name:'Start practising'}).click();
  await expect(page.locator('.message-assistant').first()).toContainText('What did you build?');
});
