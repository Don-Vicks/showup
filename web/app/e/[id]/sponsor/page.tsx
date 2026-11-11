"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { txUrl } from "@/lib/config";
import { formatWhen } from "@/lib/format";
import { formatUsdc, getEvent, hostRecord, listEvents, parseUsdc, pledgeTransactions, type EventCard, type HostRecord } from "@/lib/near";
import { useWallet } from "@/lib/wallet";
import { Cover } from "../../../Cover";

export default function SponsorPage({ params }: { params: Promise<{ id: string }> }) {
  const eventId = Number(use(params).id);
  const { account, signIn, send, busy } = useWallet();
  const [event, setEvent] = useState<EventCard | null>(null);
  const [record, setRecord] = useState<HostRecord | null>(null);
  const [rate, setRate] = useState("2");
  const [cap, setCap] = useState("50");
  const [turnout, setTurnout] = useState<number | null>(null);
  const [provenOnly, setProvenOnly] = useState(false);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "working" } | { kind: "done"; tx: string | null } | { kind: "failed"; message: string }>({ kind: "idle" });

  useEffect(() => {
    getEvent(eventId).then(setEvent).catch(() => setEvent(null));
  }, [eventId, state.kind]);
  useEffect(() => {
    if (!event) return;
    listEvents().then((all) => hostRecord(event.host, all)).then(setRecord).catch(() => {});
  }, [event]);

  const capN = Math.max(0, Math.floor(Number(cap) || 0));
  let rateBase = 0n;
  try {
    rateBase = BigInt(parseUsdc(rate));
  } catch {}
  const total = rateBase * BigInt(capN);
  const maxTurnout = event ? Math.max(capN, event.tickets, 1) : capN;
  const guests = Math.min(turnout ?? Math.round((event?.tickets || capN) * 0.7), maxTurnout);
  const toHost = rateBase * BigInt(Math.min(guests, capN));
  const back = total - toHost;
  const ended = event ? Date.now() >= event.params.ends_at_ms : false;
  const mine = event && account ? event.pledges.filter((p) => p.sponsor === account) : [];

  const pledge = async () => {
    setState({ kind: "working" });
    try {
      const a = account ?? (await signIn());
      if (!a) return setState({ kind: "idle" });
      const tx = await send(pledgeTransactions(a, eventId, parseUsdc(rate), capN, provenOnly));
      setState({ kind: "done", tx });
    } catch (e) {
      setState({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="wrap page">
      <div className="stack" style={{ gap: 10 }}>
        <Link href="/sponsor" style={{ fontWeight: 700 }}>← All events looking for sponsors</Link>
        <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 56px)" }}>Sponsor {event?.params.title ?? `event ${eventId}`}</h1>
      </div>

      {event && (
        <section className="card shadow row" style={{ padding: 0, overflow: "hidden", alignItems: "stretch", gap: 0 }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <Cover event={event} details={event.details} height={210} />
          </div>
          <div className="stack" style={{ flex: "1 1 360px", padding: 22, gap: 10 }}>
            <span className="muted">{formatWhen(event.params.starts_at_ms)} · {event.params.venue}</span>
            <span>Hosted by <b>{event.details?.host_name || event.host}</b></span>
            {event.details?.description && <span style={{ lineHeight: 1.5 }}>{event.details.description.split("\n")[0]}</span>}
            <div className="row" style={{ gap: 8 }}>
              <span className="pill">{event.tickets}/{event.params.capacity} committed so far</span>
              <span className="pill">{record ? (record.hosted ? `${record.hosted} past events, ${record.verified} verified guests` : "First event by this host") : "Host record…"}</span>
              <span className="pill">{event.params.require_headcount ? "Crowd count required" : "No crowd count required"}</span>
            </div>
            <Link href={`/e/${eventId}`} style={{ fontWeight: 700 }}>Event page</Link>
          </div>
        </section>
      )}

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
              <span><b>Proven guests only.</b> Also checked in with a different host before. Harder to fake with friends.</span>
            </label>
          </fieldset>
          <button type="button" className="btn btn-primary" onClick={pledge} disabled={busy || state.kind === "working" || total === 0n || !event || event.cancelled || ended}>
            {state.kind === "working" ? "Confirm in your wallet…" : ended ? "This event has ended" : `Pledge up to ${formatUsdc(total)} USDC`}
          </button>
          {state.kind === "failed" && <p className="error" style={{ margin: 0 }}>{state.message}</p>}
          {state.kind === "done" && (
            <p className="ok" style={{ margin: 0 }}>
              Pledged. {state.tx && <a href={txUrl(state.tx)} target="_blank" rel="noreferrer">See the transaction</a>} · <Link href="/me#pledges">My pledges</Link>
            </p>
          )}
          {mine.length > 0 && (
            <span className="ok">You&apos;ve pledged here: {mine.map((p) => `${formatUsdc(p.rate)} × up to ${p.cap}${p.done ? `, paid ${formatUsdc(p.paid_to_host)} to the host` : ""}`).join("; ")}.</span>
          )}
        </section>

        <aside className="side-col stack">
          <div className="card block-tomato shadow stack" style={{ gap: 14 }}>
            <span className="h2" style={{ fontSize: 20 }}>What it costs you</span>
            <label className="stack" style={{ gap: 6, fontWeight: 700 }}>
              If {guests} {provenOnly ? "proven" : "verified"} guest{guests === 1 ? "" : "s"} check in
              <input type="range" min={0} max={maxTurnout} value={guests} onChange={(e) => setTurnout(Number(e.target.value))} aria-label="Expected verified guests" />
            </label>
            <div className="card stack" style={{ gap: 8, padding: 14 }}>
              <span className="row" style={{ justifyContent: "space-between" }}><span>Into the contract now</span><b className="mono">{formatUsdc(total)}</b></span>
              <span className="row" style={{ justifyContent: "space-between" }}><span>To the host, 48 h after</span><b className="mono">{formatUsdc(toHost)}</b></span>
              <span className="row" style={{ justifyContent: "space-between" }}><span>Back to you</span><b className="mono">{formatUsdc(back)}</b></span>
            </div>
            <span style={{ fontSize: 15, lineHeight: 1.5 }}>If check-ins run well above the crowd count, or no count was taken when one is required, the payout waits for your call in My pledges.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
