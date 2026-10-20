// Finds recent, well-received YouTube videos for a skill.
//
// "Highly rated" has to be inferred: YouTube hides dislike counts, so
// quality is views, likes per view and recency, plus Claude checking that the
// video actually teaches the skill (not a course pitch or clickbait). Our own
// users' helpful/unhelpful ratings then re-rank what survives.
import { z } from "zod";
import { structured } from "../../claude";
import { SKILLS, type Skill } from "../skills";
import { recency, retireUnconfirmed, upsertResource } from "./library";

const API = "https://www.googleapis.com/youtube/v3";
const MAX_AGE_MONTHS = 24;
const MIN_VIEWS = 10_000;
const MIN_LIKE_RATE = 0.01;
const MIN_SECONDS = 3 * 60;
const MAX_SECONDS = 25 * 60;
const KEEP_PER_SKILL = 4;

type Candidate = {
  id: string;
  title: string;
  channel: string;
  description: string;
  publishedAt: string;
  durationS: number;
  views: number;
  likes: number;
};

const Vetting = z.object({
  videos: z.array(
    z.object({
      id: z.string(),
      keep: z.boolean().describe("True only if it genuinely teaches the skill to job candidates"),
      summary: z.string().describe("One sentence: what a viewer will be able to do after watching"),
    }),
  ),
});

export async function refreshVideos(skill: Skill): Promise<number> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return 0;

  const candidates = (await search(skill, key)).filter(
    (v) =>
      v.views >= MIN_VIEWS &&
      v.likes / v.views >= MIN_LIKE_RATE &&
      v.durationS >= MIN_SECONDS &&
      v.durationS <= MAX_SECONDS,
  );
  if (candidates.length === 0) return 0;

  const vetting = await structured({
    schema: Vetting,
    effort: "low",
    system:
      "You vet YouTube videos for an interview-practice app. Keep a video only if it directly and substantively " +
      "teaches the named skill to someone preparing for job interviews. Reject course or product pitches, " +
      "clickbait, reaction videos, low-effort compilations, and anything off-topic. Judge only from the details given.",
    messages: [
      {
        role: "user",
        content:
          `Skill: ${SKILLS[skill].label}\n\n` +
          candidates
            .map(
              (v) =>
                `<video id="${v.id}">\nTitle: ${v.title}\nChannel: ${v.channel}\n` +
                `Published: ${v.publishedAt.slice(0, 10)}, ${Math.round(v.durationS / 60)} min\n` +
                `Description: ${v.description.slice(0, 600)}\n</video>`,
            )
            .join("\n\n"),
      },
    ],
  });

  const kept = new Map(vetting.videos.filter((v) => v.keep).map((v) => [v.id, v.summary]));
  const ranked = candidates
    .filter((v) => kept.has(v.id))
    .map((v) => ({ v, quality: quality(v) }))
    .sort((a, b) => b.quality - a.quality)
    .slice(0, KEEP_PER_SKILL);

  for (const { v, quality } of ranked) {
    await upsertResource({
      kind: "video",
      skill,
      title: v.title,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      source: v.channel,
      summary: kept.get(v.id)!,
      publishedAt: v.publishedAt,
      durationS: v.durationS,
      stats: { views: v.views, likes: v.likes },
      quality,
    });
  }
  await retireUnconfirmed(
    "video",
    skill,
    ranked.map(({ v }) => `https://www.youtube.com/watch?v=${v.id}`),
  );
  return ranked.length;
}

function quality(v: Candidate): number {
  const reach = Math.min(1, Math.log10(v.views) / 6); // 1M views = 1
  const approval = Math.min(1, v.likes / v.views / 0.05); // 5% likes per view = 1
  return 0.4 * reach + 0.35 * approval + 0.25 * recency(v.publishedAt, MAX_AGE_MONTHS);
}

async function search(skill: Skill, key: string): Promise<Candidate[]> {
  const publishedAfter = new Date(Date.now() - MAX_AGE_MONTHS * 30 * 86_400_000).toISOString();
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: SKILLS[skill].videoQuery,
    maxResults: "15",
    order: "relevance",
    publishedAfter,
    relevanceLanguage: "en",
    safeSearch: "strict",
    videoEmbeddable: "true",
    key,
  });
  const found = await getJson<{ items: Array<{ id: { videoId: string } }> }>(`${API}/search?${params}`);
  const ids = found.items.map((i) => i.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const details = await getJson<{
    items: Array<{
      id: string;
      snippet: { title: string; channelTitle: string; description: string; publishedAt: string; liveBroadcastContent: string };
      statistics: { viewCount?: string; likeCount?: string };
      contentDetails: { duration: string };
    }>;
  }>(`${API}/videos?${new URLSearchParams({ part: "snippet,statistics,contentDetails", id: ids.join(","), key })}`);

  return details.items
    .filter((v) => v.snippet.liveBroadcastContent === "none" && v.statistics.likeCount != null)
    .map((v) => ({
      id: v.id,
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      description: v.snippet.description,
      publishedAt: v.snippet.publishedAt,
      durationS: parseDuration(v.contentDetails.duration),
      views: Number(v.statistics.viewCount ?? 0),
      likes: Number(v.statistics.likeCount ?? 0),
    }));
}

/** ISO 8601 durations like PT1H2M3S, as YouTube reports them. */
export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86_400 + h * 3600 + min * 60 + s;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    // Never log the URL: it carries the API key.
    throw new Error(`YouTube API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}
