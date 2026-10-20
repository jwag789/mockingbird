// Finds recent, reputable articles for a skill with Claude's web search.
//
// Claude reports its picks through a save_articles tool. A pick is kept only
// if its URL appeared in the actual search results (so it can't be made up)
// and it loads as a web page when we fetch it ourselves.
import type Anthropic from "@anthropic-ai/sdk";
import { MODEL, client } from "../../claude";
import { SKILLS, type Skill } from "../skills";
import { recency, retireUnconfirmed, upsertResource } from "./library";

const MAX_AGE_MONTHS = 36;
const KEEP_PER_SKILL = 4;
const MAX_CONTINUATIONS = 5;

type Pick = { url: string; title: string; source: string; summary: string; publishedDate: string | null };

const SAVE_TOOL: Anthropic.Beta.BetaTool = {
  name: "save_articles",
  description: "Save the articles you chose. Call this once, at the end, with your final picks.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["articles"],
    properties: {
      articles: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["url", "title", "source", "summary", "publishedDate"],
          properties: {
            url: { type: "string", description: "Exactly as it appeared in the search results" },
            title: { type: "string" },
            source: { type: "string", description: "Publication or site name" },
            summary: { type: "string", description: "One sentence: what a reader will be able to do after reading" },
            publishedDate: {
              type: ["string", "null"],
              description: "Publish or last-updated date as YYYY-MM-DD, or null if unknown",
            },
          },
        },
      },
    },
  },
};

export async function refreshArticles(skill: Skill): Promise<number> {
  const { picks, seenUrls } = await searchForArticles(skill);

  const confirmed: string[] = [];
  for (const pick of picks) {
    if (confirmed.length >= KEEP_PER_SKILL) break;
    const url = normalizeUrl(pick.url);
    if (!seenUrls.has(url) || !(await loadsAsPage(pick.url))) continue;
    if (pick.publishedDate && recency(pick.publishedDate, MAX_AGE_MONTHS) === 0) continue;

    await upsertResource({
      kind: "article",
      skill,
      title: pick.title,
      url: pick.url,
      source: pick.source,
      summary: pick.summary,
      publishedAt: pick.publishedDate,
      durationS: null,
      stats: {},
      quality: 0.5 + 0.3 * recency(pick.publishedDate, MAX_AGE_MONTHS) - confirmed.length * 0.05,
    });
    confirmed.push(pick.url);
  }
  // A search that turned up nothing usable leaves the old picks in place.
  if (confirmed.length > 0) await retireUnconfirmed("article", skill, confirmed);
  return confirmed.length;
}

async function searchForArticles(skill: Skill): Promise<{ picks: Pick[]; seenUrls: Set<string> }> {
  const year = new Date().getFullYear();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content:
        `Find the ${KEEP_PER_SKILL + 2} best articles on: ${SKILLS[skill].articleBrief}.\n\n` +
        `Audience: people preparing for job interviews. Prefer pieces published or updated in ${year - 2}-${year} ` +
        "from reputable sources: official documentation, well-known engineering blogs, universities, " +
        "established career publications. Skip paywalled pages, thin listicles, SEO content farms, and " +
        "pages that mainly sell a course. Best first. When you're done, call save_articles once.",
    },
  ];
  const seenUrls = new Set<string>();

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }, SAVE_TOOL],
      messages,
    });

    for (const block of response.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const result of block.content) seenUrls.add(normalizeUrl(result.url));
      }
    }

    const save = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "save_articles",
    );
    if (save) return { picks: parsePicks(save.input), seenUrls };

    // The server-side search loop hit its limit; send the turn back to resume it.
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    break;
  }
  return { picks: [], seenUrls };
}

/** Strict tool input is schema-valid, but check the shape anyway before trusting it. */
function parsePicks(input: unknown): Pick[] {
  const articles = (input as { articles?: unknown })?.articles;
  if (!Array.isArray(articles)) return [];
  return articles.filter(
    (a): a is Pick =>
      typeof a?.url === "string" && /^https:\/\//.test(a.url) && typeof a.title === "string" && typeof a.summary === "string",
  );
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) if (p.startsWith("utm_")) u.searchParams.delete(p);
    return `${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url;
  }
}

async function loadsAsPage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; MockingbirdLinkCheck/1.0)" },
    });
    return res.ok && (res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}
