// What interviewers probe for with behavioral questions. Every story is
// tagged with these, so the story bank can show which ones have no story yet.
// Free of server imports so client components can use the labels.

export const COMPETENCIES = {
  leadership: { label: "Leadership", asks: "Tell me about a time you led a team or project." },
  conflict: { label: "Conflict", asks: "Tell me about a disagreement with a teammate or manager." },
  failure: { label: "Failure", asks: "Tell me about a time something you owned went wrong." },
  ambiguity: { label: "Ambiguity", asks: "Tell me about a time you had to move without clear direction." },
  ownership: { label: "Ownership", asks: "Tell me about something you took on that wasn't your job." },
  impact: { label: "Impact", asks: "What's the result you're proudest of?" },
  "technical-depth": { label: "Technical depth", asks: "Walk me through the hardest technical problem you've solved." },
  collaboration: { label: "Collaboration", asks: "Tell me about working across teams to ship something." },
  influence: { label: "Influence", asks: "Tell me about convincing people without authority." },
  "customer-focus": { label: "Customer focus", asks: "Tell me about a time you changed course because of users." },
  learning: { label: "Learning fast", asks: "Tell me about getting up to speed on something new quickly." },
  prioritization: { label: "Prioritization", asks: "Tell me about juggling competing priorities." },
} as const;

export type Competency = keyof typeof COMPETENCIES;
export const COMPETENCY_IDS = Object.keys(COMPETENCIES) as [Competency, ...Competency[]];
