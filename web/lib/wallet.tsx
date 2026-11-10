"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NETWORK, RPC_URL } from "./config";
import type { WalletTransaction } from "./near";

type Connector = import("@hot-labs/near-connect").NearConnector;
type Wallet = Awaited<ReturnType<Connector["connect"]>>;

interface WalletState {
  account: string | null;
  busy: boolean;
  signIn: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Signs and sends transactions in order; returns the hash of the last one. */
  send: (txs: WalletTransaction[]) => Promise<string | null>;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<Promise<Connector> | null>(null);
  const wallet = useRef<Wallet | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ensure = useCallback(() => {
    connector.current ??= import("@hot-labs/near-connect").then(
      ({ NearConnector }) => new NearConnector({ network: NETWORK, providers: { [NETWORK]: [RPC_URL] } as never }),
    );
    return connector.current;
  }, []);

  // Restore a wallet the browser already connected.
  useEffect(() => {
    let live = true;
    ensure()
      .then(async (c) => {
        const w = await c.wallet().catch(() => null);
        if (!w || !live) return;
        wallet.current = w;
        const a = (await w.getAccounts({ network: NETWORK }))[0]?.accountId ?? null;
        if (live) setAccount(a);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [ensure]);

  const signIn = useCallback(async () => {
    setBusy(true);
    try {
      const c = await ensure();
      const w = await c.connect();
      wallet.current = w;
      const a = (await w.getAccounts({ network: NETWORK }))[0]?.accountId ?? null;
      setAccount(a);
      return a;
    } finally {
      setBusy(false);
    }
  }, [ensure]);

  const signOut = useCallback(async () => {
    const c = await connector.current?.catch(() => null);
    await c?.disconnect().catch(() => {});
    wallet.current = null;
    setAccount(null);
  }, []);

  const send = useCallback(
    async (txs: WalletTransaction[]) => {
      let a = account;
      if (!wallet.current || !a) a = await signIn();
      if (!wallet.current || !a) throw new Error("Sign in first.");
      setBusy(true);
      try {
        type Params = Parameters<Wallet["signAndSendTransactions"]>[0];
        const outcomes = (await wallet.current.signAndSendTransactions({
          network: NETWORK,
          signerId: a,
          transactions: txs as unknown as Params["transactions"],
        })) as { status?: unknown; transaction_outcome?: { id?: string }; transaction?: { hash?: string } }[];
        const failed = outcomes.find((o) => typeof o.status === "object" && o.status !== null && "Failure" in o.status);
        if (failed) throw new Error(readFailure((failed.status as { Failure: unknown }).Failure));
        const last = outcomes[outcomes.length - 1];
        return last?.transaction_outcome?.id ?? last?.transaction?.hash ?? null;
      } finally {
        setBusy(false);
      }
    },
    [account, signIn],
  );

  return <Ctx.Provider value={{ account, busy, signIn, signOut, send }}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside WalletProvider");
  return v;
}

/** The contract's own panic message, if there is one, else the raw failure. */
function readFailure(failure: unknown): string {
  const text = JSON.stringify(failure);
  const m = text.match(/Smart contract panicked: ([^"\\]+)/);
  return m ? m[1] : text.slice(0, 200);
}
