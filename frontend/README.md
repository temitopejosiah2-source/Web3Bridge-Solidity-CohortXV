# Mintroom — Day 3 and Day 4 dApp

Mintroom looks up `.eth` names, pins artwork through Pinata (IPFS), mints ClassNFTs on Sepolia, shows a live Chainlink ETH/USD price, batches two mints through an ERC-4337 smart account with Pimlico, and alerts on new contract mints through the live page, browser push, and a standalone Telegram listener.

**Live:** [https://mintroom.vercel.app](https://mintroom.vercel.app)
The live app runs on Sepolia. Server credentials are read only by server routes; `PIMLICO_API_KEY` is configured in Vercel and never exposed to browser code.

## What it does

- **ENS:** a `.eth` box on the home page, plus every address shown as its primary ENS name when it has one (names are read from mainnet).
- **IPFS:** files go to `/api/upload` on the server, which pins them with Pinata. The `ipfs://` URI is stored on-chain, and the gallery loads the image back through an IPFS HTTP gateway. IPFS content is public and permanent, so don’t upload private media.
- **Chainlink:** Sepolia ETH/USD feed `0x694AA1769357215DE4FAC081bf1f309aDC325306`, polled on its own, with how old the round is. Each NFT card shows the live USD reference value of 1 ETH; the mint form estimates and reports the network fee in USD. ClassNFT mints are free and have no market price.
- **Smart-account batch:** on the Gallery page, select an image and choose **Gasless batch · mint twice**. The connected wallet signs one ERC-4337 UserOperation from a counterfactual Simple Smart Account; it calls `ClassNFT.mint` twice with the same metadata URI. All bundler and paymaster JSON-RPC calls pass through the same-origin, rate-limited `/api/pimlico` proxy, which adds the server-side key and only permits Sepolia EntryPoint v0.7 two-mint calls. The UI shows the pending → included → confirmed lifecycle and links to the transaction.
- **Live alerts:** open [/activity](https://mintroom.vercel.app/activity) to load recent `Minted` events and poll for new ones while the page remains open. Enable in-page/browser alerts or **Enable background alerts** to subscribe the browser to Web Push; addresses use their ENS name where available.
- **Always-on listener:** the standalone Node listener catches up over confirmed contract events, stores its block cursor and bounded dedupe set in ignored `listener/state.json`, then sends new mints to Telegram and the protected Web Push endpoint. Push subscriptions live in Upstash Redis, not on the Vercel filesystem.

## Architecture

```text
User + wallet → smart account → /api/pimlico → Pimlico bundler → EntryPoint → ClassNFT
ClassNFT Minted → standalone listener → Telegram
                                  └──→ /api/push/send → Web Push → subscribed browser
Browser → /api/push/subscribe or /unsubscribe → Upstash Redis
```

### UserOperation explorer record

The verified two-mint UserOperation was included successfully on Sepolia:

**UserOperation transaction:** [View on Sepolia Etherscan](https://sepolia.etherscan.io/tx/0x06ef4bc257d23bcb1a48ac55c45ee9427f47b129df4e50ced345117cb97aa5d0)  
**UserOperation hash:** `0x50125f6af42e40a1d1e37f408dee64f2fe75528cd2fcfdc74b8458f7b128587a`

For this operation, the outer transaction **From** is the bundler (`0x43370108f30Ee5Ed54A9565F37af3BE8502903f5`) and **To** is the ERC-4337 EntryPoint (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`). The UserOperation **Sender** is smart account `0xe41E06cd0879Fd271Ab5c65D5480C7486cBbE7E4`; its two calls minted tokens #1 and #2 from ClassNFT. The Pimlico paymaster (`0x777777777777AeC03fd955926DbF81597e66834C`) sponsored the UserOperation gas.

## How to run

```bash
cd frontend
cp .env.example .env.local
# fill in the names from .env.example
npm install
npm run dev
```

Open http://localhost:3000 — use a phone or a narrow window to check the layout.

### Configure Web Push, Telegram, and Upstash

1. Generate VAPID key pairs yourself with `npx web-push generate-vapid-keys`. Put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`; set `VAPID_SUBJECT` to a contact such as `mailto:you@example.com`. Never commit or publish the private key.
2. Create a Telegram bot by messaging [@BotFather](https://t.me/BotFather). Save its token as `TELEGRAM_BOT_TOKEN`, send the bot a message (for example `/start`), and obtain your chat ID from the Telegram Bot API `getUpdates` response; set it as `TELEGRAM_CHAT_ID`.
3. Create a Redis database in [Upstash](https://console.upstash.com/), then copy its REST URL and REST token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Set a long random `PUSH_NOTIFY_SECRET`. Use the same value in Vercel and in the listener environment. The listener also needs `SEPOLIA_RPC_URL` and `APP_URL` (for example `https://mintroom.vercel.app`).
5. Copy `.env.example` to `.env.local` for local development and listener-only variables. The file is ignored by git. Do not put `PIMLICO_API_KEY` in it.

Run the always-on listener in a separate terminal/process from the Next.js app:

```bash
cd frontend
npm run listener
```

The first run initializes `listener/state.json` at the current finalized Sepolia block; subsequent runs backfill from its saved block in chunks of at most 2,000 blocks and only process events at least two confirmations deep. Keep the listener process running on your laptop or a Node host (such as Railway, Fly.io, or Render); Vercel serverless functions are not the listener. To backfill earlier history, stop the listener and lower `lastProcessedBlock` in its local ignored state file.

## Contracts (Sepolia)

| What | Address | Etherscan |
| --- | --- | --- |
| ClassNFT | `0xf311E4EA522D00103c1d180115CF5aD53FF0f9C2` | [Etherscan](https://sepolia.etherscan.io/address/0xf311E4EA522D00103c1d180115CF5aD53FF0f9C2) |
| Chainlink ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | [Etherscan](https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306) |

If the instructor did not share a ClassNFT address, deploy from the repo root of `contracts/`:

```bash
forge script script/DeployClassNFT.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast
```

## Environment variables (names only)

| Name | Where it lives |
| --- | --- |
| `PINATA_JWT` | Server only; Vercel and local `.env.local` for uploads. |
| `PIMLICO_API_KEY` | Vercel server environment only. Never add it to `.env.local`, git, or a `NEXT_PUBLIC_` variable. |
| `NEXT_PUBLIC_NFT_ADDRESS` | Browser; optional contract override (defaults to the deployed ClassNFT). |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | Browser Sepolia reads/writes; configure in Vercel. |
| `NEXT_PUBLIC_MAINNET_RPC_URL` | Browser ENS reads; configure in Vercel. |
| `NEXT_PUBLIC_IPFS_GATEWAY` | Browser; optional preferred IPFS gateway. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Browser; public VAPID key used to create push subscriptions. |
| `VAPID_PRIVATE_KEY` | Vercel server only; private VAPID key. |
| `VAPID_SUBJECT` | Vercel server only; VAPID contact URI such as `mailto:you@example.com`. |
| `PUSH_NOTIFY_SECRET` | Vercel server and listener; same secret protects `/api/push/send`. |
| `UPSTASH_REDIS_REST_URL` | Vercel server only; Upstash Redis REST URL for subscriptions. |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel server only; Upstash Redis REST token. |
| `SEPOLIA_RPC_URL` | Listener host/local `.env.local`; Sepolia RPC used by the standalone listener. |
| `TELEGRAM_BOT_TOKEN` | Listener host/local `.env.local`; keep private. |
| `TELEGRAM_CHAT_ID` | Listener host/local `.env.local`; destination for bot messages. |
| `APP_URL` | Listener host/local `.env.local`; deployed app origin, without a trailing slash. |
| `MAINNET_RPC_URL` | Optional listener mainnet RPC for ENS; falls back to `NEXT_PUBLIC_MAINNET_RPC_URL` or a public RPC. |

For Vercel, set the **Root Directory** to `frontend` and add the Vercel/server/browser values above in Project Settings → Environment Variables. Add secrets to Production (and Preview only if you need push there). `PIMLICO_API_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_NOTIFY_SECRET`, and the Upstash token must remain server-side; only the VAPID public key is intentionally public. Add listener variables to the environment of the separate Node process, not as Vercel build-time secrets.

In the Pimlico dashboard, configure a Sepolia sponsorship policy and budget limited to the ClassNFT mint action. The API proxy also restricts the allowed UserOperation target and calls; its per-IP sliding-window rate limit is in-memory and therefore best-effort per serverless instance.

## Why is the Pinata key in a server route?

Pinata's key can upload files to your account and consume your quota, so it must never be included in browser JavaScript. The `/api/upload` route uses the key on the server and returns only a public CID to the browser. If the variable used Next.js's `NEXT_PUBLIC_` prefix, Next.js would embed the key in the JavaScript sent to every visitor. Anyone could extract it and upload files against your account, so rotate it if it is exposed.

## Deploy on Vercel

1. Import this GitHub repo.
2. Root Directory: `frontend`.
3. Add env vars (values in the Vercel dashboard, not in git).
4. Add the server-side and public Web Push variables from the table above, create a Pimlico Sepolia sponsorship policy for ClassNFT minting, and redeploy.
5. Create a Telegram bot and Upstash database, set up the listener's separate environment, then start `npm run listener` on an always-on Node host.
6. Open the URL on a phone, connect a wallet, and visit `/activity`. Test **Enable background alerts** and mint from another wallet to verify page-open and push alerts.

### What would a real product do when the page is closed?

The in-page listener only runs while `/activity` is open and can miss mints while a user is away. This build adds an external always-on Node listener that catches up from persisted block state and sends each `Minted` event to Telegram and subscribed browsers through Web Push, with subscriptions stored in Upstash Redis. The service worker can display push notifications while the page is closed, while `/activity` remains the live feed when open.
