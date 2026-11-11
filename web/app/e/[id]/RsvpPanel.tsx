"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { txUrl } from "@/lib/config";
import { formatWhen } from "@/lib/format";
import { accountExists, call, findTicket, formatUsdc, rsvpTransactions, view, type ShowUpEvent } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

type Step = { kind: "idle" } | { kind: "working" } | { kind: "done"; tx: string | null } | { kind: "failed"; message: string };

export function RsvpPanel({ event, referrer }: { event: ShowUpEvent; referrer: string | null }) {
  const { account, signIn, send, busy } = useWallet();
  const [ticket, setTicket] = useState<string | null>(null);
  const [attended, setAttended] = useState(0);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [gifting, setGifting] = useState(false);
  const [friend, setFriend] = useState("");
  const [gift, setGift] = useState<Step | { kind: "given"; tx: string | null; ticket: string | null }>({ kind: "idle" });
  const p = event.params;
  const closed = event.cancelled || event.settled || Date.now() >= p.starts_at_ms || event.tickets >= p.capacity;
  const waiver = p.waive_after !== null && attended >= p.waive_after;

  useEffect(() => {
    if (!account) return setTicket(null);
    findTicket(event.id, account).then((t) => setTicket(t && t.status !== "Cancelled" ? t.token_id : null)).catch(() => {});
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

  const payForFriend = async () => {
    const guest = friend.trim().toLowerCase();
    setGift({ kind: "working" });
    try {
      if (!/^([a-z\d]+[-_.])*[a-z\d]+$/.test(guest) || guest.length < 2 || guest.length > 64) throw new Error("That isn't a NEAR account name.");
      if (!(await accountExists(guest))) throw new Error(`${guest} doesn't exist on NEAR ${process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet"}. Check the spelling.`);
      if (await findTicket(event.id, guest)) throw new Error(`${guest} already has a ticket for this event.`);
      const a = account ?? (await signIn());
      if (!a) return setGift({ kind: "idle" });
      const tx = await send(rsvpTransactions(a, event.id, p.deposit, referrer, guest));
      const t = await findTicket(event.id, guest).catch(() => null);
      setGift({ kind: "given", tx, ticket: t?.token_id ?? null });
      setFriend("");
    } catch (e) {
      setGift({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
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

      {!closed && (
        <div className="stack" style={{ gap: 10, borderTop: "2px dashed #111", paddingTop: 14 }}>
          {!gifting ? (
            <button type="button" className="btn btn-small" onClick={() => setGifting(true)}>Pay the deposit for someone else</button>
          ) : (
            <>
              <label className="field">
                Their NEAR account
                <input value={friend} onChange={(e) => setFriend(e.target.value)} placeholder="friend.testnet" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
              </label>
              <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>The ticket is theirs. They check in from their own phone, and the deposit goes back to them, not to you.</span>
              <button type="button" className="btn btn-dark" onClick={payForFriend} disabled={busy || gift.kind === "working" || !friend.trim()}>
                {gift.kind === "working" ? "Confirm in your wallet…" : `Pay ${formatUsdc(p.deposit)} USDC for them`}
              </button>
            </>
          )}
          {gift.kind === "failed" && <p className="error" style={{ margin: 0 }}>{gift.message}</p>}
          {gift.kind === "given" && (
            <p className="ok" style={{ margin: 0 }}>
              Done: they have a ticket.{" "}
              {gift.ticket && <Link href={`/t/${gift.ticket}`}>Send them ticket #{gift.ticket}</Link>}{" "}
              {gift.tx && <a href={txUrl(gift.tx)} target="_blank" rel="noreferrer">Transaction</a>}
            </p>
          )}
        </div>
      )}

      <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
        Cancel before {formatWhen(p.cancel_cutoff_ms)} for a full refund, or pass your ticket to a friend until doors open.
      </span>
    </div>
  );
}
