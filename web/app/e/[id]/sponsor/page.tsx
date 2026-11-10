"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { txUrl } from "@/lib/config";
import { formatUsdc, parseUsdc, pledgeTransactions, view, type ShowUpEvent } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

export default function SponsorPage({ params }: { params: Promise<{ id: string }> }) {
  const eventId = Number(use(params).id);
  const { account, signIn, send, busy } = useWallet();
  const [event, setEvent] = useState<ShowUpEvent | null>(null);
  const [rate, setRate] = useState("2");
  const [cap, setCap] = useState("100");
  const [provenOnly, setProvenOnly] = useState(false);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "working" } | { kind: "done"; tx: string | null } | { kind: "failed"; message: string }>({ kind: "idle" });

  useEffect(() => {
    view<ShowUpEvent | null>("get_event", { event_id: eventId }).then(setEvent).catch(() => setEvent(null));
  }, [eventId, state.kind]);

  let total = "0";
  try {
    total = (BigInt(parseUsdc(rate)) * BigInt(Number(cap) || 0)).toString();
  } catch {}

  const pledge = async () => {
    setState({ kind: "working" });
    try {
      const a = account ?? (await signIn());
      if (!a) return setState({ kind: "idle" });
      const tx = await send(pledgeTransactions(a, eventId, parseUsdc(rate), Number(cap), provenOnly));
      setState({ kind: "done", tx });
    } catch (e) {
      setState({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="wrap page">
      <div className="stack" style={{ gap: 10 }}>
        <span className="eyebrow">Sponsor · {event?.params.title ?? `Event ${eventId}`}</span>
        <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 60px)" }}>Pay for people, not promises.</h1>
      </div>
      <div className="split">
        <section className="main-col card shadow-lg stack" style={{ gap: 18 }}>
          <div className="fields">
            <label className="field">Per verified guest (USDC)<input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="mono" /></label>
            <label className="field">Up to (guests)<input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" className="mono" /></label>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
            <legend style={{ fontWeight: 700, marginBottom: 10 }}>Count</legend>
            <label className="choice" data-on={!provenOnly}>
              <input type="radio" name="count" checked={!provenOnly} onChange={() => setProvenOnly(false)} />
              <span><b>Every verified check-in.</b> The guest scanned the door screen with their own phone.</span>
            </label>
            <label className="choice" data-on={provenOnly}>
              <input type="radio" name="count" checked={provenOnly} onChange={() => setProvenOnly(true)} />
              <span><b>Proven guests only.</b> Also checked in with a different host before.</span>
            </label>
          </fieldset>
          <button type="button" className="btn btn-primary" onClick={pledge} disabled={busy || state.kind === "working" || total === "0" || !event || event.cancelled}>
            {state.kind === "working" ? "Confirm in your wallet…" : `Pledge up to ${formatUsdc(total)} USDC`}
          </button>
          {state.kind === "failed" && <p className="error" style={{ margin: 0 }}>{state.message}</p>}
          {state.kind === "done" && (
            <p className="ok" style={{ margin: 0 }}>
              Pledged. {state.tx && <a href={txUrl(state.tx)} target="_blank" rel="noreferrer">See the transaction</a>} · <Link href={`/e/${eventId}`}>Back to the event</Link>
            </p>
          )}
          <span className="muted">Held by the ShowUp contract. Anything not earned comes back to you on its own.</span>
        </section>
        <aside className="side-col stack">
          <div className="card block-tomato shadow stack">
            <span className="h2" style={{ fontSize: 20 }}>How the money moves</span>
            <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.5 }} className="stack">
              <li>Guests check in by scanning the door screen</li>
              <li>48 hours after the event, the host gets {rate} USDC per verified guest</li>
              <li>The rest comes back to you</li>
            </ol>
            <span className="card" style={{ padding: 12, fontSize: 15 }}>If check-ins run well above the crowd count, or no count was taken, the payout waits for your call.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
