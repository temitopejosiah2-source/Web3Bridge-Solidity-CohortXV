import { NextResponse } from "next/server";
import { decodeFunctionData, type Hex } from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { NFT_ADDRESS, nftAbi } from "@/contracts/nft";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const rateWindows = new Map<string, number[]>();
const allowedMethods = new Set([
  "eth_chainId",
  "eth_estimateUserOperationGas",
  "eth_getUserOperationByHash",
  "eth_getUserOperationReceipt",
  "eth_sendUserOperation",
  "eth_supportedEntryPoints",
  "pm_getPaymasterData",
  "pm_getPaymasterStubData",
  "pm_sponsorUserOperation",
  "pimlico_getUserOperationGasPrice",
  "pimlico_getUserOperationStatus",
]);
const userOperationMethods = new Set([
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "pm_getPaymasterData",
  "pm_getPaymasterStubData",
  "pm_sponsorUserOperation",
]);

const smartAccountBatchAbi = [
  {
    type: "function",
    name: "executeBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "dest", type: "address[]" },
      { name: "value", type: "uint256[]" },
      { name: "func", type: "bytes[]" },
    ],
    outputs: [],
  },
] as const;

function isAllowedMintBatch(callData: unknown) {
  if (typeof callData !== "string" || !/^0x([a-fA-F0-9]{2})+$/.test(callData)) return false;

  try {
    const batch = decodeFunctionData({ abi: smartAccountBatchAbi, data: callData as Hex });
    if (batch.functionName !== "executeBatch") return false;
    const [destinations, values, functionCalls] = batch.args;
    if (destinations.length !== 2 || values.length !== 2 || functionCalls.length !== 2) return false;
    if (values.some((value) => value !== 0n)) return false;
    if (destinations.some((destination) => destination.toLowerCase() !== NFT_ADDRESS.toLowerCase())) return false;

    const metadataUris = functionCalls.map((functionCall) => {
      const decoded = decodeFunctionData({ abi: nftAbi, data: functionCall });
      return decoded.functionName === "mint" ? decoded.args[0] : undefined;
    });
    return metadataUris.every((uri) => typeof uri === "string" && uri.startsWith("ipfs://"))
      && metadataUris[0] === metadataUris[1];
  } catch {
    return false;
  }
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function isRateLimited(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = request.headers.get("x-real-ip") ?? forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const recent = (rateWindows.get(ip) ?? []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    rateWindows.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateWindows.set(ip, recent);

  if (rateWindows.size > 5_000) {
    for (const [key, timestamps] of rateWindows) {
      if (!timestamps.length || now - timestamps[timestamps.length - 1] >= RATE_WINDOW_MS) {
        rateWindows.delete(key);
      }
    }
  }
  return false;
}

function rpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  return NextResponse.json(
    { configured: Boolean(process.env.PIMLICO_API_KEY), chainId: "0xaa36a7" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Rate limit exceeded. Please retry in a minute." }, { status: 429 });
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 64_000) {
      return NextResponse.json({ error: "Pimlico request is too large." }, { status: 413 });
    }
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON-RPC request." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "A single JSON-RPC request is required." }, { status: 400 });
  }
  const rpc = payload as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const method = typeof rpc.method === "string" ? rpc.method : "";
  if (rpc.jsonrpc !== "2.0" || !allowedMethods.has(method)) {
    return rpcError(rpc.id, -32601, "JSON-RPC method is not allowed.");
  }
  if (!Array.isArray(rpc.params)) {
    return rpcError(rpc.id, -32602, "Invalid JSON-RPC parameters.");
  }

  if (method === "eth_chainId" && rpc.params.length !== 0) {
    return rpcError(rpc.id, -32602, "Only Sepolia (chain ID 11155111) is supported.");
  }
  if (userOperationMethods.has(method)) {
    const userOperation = rpc.params[0];
    const entryPoint = rpc.params[1];
    if (
      !userOperation
      || typeof userOperation !== "object"
      || typeof entryPoint !== "string"
      || entryPoint.toLowerCase() !== entryPoint07Address.toLowerCase()
    ) {
      return rpcError(rpc.id, -32602, "Only Sepolia EntryPoint v0.7 UserOperations are supported.");
    }
    if (!isAllowedMintBatch((userOperation as { callData?: unknown }).callData)) {
      return rpcError(rpc.id, -32602, "Only a two-call ClassNFT mint batch is allowed.");
    }
  }

  const apiKey = process.env.PIMLICO_API_KEY;
  if (!apiKey) return rpcError(rpc.id, -32000, "Pimlico is not configured for this deployment.", 503);

  try {
    const upstream = await fetch(
      `https://api.pimlico.io/v2/sepolia/rpc?apikey=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      },
    );
    const result: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok || !result || typeof result !== "object" || Array.isArray(result)) {
      return rpcError(rpc.id, -32000, "Pimlico request failed. Please retry.", 502);
    }
    const response = result as { jsonrpc?: unknown; id?: unknown; result?: unknown; error?: unknown };
    if (response.error !== undefined) {
      return rpcError(rpc.id, -32000, "Pimlico could not process this request.", 502);
    }
    return NextResponse.json(
      { jsonrpc: "2.0", id: rpc.id ?? null, result: response.result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return rpcError(rpc.id, -32000, "Pimlico could not be reached. Please retry.", 502);
  }
}
