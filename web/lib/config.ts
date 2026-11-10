/** Everything that differs between NEAR testnet and mainnet, in one place. */

export type Network = "testnet" | "mainnet";

export const NETWORK: Network = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";

const CONFIG = {
  testnet: {
    rpcUrl: "https://test.rpc.fastnear.com",
    // Circle USDC on NEAR testnet (NEP-141, 6 decimals).
    usdc: "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
    explorer: "https://testnet.nearblocks.io",
  },
  mainnet: {
    rpcUrl: "https://free.rpc.fastnear.com",
    usdc: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    explorer: "https://nearblocks.io",
  },
} as const;

export const RPC_URL = CONFIG[NETWORK].rpcUrl;
export const USDC = CONFIG[NETWORK].usdc;
export const EXPLORER = CONFIG[NETWORK].explorer;

/** The ShowUp contract. Empty until it is deployed; pages say so instead of failing. */
export const CONTRACT = process.env.NEXT_PUBLIC_SHOWUP_CONTRACT ?? "";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (account: string) => `${EXPLORER}/address/${account}`;
