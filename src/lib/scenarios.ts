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
        id: 'relationship', title: 'Relationship breakup', description: 'End a relationship honestly and with care.', role: 'the user’s partner, who senses something is wrong and is about to hear the user wants to break up', openingLine: 'You said we needed to talk. What’s going on?'
    },
    {
        id: 'feedback', title: 'Give difficult feedback', description: 'Deliver constructive feedback with clarity and care.', role: 'a colleague receiving constructive feedback', openingLine: 'You said you had some feedback for me. What would you like to discuss?'
    },
    {
        id: 'flatmate', title: 'Flatmate talk', description: 'Sort out cleaning, noise or bills with your flatmate.', role: 'the user’s flatmate, a little defensive about a household issue such as cleaning, noise or bills', openingLine: 'Hey, you wanted to chat about something in the flat?'
    },
    {
        id: 'coldcall', title: 'Cold call', description: 'Pitch to someone who didn’t expect your call.', role: 'a busy prospect who did not expect this sales call and is ready to hang up', openingLine: 'Hello? Who is this?'
    },
    {
        id: 'bazaar', title: 'Bazaar negotiation', description: 'Hold your price while a buyer haggles at your stall.', role: 'a shrewd buyer haggling hard over a handmade lamp at the user’s market stall', openingLine: 'This lamp is nice, but 80 is far too much. I’ll give you 30.'
    },
    {
        id: 'custom', title: 'Your own scenario', description: 'Describe the conversation you want to practise.', role: 'the counterpart in the user’s practice scenario', openingLine: 'What would you like to discuss with me?'
    }
];
