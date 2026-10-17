import { normalize } from "viem/ens";

/** Turns "Vitalik.ETH" into "vitalik.eth". Returns undefined if the name is invalid. */
export function safeNormalize(input: string) {
  try {
    const name = input ? normalize(input) : undefined;
    return name?.toLowerCase().endsWith(".eth") ? name : undefined;
  } catch {
    return undefined;
  }
}
