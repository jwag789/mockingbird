// The skills practice tasks target. Kept free of server imports so client
// components can use the labels.
import type { Dimension } from "../scoring/types";

type SkillDef = {
  label: string;
  group: "delivery" | "technical";
  /** The rubric dimension this skill most directly moves, if any. */
  dimension?: Dimension;
  /** YouTube search query used to find candidate videos. */
  videoQuery: string;
  /** What a good article on this skill teaches, for the web search. */
  articleBrief: string;
};

export const SKILLS = {
  "story-structure": {
    label: "Structuring your answers",
    group: "delivery",
    dimension: "structure",
    videoQuery: "STAR method behavioral interview answers",
    articleBrief: "how to structure behavioral interview answers with the STAR method, with examples",
  },
  "specific-examples": {
    label: "Specific examples",
    group: "delivery",
    dimension: "specificity",
    videoQuery: "how to give specific examples in job interview answers",
    articleBrief: "how to make interview answers concrete with real examples, names, numbers and decisions",
  },
  "showing-ownership": {
    label: "Showing your own contribution",
    group: "delivery",
    dimension: "ownership",
    videoQuery: "interview tips talk about your contribution I vs we",
    articleBrief: "how to describe your personal contribution in team projects during interviews",
  },
  "quantifying-impact": {
    label: "Quantifying impact",
    group: "delivery",
    dimension: "impact",
    videoQuery: "how to quantify impact accomplishments interview",
    articleBrief: "how to quantify results and impact when answering behavioral interview questions",
  },
  "answering-the-question": {
    label: "Answering the question asked",
    group: "delivery",
    dimension: "relevance",
    videoQuery: "how to answer interview questions directly concisely",
    articleBrief: "how to answer interview questions directly and tie answers to the role's needs",
  },
  "confident-delivery": {
    label: "Sounding confident",
    group: "delivery",
    videoQuery: "how to sound confident in a job interview",
    articleBrief: "how to sound confident in interviews: avoiding hedging language and qualifiers",
  },
  "filler-words": {
    label: "Cutting filler words",
    group: "delivery",
    videoQuery: "how to stop saying um and like when speaking",
    articleBrief: "practical techniques to reduce filler words like um and like when speaking",
  },
  "speaking-pace": {
    label: "Speaking pace",
    group: "delivery",
    videoQuery: "how to control speaking pace slow down when nervous",
    articleBrief: "how to control speaking pace and use pauses when presenting or interviewing",
  },
  "system-design": {
    label: "System design fundamentals",
    group: "technical",
    videoQuery: "system design interview fundamentals step by step",
    articleBrief: "a step-by-step framework for system design interviews",
  },
  "scalability-reliability": {
    label: "Scalability and reliability",
    group: "technical",
    videoQuery: "scalability reliability distributed systems explained queues caching",
    articleBrief: "core techniques for scalable, reliable systems: caching, queues, replication, idempotency",
  },
  "data-modeling": {
    label: "Data modeling",
    group: "technical",
    videoQuery: "database schema design data modeling tutorial",
    articleBrief: "relational data modeling and schema design best practices",
  },
  "api-design": {
    label: "API design",
    group: "technical",
    videoQuery: "REST API design best practices",
    articleBrief: "API design best practices: resources, versioning, pagination, errors, idempotency",
  },
  "coding-interviews": {
    label: "Coding interview problem solving",
    group: "technical",
    videoQuery: "how to approach coding interview problems",
    articleBrief: "a repeatable approach to solving coding interview problems and communicating while coding",
  },
  "frontend-architecture": {
    label: "Frontend architecture",
    group: "technical",
    videoQuery: "frontend system design interview",
    articleBrief: "frontend system design: state management, rendering strategies, performance and accessibility",
  },
  "llm-applications": {
    label: "Building LLM applications",
    group: "technical",
    videoQuery: "building production LLM applications evaluation",
    articleBrief: "building production LLM applications: structured outputs, evaluation, monitoring and failure handling",
  },
  "leadership-stories": {
    label: "Leadership and influence",
    group: "delivery",
    videoQuery: "leadership behavioral interview questions answers",
    articleBrief: "how to answer leadership, conflict and influence interview questions",
  },
} satisfies Record<string, SkillDef>;

export type Skill = keyof typeof SKILLS;
export const SKILL_IDS = Object.keys(SKILLS) as [Skill, ...Skill[]];
