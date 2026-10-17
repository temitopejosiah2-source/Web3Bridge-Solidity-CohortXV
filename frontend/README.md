# Mintroom — Day 3 and Day 4 dApp

Mintroom looks up `.eth` names, pins artwork through Pinata (IPFS), mints ClassNFTs on Sepolia, shows a live Chainlink ETH/USD price, batches two mints through an ERC-4337 smart account with Pimlico, and alerts on new contract mints.

**Live:** [https://mintroom.vercel.app](https://mintroom.vercel.app)
The live app runs on Sepolia. `PINATA_JWT` and `PIMLICO_API_KEY` must be set in the Mintroom Vercel project's Production environment. The Pimlico key is only read by the server-side `/api/pimlico` proxy; it must never be put in `.env.local`, committed, or exposed as a `NEXT_PUBLIC_` variable.

## What it does

- **ENS:** a `.eth` box on the home page, plus every address shown as its primary ENS name when it has one (names are read from mainnet).
- **IPFS:** files go to `/api/upload` on the server, which pins them with Pinata. The `ipfs://` URI is stored on-chain, and the gallery loads the image back through an IPFS HTTP gateway. IPFS content is public and permanent, so don’t upload private media.
- **Chainlink:** Sepolia ETH/USD feed `0x694AA1769357215DE4FAC081bf1f309aDC325306`, polled on its own, with how old the round is. Each NFT card shows the live USD reference value of 1 ETH; the mint form estimates and reports the network fee in USD. ClassNFT mints are free and have no market price.
- **Smart-account batch:** on the Gallery page, select an image and choose **Gasless batch · mint twice**. The connected wallet signs one ERC-4337 UserOperation from a counterfactual Simple Smart Account; it calls `ClassNFT.mint` twice with the same metadata URI. UserOperation fees come from Pimlico's Sepolia gas-price API, and the server requests paymaster sponsorship. Sponsorship depends on the Pimlico Sepolia paymaster being funded and its policy allowing this contract and call.
- **Live alerts:** open [/activity](https://mintroom.vercel.app/activity) to load recent `Minted` events and poll for new ones while the page remains open. Enable browser notifications with the button on that page; event recipients are resolved to ENS names when available.

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
| `PINATA_JWT` | **Server only** (`frontend/.env.local` and Vercel env). Never `NEXT_PUBLIC_`. |
| `PIMLICO_API_KEY` | **Vercel Production only**. Never add it to `.env.local`, git, or a `NEXT_PUBLIC_` variable; `/api/pimlico` proxies the allowed Sepolia UserOperation RPC calls. |
| `NEXT_PUBLIC_NFT_ADDRESS` | Browser — optional override; defaults to the deployed ClassNFT on Sepolia |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | Browser — reads/writes on Sepolia |
| `NEXT_PUBLIC_MAINNET_RPC_URL` | Browser — ENS reads |
| `NEXT_PUBLIC_IPFS_GATEWAY` | Browser — optional preferred gateway for reading IPFS content |

For local development, put these values in `frontend/.env.local` (not under `src/`). On Vercel, set the **Root Directory** to `frontend` and add the required names in Project Settings → Environment Variables.

Do not add `PIMLICO_API_KEY` to the local environment file. Configure it only in Vercel's Production environment, then redeploy. In the Pimlico dashboard, configure a Sepolia sponsorship policy and budget limited to the ClassNFT mint action; this prevents the public API proxy from sponsoring arbitrary operations.

## Why is the Pinata key in a server route?

Pinata's key can upload files to your account and consume your quota, so it must never be included in browser JavaScript. The `/api/upload` route uses the key on the server and returns only a public CID to the browser. If the variable used Next.js's `NEXT_PUBLIC_` prefix, Next.js would embed the key in the JavaScript sent to every visitor. Anyone could extract it and upload files against your account, so rotate it if it is exposed.

## Deploy on Vercel

1. Import this GitHub repo.
2. Root Directory: `frontend`.
3. Add env vars (values in the Vercel dashboard, not in git).
4. Set `PIMLICO_API_KEY` only in the Vercel Production environment, create a Pimlico Sepolia sponsorship policy for the ClassNFT mint, and redeploy. Confirm a successful two-mint batch, then add its Etherscan transaction link above.
5. Open the URL on a phone, connect a detected browser wallet, look up `vitalik.eth`, mint a picture, confirm it appears from IPFS, and wait for the price line to tick. Visit `/activity`, enable browser notifications, and mint from another wallet to see the alert.

### What a production alert system would do

The browser listener is only alive while the Activity page is open, so it can miss events while a user is offline. A real product would run a durable backend indexer or event worker continuously, persist its last processed block and deduplicate by transaction hash and log index, then queue delivery. It would send notifications through Web Push (with a service worker and user consent), email, or an in-app inbox, while the page reads the persisted event feed.
