import { pool } from "../../db";
import type { Skill } from "../skills";

export type ResourceKind = "video" | "article";

export type NewResource = {
  kind: ResourceKind;
  skill: Skill;
  title: string;
  url: string;
  source: string;
  summary: string;
  publishedAt: string | null;
  durationS: number | null;
  stats: Record<string, number>;
  quality: number;
};

export type CatalogEntry = {
  id: number;
  kind: ResourceKind;
  skill: Skill;
  title: string;
  source: string;
  summary: string;
  durationS: number | null;
  publishedAt: string | null;
};

/** Insert a resource, or refresh its stats if the URL is already known. */
export async function upsertResource(r: NewResource): Promise<void> {
  await pool.query(
    `insert into resources (kind, skill, title, url, source, summary, published_at, duration_s, stats, quality)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (url) do update
       set title = excluded.title, summary = excluded.summary, stats = excluded.stats,
           quality = excluded.quality, status = 'active', checked_at = now()`,
    [r.kind, r.skill, r.title, r.url, r.source, r.summary, r.publishedAt, r.durationS, r.stats, r.quality],
  );
}

/** Retire resources of a kind and skill that a refresh didn't confirm. */
export async function retireUnconfirmed(kind: ResourceKind, skill: Skill, confirmedUrls: string[]) {
  await pool.query(
    `update resources set status = 'retired'
      where kind = $1 and skill = $2 and status = 'active' and not (url = any($3))`,
    [kind, skill, confirmedUrls],
  );
}

/**
 * The best few active resources per skill and kind, for the coach to choose
 * from. Users' helpful/unhelpful ratings move resources up and down.
 */
export async function catalogFor(skills: Skill[], perSkillAndKind = 3): Promise<CatalogEntry[]> {
  const { rows } = await pool.query(
    `select id, kind, skill, title, source, summary, duration_s, published_at
       from (
         select *, row_number() over (
                  partition by skill, kind
                  order by quality + 0.05 * (helpful - unhelpful) desc
                ) as rank
           from resources
          where status = 'active' and skill = any($1)
       ) ranked
      where rank <= $2
      order by skill, kind, rank`,
    [skills, perSkillAndKind],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    skill: r.skill,
    title: r.title,
    source: r.source,
    summary: r.summary,
    durationS: r.duration_s,
    publishedAt: r.published_at?.toISOString() ?? null,
  }));
}

/** Recency from 1 (today) down to 0 at `maxMonths` old. */
export function recency(publishedAt: string | null, maxMonths: number): number {
  if (!publishedAt) return 0.3;
  const months = (Date.now() - new Date(publishedAt).getTime()) / (30 * 86_400_000);
  return Math.max(0, Math.min(1, 1 - months / maxMonths));
}
