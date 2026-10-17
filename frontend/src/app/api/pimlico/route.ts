import { NextResponse } from "next/server";
import { decodeFunctionData, type Hex } from "viem";
import { NFT_ADDRESS, nftAbi } from "@/contracts/nft";

export const runtime = "nodejs";
export const maxDuration = 30;

const allowedMethods = new Set([
  "eth_chainId",
  "eth_estimateUserOperationGas",
  "eth_getUserOperationByHash",
  "eth_getUserOperationReceipt",
  "eth_sendUserOperation",
  "eth_supportedEntryPoints",
  "pm_getPaymasterData",
  "pm_getPaymasterStubData",
  "pimlico_getUserOperationGasPrice",
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

const sponsoredMethods = new Set([
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "pm_getPaymasterData",
  "pm_getPaymasterStubData",
]);

function isAllowedMintBatch(callData: unknown) {
  if (typeof callData !== "string" || !/^0x([a-fA-F0-9]{2})+$/.test(callData)) return false;

  try {
    const batch = decodeFunctionData({
      abi: smartAccountBatchAbi,
      data: callData as Hex,
    });
    if (batch.functionName !== "executeBatch") return false;
    const [destinations, values, functionCalls] = batch.args;
    if (destinations.length !== 2 || values.length !== 2 || functionCalls.length !== 2) return false;
    if (values.some((value) => value !== 0n)) return false;
    if (destinations.some((destination) => destination.toLowerCase() !== NFT_ADDRESS.toLowerCase())) return false;

    const metadataUris = functionCalls.map((functionCall) => {
      const decoded = decodeFunctionData({ abi: nftAbi, data: functionCall });
      if (decoded.functionName !== "mint") return undefined;
      return decoded.args[0];
    });
    return metadataUris.every((uri) => typeof uri === "string" && uri.startsWith("ipfs://"))
      && metadataUris[0] === metadataUris[1];
  } catch {
    return false;
  }
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.PIMLICO_API_KEY) });
}

export async function POST(request: Request) {
  const id: unknown = null;
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  const apiKey = process.env.PIMLICO_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { jsonrpc: "2.0", id, error: { code: -32000, message: "Pimlico is not configured for this deployment." } },
      { status: 503 },
    );
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
  if (rpc.jsonrpc !== "2.0" || !allowedMethods.has(String(rpc.method))) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32601, message: "JSON-RPC method is not allowed." } },
      { status: 400 },
    );
  }
  if (sponsoredMethods.has(String(rpc.method))) {
    const params = rpc.params;
    const userOperation = Array.isArray(params) && params[0] && typeof params[0] === "object"
      ? params[0] as { callData?: unknown }
      : undefined;
    if (!isAllowedMintBatch(userOperation?.callData)) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32602, message: "Only a two-call ClassNFT mint batch is allowed." } },
        { status: 400 },
      );
    }
  }

  try {
    const upstream = await fetch(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const result = await upstream.text();
    return new Response(result, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Pimlico request failed", error);
    return NextResponse.json(
      { jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32000, message: "Pimlico could not be reached. Please retry." } },
      { status: 502 },
    );
  }
}
