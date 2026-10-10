import type { ScenarioId } from './contracts';
export const SCENARIOS: {
    id: ScenarioId;
    title: string;
    description: string;
    role: string;
    openingLine: string;
}[] = [
    {
        id: 'interview', title: 'Job interview', description: 'Practise explaining your experience and decisions.', role: 'a hiring interviewer', openingLine: 'Tell me about yourself and what interests you about this role.'
    },
    {
        id: 'raise', title: 'Ask for a raise', description: 'Make a clear case for a salary increase.', role: 'the user’s manager discussing compensation', openingLine: 'You wanted to discuss your compensation. What would you like to propose?'
    },
    {
        id: 'relationship', title: 'Relationship conversation', description: 'Talk through a concern with someone close to you.', role: 'a partner or close friend discussing a concern', openingLine: 'What has been on your mind that you would like us to talk about?'
    },
    {
        id: 'feedback', title: 'Give difficult feedback', description: 'Deliver constructive feedback with clarity and care.', role: 'a colleague receiving constructive feedback', openingLine: 'You said you had some feedback for me. What would you like to discuss?'
    },
    {
        id: 'custom', title: 'Your own scenario', description: 'Describe the conversation you want to practise.', role: 'the counterpart in the user’s practice scenario', openingLine: 'What would you like to discuss with me?'
    }
];
