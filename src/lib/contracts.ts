export type ScenarioId = 'interview' | 'raise' | 'relationship' | 'feedback' | 'custom';
export type Difficulty = 'friendly' | 'neutral' | 'challenging';
export type ConversationMessage = {
    role: 'user' | 'assistant';
    content: string;
};
export type SessionInput = {
    scenarioId: ScenarioId;
    difficulty: Difficulty;
    customScenario?: string;
    messages: ConversationMessage[];
};
export type FeedbackReport = {
    summary: string;
    strengths: [
        string,
        string
    ];
    improvements: [
        string,
        string
    ];
    suggestedResponse: string;
};
