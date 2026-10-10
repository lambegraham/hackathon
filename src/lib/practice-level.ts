import type { Difficulty } from './contracts';

const DIFFICULTY_LABEL = {
  friendly: 'Easy',
  neutral: 'Intermediate',
  challenging: 'Hard'
} as const satisfies Record<Difficulty, string>;

export function difficultyLabel(difficulty: Difficulty): (typeof DIFFICULTY_LABEL)[Difficulty] {
  return DIFFICULTY_LABEL[difficulty];
}

export function skillLevelLabel(score: number): string {
  return `Level ${score} of 5`;
}
