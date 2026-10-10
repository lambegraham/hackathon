export type ScenarioId = 'interview' | 'raise' | 'relationship' | 'feedback' | 'custom';
export type Difficulty = 'friendly' | 'neutral' | 'challenging';
export type Tonality = 'calm' | 'reassuring' | 'empathic' | 'friendly' | 'confident' | 'excited' | 'neutral';
export type UserTone = 'confident' | 'calm' | 'enthusiastic' | 'neutral' | 'hesitant' | 'nervous' | 'defensive' | 'frustrated' | 'upset';
export type ConversationMessage = {
    role: 'user' | 'assistant';
    content: string;
};
export type SessionInput = {
    scenarioId: ScenarioId;
    difficulty: Difficulty;
    customScenario?: string;
    /** Counterpart voice tonality; 'auto' (default) matches the user's tone. */
    tonality?: Tonality | 'auto';
    messages: ConversationMessage[];
};
export type ConverseReply = {
    reply: string;
    userTone: UserTone;
    tonality: Tonality;
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
