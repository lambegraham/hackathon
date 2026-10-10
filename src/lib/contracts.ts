export type ScenarioId = 'interview' | 'raise' | 'relationship' | 'feedback' | 'custom';
export type Difficulty = 'friendly' | 'neutral' | 'challenging';
export type SpeechSegment = { text: string; startSeconds?: number; endSeconds?: number };
export type SpeechMetadata = { source: 'gradium'; segments: SpeechSegment[] };
export type ConversationMessage = {
    role: 'user' | 'assistant';
    content: string;
    speech?: SpeechMetadata;
};
export type SessionInput = {
    scenarioId: ScenarioId;
    difficulty: Difficulty;
    customScenario?: string;
    messages: ConversationMessage[];
};
export type AssessmentDimension = 'clarity' | 'structure' | 'specificity' | 'relevance';
export type AssessmentItem = { score: number; evidence: string; action: string };
export type Assessment = Record<AssessmentDimension, AssessmentItem>;
export type FeedbackReport = {
    coaching?: CoachingReport;
    assessment?: Assessment;
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
export type AnswerReview = {
    messageIndex: number;
    question: string;
    scores: Record<AssessmentDimension, number | null>;
    evidence: string;
    feedback: string;
};
export type CoachingReport = {
    rubricVersion: 'interview-coach-v1';
    answerReviews: AnswerReview[];
    priority: string;
    drill: string;
    nextGoal: string;
    progress: {
        previousSessionId?: string;
        changes: { dimension: AssessmentDimension; direction: 'improved' | 'declined' | 'unchanged'; currentEvidence: string; previousEvidence: string; explanation: string }[];
    };
};
export type FeedbackInput = SessionInput & {
    targetRole?: string;
    previousSession?: SessionInput & {
        id: string;
        targetRole?: string;
        report: { summary: string; assessment?: Assessment; nextGoal?: string };
    };
};
