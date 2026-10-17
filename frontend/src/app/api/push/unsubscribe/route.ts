import { NextResponse } from "next/server";
import { getPushRedis, isPushSubscription, isSameOrigin, PUSH_SUBSCRIPTIONS_KEY, subscriptionKey } from "@/lib/push-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid unsubscribe request." }, { status: 400 });
  }
  const subscription = body && typeof body === "object" && "subscription" in body
    ? body.subscription
    : undefined;
  if (!isPushSubscription(subscription)) {
    return NextResponse.json({ error: "A valid browser push subscription is required." }, { status: 400 });
  }

  try {
    const redis = getPushRedis();
    await redis.hdel(PUSH_SUBSCRIPTIONS_KEY, subscriptionKey(subscription.endpoint));
    return NextResponse.json({ unsubscribed: true });
  } catch {
    return NextResponse.json({ error: "Push subscription storage is unavailable." }, { status: 503 });
  }
}
