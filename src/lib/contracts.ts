export type ScenarioId = 'interview' | 'raise' | 'relationship' | 'feedback' | 'flatmate' | 'coldcall' | 'bazaar' | 'custom';
export type Difficulty = 'friendly' | 'neutral' | 'challenging';
export type SpeechSegment = { text: string; startSeconds?: number; endSeconds?: number };
export type SpeechMetadata = { source: 'gradium'; segments: SpeechSegment[] };
export type Tonality = 'calm' | 'reassuring' | 'empathic' | 'friendly' | 'confident' | 'excited' | 'neutral';
export type UserTone = 'confident' | 'calm' | 'enthusiastic' | 'neutral' | 'hesitant' | 'nervous' | 'defensive' | 'frustrated' | 'upset';
export type ConversationMessage = {
    role: 'user' | 'assistant';
    content: string;
    speech?: SpeechMetadata;
};
export type SessionInput = {
    scenarioId: ScenarioId;
    difficulty: Difficulty;
    customScenario?: string;
    /** Counterpart voice tonality; 'auto' (default) matches the user's tone. */
    tonality?: Tonality | 'auto';
    messages: ConversationMessage[];
};
export type AssessmentDimension = 'clarity' | 'structure' | 'specificity' | 'relevance';
export type AssessmentItem = { score: number; evidence: string; action: string };
export type Assessment = Record<AssessmentDimension, AssessmentItem>;
export type ConverseReply = {
    reply: string;
    userTone: UserTone;
    tonality: Tonality;
};
export type ObservationTopic = 'main_point' | 'answer_structure' | 'concrete_example' | 'personal_ownership' | 'measurable_outcome' | 'question_focus' | 'tradeoff_reasoning' | 'learning';
export type CoachingObservation = {
    topic: ObservationTopic;
    kind: 'strength' | 'improvement';
    evidence: string;
    detail: string;
    action: string;
};
export type FeedbackReport = {
    /** Optional for reports saved before recurring themes were introduced. */
    observations?: CoachingObservation[];
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
