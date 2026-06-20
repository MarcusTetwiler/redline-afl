import { Redis } from "@upstash/redis";

const COMMENTS_KEY = "redline:comments";

function getClient() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function GET() {
  const redis = getClient();
  if (!redis) {
    return Response.json(
      { error: "No storage connected yet. Comments will not be saved until a KV store is linked to this project on Vercel." },
      { status: 200 }
    );
  }
  try {
    const raw = await redis.lrange(COMMENTS_KEY, 0, -1);
    const comments = raw.map((r) => (typeof r === "string" ? JSON.parse(r) : r));
    return Response.json({ comments });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request) {
  const redis = getClient();
  if (!redis) {
    return Response.json(
      { error: "No storage connected yet. Comments will not be saved until a KV store is linked to this project on Vercel." },
      { status: 503 }
    );
  }

  const body = await request.json();
  const { passageId, chapter, text, type, priority, author } = body;
  if (!passageId || !text || !text.trim()) {
    return Response.json({ error: "Missing passageId or text." }, { status: 400 });
  }

  const comment = {
    id: `c${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    passageId,
    chapter: chapter || null,
    text: text.trim(),
    type: type || "Other",
    priority: priority || "Medium",
    author: (author || "Reader").trim() || "Reader",
    createdAt: new Date().toISOString(),
  };

  try {
    await redis.rpush(COMMENTS_KEY, JSON.stringify(comment));
    return Response.json({ comment });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
