import { NextResponse } from "next/server";
import { errorResponse, isUuid, requireUser } from "@/lib/api";
import { assertOwner } from "@/lib/interview/conductor";
import { getAnswerAudio } from "@/lib/scoring/talk-time";

/**
 * The recorded audio for one spoken answer. Supports Range requests, which
 * browsers need to seek in an MP3 (clicking a word jumps to it).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; seq: string }> }) {
  const { id, seq: seqParam } = await params;
  const seq = Number(seqParam);
  if (!isUuid(id) || !Number.isSafeInteger(seq)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const user = await requireUser(req);
    await assertOwner(id, user.id);
    const clip = await getAnswerAudio(id, seq);
    if (!clip) return NextResponse.json({ error: "No recording for this answer" }, { status: 404 });

    const size = clip.audio.length;
    const headers = {
      "content-type": clip.mime,
      "accept-ranges": "bytes",
      // Private: it's someone's voice.
      "cache-control": "private, max-age=3600",
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    if (!range) {
      return new Response(new Uint8Array(clip.audio), { headers: { ...headers, "content-length": String(size) } });
    }

    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      return new Response(null, { status: 416, headers: { ...headers, "content-range": `bytes */${size}` } });
    }
    return new Response(new Uint8Array(clip.audio.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
