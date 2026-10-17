import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import webpush from "web-push";
import type { PushSubscription } from "web-push";
import { getPushRedis, isPushSubscription, PUSH_SUBSCRIPTIONS_KEY, subscriptionKey } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type PushMessage = { title: string; body: string; url: string; eventId?: string };

function matchesSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected) return false;
  const receivedDigest = createHash("sha256").update(received).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

function isPushMessage(value: unknown): value is PushMessage {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.title === "string" && item.title.length > 0 && item.title.length <= 120
    && typeof item.body === "string" && item.body.length > 0 && item.body.length <= 500
    && typeof item.url === "string" && item.url.startsWith("/")
    && !item.url.startsWith("//") && !item.url.startsWith("/\\")
    && (!("eventId" in item) || (typeof item.eventId === "string" && /^0x[a-fA-F0-9]{64}:\d+$/.test(item.eventId)));
}

export async function POST(request: Request) {
  const secret = process.env.PUSH_NOTIFY_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Push delivery is not configured." }, { status: 503 });
  }
  if (!matchesSecret(request.headers.get("x-notify-secret"), secret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid push message." }, { status: 400 });
  }
  if (!isPushMessage(payload)) {
    return NextResponse.json({ error: "A valid title, body, and local URL are required." }, { status: 400 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "Web Push is not configured." }, { status: 503 });
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    const redis = getPushRedis();
    const records = await redis.hgetall<Record<string, string>>(PUSH_SUBSCRIPTIONS_KEY);
    const entries = Object.entries(records ?? {});
    const deliveryKey = payload.eventId
      ? `mintroom:push:delivery:${createHash("sha256").update(payload.eventId).digest("hex")}`
      : undefined;
    const delivered = deliveryKey
      ? await redis.hgetall<Record<string, string>>(deliveryKey)
      : undefined;
    let sent = 0;
    let removed = 0;
    const tag = createHash("sha256")
      .update(`${payload.title}\n${payload.body}\n${payload.url}`)
      .digest("hex");
    const notification = JSON.stringify({ ...payload, icon: "/favicon.ico", tag });
    let failed = 0;

    for (let offset = 0; offset < entries.length; offset += 20) {
      const batch = entries.slice(offset, offset + 20);
      await Promise.all(batch.map(async ([key, serialized]) => {
        const endpointHash = /^[a-fA-F0-9]{64}$/.test(key) ? key : undefined;
        if (deliveryKey && endpointHash && delivered?.[endpointHash] === "1") return;

        let subscription: PushSubscription;
        try {
          const parsed: unknown = JSON.parse(serialized);
          if (!isPushSubscription(parsed)) throw new Error("Invalid stored subscription.");
          subscription = parsed;
        } catch {
          await redis.hdel(PUSH_SUBSCRIPTIONS_KEY, key);
          removed += 1;
          return;
        }

        try {
          await webpush.sendNotification(subscription, notification);
          if (deliveryKey) {
            const field = endpointHash ?? subscriptionKey(subscription.endpoint);
            await redis.hset(deliveryKey, { [field]: "1" });
            await redis.expire(deliveryKey, 30 * 24 * 60 * 60);
          }
          sent += 1;
        } catch (error) {
          const statusCode = typeof error === "object" && error !== null && "statusCode" in error
            ? (error as { statusCode?: unknown }).statusCode
            : undefined;
          if (statusCode === 404 || statusCode === 410) {
            await redis.hdel(PUSH_SUBSCRIPTIONS_KEY, subscriptionKey(subscription.endpoint));
            removed += 1;
          } else {
            failed += 1;
          }
        }
      }));
    }

    if (failed) {
      return NextResponse.json(
        { error: "Some push notifications could not be delivered.", sent, removed, failed },
        { status: 502 },
      );
    }
    return NextResponse.json({ sent, removed });
  } catch {
    return NextResponse.json({ error: "Push delivery is temporarily unavailable." }, { status: 503 });
  }
}
