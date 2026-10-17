// The deployed ClassNFT on Sepolia. A valid public env value can override it.
const DEFAULT_NFT_ADDRESS = "0xf311E4EA522D00103c1d180115CF5aD53FF0f9C2" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const rawNftAddress = process.env.NEXT_PUBLIC_NFT_ADDRESS?.trim() ?? "";
const validNftAddress = /^0x[a-fA-F0-9]{40}$/.test(rawNftAddress);

export const nftConfigured = rawNftAddress ? validNftAddress : true;
export const NFT_ADDRESS = (
  validNftAddress ? rawNftAddress : rawNftAddress ? ZERO_ADDRESS : DEFAULT_NFT_ADDRESS
) as `0x${string}`;

// Only the parts of the ABI we use: two functions to read, one to write, one event
export const nftAbi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "uri", type: "string" }], outputs: [{ name: "tokenId", type: "uint256" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "totalMinted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "Minted",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "uri", type: "string", indexed: false },
    ],
  },
] as const;

// Browsers cannot open ipfs:// links. A gateway is a normal website that fetches IPFS files for us.
const GATEWAYS = ["https://gateway.pinata.cloud", process.env.NEXT_PUBLIC_IPFS_GATEWAY, "https://dweb.link", "https://ipfs.io"]
  .filter((g): g is string => Boolean(g))
  .map((g) => g.replace(/\/+$/, ""));

export const ipfsGatewayCount = GATEWAYS.length;

export function ipfsToHttp(uri: string, attempt = 0) {
  const gateway = GATEWAYS[attempt % GATEWAYS.length];
  if (!gateway) throw new Error("No IPFS gateway is configured.");
  if (/^https?:\/\//i.test(uri)) return uri;

  const path = uri
    .replace(/^ipfs:\/\//i, "")
    .replace(/^\/?ipfs\//i, "")
    .replace(/^\/+/, "");
  return `${gateway}/ipfs/${path}`;
}