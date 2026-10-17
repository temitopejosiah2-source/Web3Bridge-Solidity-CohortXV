import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { createPublicClient, http, type Address, type Hash } from "viem";
import { mainnet, sepolia } from "viem/chains";

loadDotenv({ path: resolve(process.cwd(), ".env.local") });

const MAX_BLOCK_RANGE = 2_000n;
const CONFIRMATIONS = 2n;
const POLL_INTERVAL_MS = 12_000;
const MAX_RECENT_EVENT_IDS = 10_000;
const STATE_PATH = resolve(process.cwd(), "listener/state.json");
const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
const pushNotifySecret = process.env.PUSH_NOTIFY_SECRET;
const mainnetRpcUrl = process.env.MAINNET_RPC_URL
  ?? process.env.NEXT_PUBLIC_MAINNET_RPC_URL
  ?? "https://ethereum-rpc.publicnode.com";

for (const [name, value] of Object.entries({
  SEPOLIA_RPC_URL: sepoliaRpcUrl,
  TELEGRAM_BOT_TOKEN: telegramBotToken,
  TELEGRAM_CHAT_ID: telegramChatId,
  APP_URL: appUrl,
  PUSH_NOTIFY_SECRET: pushNotifySecret,
})) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(sepoliaRpcUrl),
});
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(mainnetRpcUrl),
});
let nftAddress: Address;
let nftAbi: typeof import("@/contracts/nft").nftAbi;

type ListenerState = {
  lastProcessedBlock: string;
  recentEventIds: string[];
};

type MintEvent = {
  id: string;
  transactionHash: Hash;
  blockNumber: bigint;
  to: Address;
  tokenId: bigint;
};

let state: ListenerState;
let recentEventIds: string[];
let recentEventSet: Set<string>;
let stopRequested = false;

function shortAddress(address: Address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function writeState(snapshot: ListenerState = state) {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const temporaryPath = `${STATE_PATH}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, STATE_PATH);
}

async function loadState() {
  try {
    const saved = JSON.parse(await readFile(STATE_PATH, "utf8")) as Partial<ListenerState>;
    if (
      typeof saved.lastProcessedBlock !== "string"
      || !/^\d+$/.test(saved.lastProcessedBlock)
      || !Array.isArray(saved.recentEventIds)
      || saved.recentEventIds.some((id) => typeof id !== "string")
    ) {
      throw new Error("Listener state file has an invalid format.");
    }
    state = {
      lastProcessedBlock: saved.lastProcessedBlock,
      recentEventIds: saved.recentEventIds.slice(-MAX_RECENT_EVENT_IDS),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      const blockNumber = await sepoliaClient.getBlockNumber();
      const finalizedBlock = blockNumber > CONFIRMATIONS ? blockNumber - CONFIRMATIONS : 0n;
      state = { lastProcessedBlock: finalizedBlock.toString(), recentEventIds: [] };
      await writeState();
      console.info(`Initialized listener state at finalized block ${finalizedBlock.toString()}.`);
    } else {
      throw error;
    }
  }
  recentEventIds = state.recentEventIds;
  recentEventSet = new Set(recentEventIds);
}

async function retrySend(label: string, send: () => Promise<void>) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await send();
      return;
    } catch {
      if (attempt === 5) {
        console.error(`${label} failed after ${attempt} attempts; transport details redacted.`);
        return;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * 2 ** (attempt - 1)));
    }
  }
}

async function minterName(address: Address) {
  try {
    return (await mainnetClient.getEnsName({ address })) ?? shortAddress(address);
  } catch {
    return shortAddress(address);
  }
}

async function sendTelegram(event: MintEvent, minter: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: `Mintroom: NFT #${event.tokenId.toString()} minted to ${minter}\nhttps://sepolia.etherscan.io/tx/${event.transactionHash}`,
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Telegram returned HTTP ${response.status}.`);
  const result = await response.json() as { ok?: unknown };
  if (result.ok !== true) throw new Error("Telegram did not accept the message.");
}

async function sendWebPush(event: MintEvent, minter: string) {
  const response = await fetch(`${appUrl}/api/push/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-notify-secret": pushNotifySecret!,
    },
    body: JSON.stringify({
      title: `Mintroom: NFT #${event.tokenId.toString()} minted`,
      body: `Minted to ${minter}`,
      url: "/activity",
      eventId: event.id,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Web Push endpoint returned HTTP ${response.status}.`);
}

async function processEvent(event: MintEvent) {
  if (recentEventSet.has(event.id)) return;

  const nextEventIds = [...recentEventIds, event.id];
  if (nextEventIds.length > MAX_RECENT_EVENT_IDS) {
    nextEventIds.splice(0, nextEventIds.length - MAX_RECENT_EVENT_IDS);
  }
  const nextState = { ...state, recentEventIds: nextEventIds };
  await writeState(nextState);
  recentEventIds = nextEventIds;
  recentEventSet = new Set(recentEventIds);

  const minter = await minterName(event.to);
  await Promise.all([
    retrySend(`Telegram notification for ${event.id}`, () => sendTelegram(event, minter)),
    retrySend(`Web Push notification for ${event.id}`, () => sendWebPush(event, minter)),
  ]);
  console.info(`Processed NFT #${event.tokenId.toString()} for ${minter} (${event.id}).`);
}

async function processConfirmedRanges() {
  const chainTip = await sepoliaClient.getBlockNumber();
  const confirmedTip = chainTip > CONFIRMATIONS ? chainTip - CONFIRMATIONS : 0n;
  let cursor = BigInt(state.lastProcessedBlock) + 1n;

  while (cursor <= confirmedTip && !stopRequested) {
    const endBlock = cursor + MAX_BLOCK_RANGE - 1n < confirmedTip
      ? cursor + MAX_BLOCK_RANGE - 1n
      : confirmedTip;
    const logs = await sepoliaClient.getContractEvents({
      address: nftAddress,
      abi: nftAbi,
      eventName: "Minted",
      fromBlock: cursor,
      toBlock: endBlock,
      strict: true,
    });

    for (const log of logs) {
      if (!log.transactionHash || log.blockNumber === undefined || log.logIndex === undefined) continue;
      const recipient = log.args.to;
      const tokenId = log.args.tokenId;
      if (!recipient || tokenId === undefined) continue;

      await processEvent({
        id: `${log.transactionHash}:${log.logIndex}`,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
        to: recipient,
        tokenId,
      });
    }

    const nextState = { ...state, lastProcessedBlock: endBlock.toString() };
    await writeState(nextState);
    state = nextState;
    console.info(`Scanned Sepolia blocks ${cursor.toString()}–${endBlock.toString()}.`);
    cursor = endBlock + 1n;
  }
}

async function run() {
  const require = createRequire(resolve(process.cwd(), "package.json"));
  const nftContract = require("./src/contracts/nft") as typeof import("../src/contracts/nft");
  nftAddress = nftContract.NFT_ADDRESS;
  nftAbi = nftContract.nftAbi;
  await loadState();
  console.info(`Watching ClassNFT ${nftAddress} from block ${state.lastProcessedBlock}.`);

  while (!stopRequested) {
    try {
      await processConfirmedRanges();
    } catch {
      console.error("Listener poll failed; RPC details redacted. Retrying.");
    }
    if (!stopRequested) await new Promise((resolveDelay) => setTimeout(resolveDelay, POLL_INTERVAL_MS));
  }

  await writeState();
  console.info("Listener stopped cleanly.");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopRequested = true;
  });
}

void run().catch(() => {
  console.error("Listener stopped due to an initialization or state error; details redacted.");
  process.exitCode = 1;
});
