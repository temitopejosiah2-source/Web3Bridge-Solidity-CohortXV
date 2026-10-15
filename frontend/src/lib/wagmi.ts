import { http, createConfig, injected } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";

// The settings of our whole app, in one object.
export const config = createConfig({
  // 1. The networks our app knows: Sepolia (to write) and mainnet (to read ENS names)
  chains: [sepolia, mainnet],

  // 2. How to connect a wallet: "injected" = the wallet extension in the browser (MetaMask, Rabby)
  connectors: [injected()],

  // 3. Where to READ each network from (an RPC URL). Writing always goes through the wallet.
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
    [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
  },

  // 4. Next.js first draws pages on the server, where there is no wallet. This makes that safe.
  ssr: true,
});

// Gives every wagmi hook full TypeScript autocomplete for OUR config
declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
