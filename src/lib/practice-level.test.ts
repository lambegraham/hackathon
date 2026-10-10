import { describe, expect, it } from 'vitest';
import { difficultyLabel, skillLevelLabel } from './practice-level';

describe('practice level labels', () => {
  it('maps the existing difficulty values to Easy, Intermediate, and Hard', () => {
    expect(difficultyLabel('friendly')).toBe('Easy');
    expect(difficultyLabel('neutral')).toBe('Intermediate');
    expect(difficultyLabel('challenging')).toBe('Hard');
  });

  it('names a skill score as a level from 1 to 5', () => {
    expect(skillLevelLabel(1)).toBe('Level 1 of 5');
    expect(skillLevelLabel(3)).toBe('Level 3 of 5');
    expect(skillLevelLabel(5)).toBe('Level 5 of 5');
  });
});
