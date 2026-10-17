import "server-only";
import { createHash } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { PushSubscription } from "web-push";

export const PUSH_SUBSCRIPTIONS_KEY = "mintroom:push:subscriptions";

let redisClient: Redis | undefined;

export function getPushRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Push storage is not configured.");
  redisClient ??= new Redis({ url, token });
  return redisClient;
}

export function subscriptionKey(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function isPushSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") return false;
  const item = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (
    typeof item.endpoint !== "string"
    || item.endpoint.length > 4_096
    || typeof item.keys?.p256dh !== "string"
    || !/^[A-Za-z0-9_-]+$/.test(item.keys.p256dh)
    || item.keys.p256dh.length > 512
    || typeof item.keys.auth !== "string"
    || !/^[A-Za-z0-9_-]+$/.test(item.keys.auth)
    || item.keys.auth.length > 512
  ) {
    return false;
  }

  try {
    const endpoint = new URL(item.endpoint);
    return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password;
  } catch {
    return false;
  }
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
