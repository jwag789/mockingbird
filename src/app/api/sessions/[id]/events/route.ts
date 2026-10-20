import { Client } from "pg";
import { isUuid } from "@/lib/api";
import { pool } from "@/lib/db";
import { PROGRESS_CHANNEL, type ScoringProgress } from "@/lib/scoring/progress";

const HEARTBEAT_MS = 15_000;
// NOTIFY is the fast path; this catches anything missed (e.g. a worker restart).
const SAFETY_POLL_MS = 5_000;

/**
 * Stream scoring progress as Server-Sent Events. The worker NOTIFYs on every
 * step; each notification for this session pushes a fresh snapshot. The
 * stream closes once the session is scored or failed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const listener = new Client({ connectionString: process.env.DATABASE_URL });
  await listener.connect();
  await listener.query(`listen ${PROGRESS_CHANNEL}`);

  const encoder = new TextEncoder();
  let closed = false;
  let lastSent = "";
  const timers: ReturnType<typeof setInterval>[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = async () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearInterval);
        await listener.end().catch(() => {});
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      const push = async () => {
        if (closed) return;
        const { rows } = await pool.query<{ status: string; progress: ScoringProgress | null }>(
          "select status, progress from sessions where id = $1",
          [id],
        );
        if (!rows[0]) return close();
        const payload = JSON.stringify(rows[0]);
        if (payload !== lastSent) {
          lastSent = payload;
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        }
        if (rows[0].status === "scored" || rows[0].status === "failed") await close();
      };

      listener.on("notification", (msg) => {
        if (msg.payload === id) push().catch(() => close());
      });
      req.signal.addEventListener("abort", () => close());
      timers.push(setInterval(() => !closed && controller.enqueue(encoder.encode(": ping\n\n")), HEARTBEAT_MS));
      timers.push(setInterval(() => push().catch(() => close()), SAFETY_POLL_MS));

      await push();
    },
    cancel() {
      closed = true;
      timers.forEach(clearInterval);
      listener.end().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
