"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { txUrl } from "@/lib/config";
import { formatWhen } from "@/lib/format";
import { call, formatUsdc, rsvpTransactions, view, type ShowUpEvent } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

type Step = { kind: "idle" } | { kind: "working" } | { kind: "done"; tx: string | null } | { kind: "failed"; message: string };

export function RsvpPanel({ event, referrer }: { event: ShowUpEvent; referrer: string | null }) {
  const { account, signIn, send, busy } = useWallet();
  const [ticket, setTicket] = useState<string | null>(null);
  const [attended, setAttended] = useState(0);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const p = event.params;
  const closed = event.cancelled || event.settled || Date.now() >= p.starts_at_ms || event.tickets >= p.capacity;
  const waiver = p.waive_after !== null && attended >= p.waive_after;

  useEffect(() => {
    if (!account) return setTicket(null);
    view<string | null>("ticket_for", { event_id: event.id, account_id: account }).then(setTicket).catch(() => {});
    view<number>("attended_count", { account_id: account }).then(setAttended).catch(() => {});
  }, [account, event.id, step]);

  const rsvp = async () => {
    setStep({ kind: "working" });
    try {
      const a = account ?? (await signIn());
      if (!a) return setStep({ kind: "idle" });
      const txs = waiver ? [call("rsvp_waived", { event_id: event.id, referrer })] : rsvpTransactions(a, event.id, p.deposit, referrer);
      const tx = await send(txs);
      setStep({ kind: "done", tx });
    } catch (e) {
      setStep({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="card shadow-lg stack" style={{ gap: 18, borderRadius: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="h2" style={{ fontSize: 22 }}>RSVP</span>
        <span className="mono" style={{ fontSize: 20 }}>{waiver ? "Free for you" : `${formatUsdc(p.deposit)} USDC`}</span>
      </div>

      {ticket ? (
        <>
          <p className="ok" style={{ margin: 0 }}>You&apos;re in. Your ticket holds your deposit until you check in.</p>
          <Link href={`/t/${ticket}`} className="btn btn-primary">Open your ticket</Link>
        </>
      ) : (
        <>
          <div className="stack" style={{ gap: 8, fontSize: 15 }}>
            <span>Pay with <b>USDC on NEAR</b>. Paying from another chain through NEAR Intents arrives with the mainnet launch.</span>
            {waiver && <span className="ok">Your attendance record waives the deposit here.</span>}
          </div>
          <button type="button" className="btn btn-primary" onClick={rsvp} disabled={closed || busy || step.kind === "working"}>
            {closed ? "RSVPs are closed" : step.kind === "working" ? "Confirm in your wallet…" : waiver ? "RSVP free" : "Commit and RSVP"}
          </button>
          {step.kind === "failed" && <p className="error" style={{ margin: 0 }}>{step.message}</p>}
          {step.kind === "done" && (
            <p className="ok" style={{ margin: 0 }}>
              Done. {step.tx && <a href={txUrl(step.tx)} target="_blank" rel="noreferrer">See the transaction</a>}
            </p>
          )}
        </>
      )}

      <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
        Cancel before {formatWhen(p.cancel_cutoff_ms)} for a full refund, or pass your ticket to a friend until doors open.
      </span>
    </div>
  );
}
