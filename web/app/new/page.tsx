"use client";

import Link from "next/link";
import { useState } from "react";
import { CONTRACT, txUrl } from "@/lib/config";
import { DETAILS_DEPOSIT, call, parseAgenda, parseUsdc, view, type NoShowRule } from "@/lib/near";
import { useWallet } from "@/lib/wallet";
import { DetailsFields, EMPTY_DETAILS, type DetailsDraft } from "../DetailsFields";

const toLocalInput = (ms: number) => {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

export default function NewEvent() {
  const { send, busy } = useWallet();
  const inAWeek = Date.now() + 7 * 24 * 3600_000;
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [starts, setStarts] = useState(toLocalInput(inAWeek));
  const [hours, setHours] = useState("3");
  const [capacity, setCapacity] = useState("100");
  const [deposit, setDeposit] = useState("1.00");
  const [rule, setRule] = useState<NoShowRule>("SplitAmongAttendees");
  const [waiver, setWaiver] = useState(true);
  const [details, setDetails] = useState<DetailsDraft>(EMPTY_DETAILS);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "working" } | { kind: "done"; id: number; tx: string | null } | { kind: "failed"; message: string }>({ kind: "idle" });

  const publish = async () => {
    setState({ kind: "working" });
    try {
      const startsMs = new Date(starts).getTime();
      const endsMs = startsMs + Math.round(Number(hours) * 3600_000);
      if (!title.trim()) throw new Error("Give the event a title.");
      if (!(startsMs > Date.now())) throw new Error("The start must be in the future.");
      const params = {
        title: title.trim(),
        venue: venue.trim(),
        starts_at_ms: startsMs,
        ends_at_ms: endsMs,
        capacity: Number(capacity),
        deposit: parseUsdc(deposit),
        cancel_cutoff_ms: startsMs - 24 * 3600_000 > Date.now() ? startsMs - 24 * 3600_000 : startsMs,
        no_show_rule: rule,
        waive_after: waiver ? 3 : null,
        flag_pct: 20,
        flag_abs: 5,
        require_headcount: true,
      };
      const cover = details.coverUrl.trim();
      if (cover && !cover.startsWith("https://")) throw new Error("The cover link must start with https://");
      const eventDetails = {
        host_name: details.hostName.trim(),
        description: details.description.trim(),
        cover_url: cover || null,
        agenda: parseAgenda(details.agenda),
      };
      const tx = await send([call("create_event_with_details", { params, details: eventDetails }, DETAILS_DEPOSIT, 80)]);
      const id = await view<number>("last_event_id");
      setState({ kind: "done", id, tx });
    } catch (e) {
      setState({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (state.kind === "done") {
    return (
      <main className="wrap page">
        <h1 className="display h1">It&apos;s live.</h1>
        <p style={{ fontSize: 19 }}>Share the event page. Before doors open, set up the door screen from the same account.</p>
        <div className="row">
          <Link href={`/e/${state.id}`} className="btn btn-primary">Open the event page</Link>
          <Link href={`/e/${state.id}/door`} className="btn">Set up the door</Link>
          {state.tx && <a href={txUrl(state.tx)} target="_blank" rel="noreferrer">See the transaction</a>}
        </div>
      </main>
    );
  }

  return (
    <main className="wrap page">
      <h1 className="display h1" style={{ fontSize: "clamp(34px, 5vw, 56px)" }}>Host an event</h1>
      {!CONTRACT && <p className="error">The ShowUp contract isn&apos;t deployed yet, so events can&apos;t be published.</p>}
      <div className="split">
        <div className="main-col stack" style={{ gap: 22 }}>
          <section className="card stack">
            <h2 className="h2" style={{ fontSize: 20 }}>The event</h2>
            <label className="field">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Builders Night" /></label>
            <div className="fields">
              <label className="field">Starts<input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} /></label>
              <label className="field">Hours<input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
              <label className="field">Capacity<input inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></label>
            </div>
            <label className="field">Venue<input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue, area, city" /></label>
          </section>

          <section className="card stack">
            <h2 className="h2" style={{ fontSize: 20 }}>Tell people about it</h2>
            <DetailsFields value={details} onChange={setDetails} />
          </section>

          <section className="card stack">
            <h2 className="h2" style={{ fontSize: 20 }}>The commitment</h2>
            <label className="field">Deposit (USDC)<input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="mono" /></label>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
              <legend style={{ fontWeight: 700, marginBottom: 10 }}>No-show deposits go to</legend>
              <label className="choice" data-on={rule === "SplitAmongAttendees"}>
                <input type="radio" name="rule" checked={rule === "SplitAmongAttendees"} onChange={() => setRule("SplitAmongAttendees")} />
                <span><b>The guests who came</b>, split equally. The best reason to show up.</span>
              </label>
              <label className="choice" data-on={rule === "ToHost"}>
                <input type="radio" name="rule" checked={rule === "ToHost"} onChange={() => setRule("ToHost")} />
                <span><b>Me, the host</b>, to cover food and seats for people who didn&apos;t come.</span>
              </label>
            </fieldset>
            <label className="row" style={{ fontSize: 16 }}>
              <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} /> Proven guests (3+ check-ins) RSVP free
            </label>
          </section>
        </div>

        <aside className="side-col stack">
          <div className="card block-ink stack" style={{ boxShadow: "6px 6px 0 #1f4bff" }}>
            <span className="eyebrow">Locked when you publish</span>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }} className="stack">
              <li>Deposits sit in the ShowUp contract, not with you</li>
              <li>Each guest gets theirs back at check-in</li>
              <li>Sponsor money reaches you 48 hours after, per verified guest</li>
              <li>No withdraw button, for anyone</li>
            </ul>
          </div>
          <button type="button" className="btn btn-primary" onClick={publish} disabled={!CONTRACT || busy || state.kind === "working"}>
            {state.kind === "working" ? "Confirm in your wallet…" : "Publish event"}
          </button>
          {state.kind === "failed" && <p className="error">{state.message}</p>}
          <span className="muted" style={{ fontSize: 14 }}>Your wallet asks for 0.06 NEAR to store the description on chain. What isn&apos;t used comes straight back.</span>
        </aside>
      </div>
    </main>
  );
}
