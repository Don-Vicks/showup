"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { txUrl } from "@/lib/config";
import { formatWhen } from "@/lib/format";
import { call, formatUsdc, listEvents, listPrograms, statusLabel, view, type EventCard, type Program, type Report, type TicketView } from "@/lib/near";
import { useWallet } from "@/lib/wallet";
import { EventTile } from "../EventTile";

interface Delays {
  settle_ms: number;
  release_ms: number;
  decide_ms: number;
}

interface Data {
  events: EventCard[];
  reports: Record<number, Report>;
  tickets: { ticket: TicketView; event: EventCard }[];
  programs: Program[];
  owed: string;
  delays: Delays;
}

export default function Me() {
  const { account, signIn, send, busy } = useWallet();
  const [data, setData] = useState<Data | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string; tx?: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!account) return;
    const [events, programs, owed, delays] = await Promise.all([listEvents(), listPrograms().catch(() => []), view<string>("owed", { account_id: account }), view<Delays>("delays")]);
    const mineIds = events.filter((e) => e.host === account || e.pledges.some((p) => p.sponsor === account)).map((e) => e.id);
    const reports = Object.fromEntries(await Promise.all(mineIds.map(async (id) => [id, await view<Report>("report", { event_id: id })] as const)));
    const tokenIds = await Promise.all(events.map((e) => view<string | null>("ticket_for", { event_id: e.id, account_id: account }).catch(() => null)));
    const tickets = (
      await Promise.all(
        tokenIds.map(async (t, i) => {
          if (!t) return null;
          const ticket = await view<TicketView | null>("get_ticket", { token_id: t });
          return ticket && ticket.owner === account ? { ticket, event: events[i] } : null;
        }),
      )
    ).filter((x): x is { ticket: TicketView; event: EventCard } => x !== null);
    setData({ events, reports, tickets, programs: programs.filter((p) => p.owner === account), owed, delays });
  }, [account]);

  useEffect(() => {
    load().catch(() => setNote({ ok: false, text: "Couldn't read from NEAR right now." }));
  }, [load]);

  const run = async (label: string, txs: Parameters<typeof send>[0]) => {
    setNote(null);
    try {
      const tx = await send(txs);
      setNote({ ok: true, text: label, tx });
      await load();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!account) {
    return (
      <main className="wrap page">
        <h1 className="display h1" style={{ fontSize: "clamp(34px, 5vw, 60px)" }}>My ShowUp</h1>
        <p style={{ fontSize: 19 }}>Your tickets, the events you host and the events you sponsor, in one place.</p>
        <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start" }} onClick={() => signIn()} disabled={busy}>Sign in with a NEAR wallet</button>
      </main>
    );
  }

  const now = Date.now();
  const hosting = data?.events.filter((e) => e.host === account) ?? [];
  const pledges = data?.events.flatMap((e) => e.pledges.map((p, index) => ({ e, p, index })).filter((x) => x.p.sponsor === account)) ?? [];

  return (
    <main className="wrap page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow mono">{account}</span>
          <h1 className="display h1" style={{ fontSize: "clamp(34px, 5vw, 60px)" }}>My ShowUp</h1>
        </div>
        <nav className="tabs" aria-label="Sections">
          <a href="#tickets">Tickets</a>
          <a href="#hosting">Hosting</a>
          <a href="#pledges">Pledges</a>
          <a href="#programs">Programs</a>
        </nav>
      </div>

      {note && (
        <p className={note.ok ? "ok" : "error"} style={{ margin: 0 }}>
          {note.text} {note.tx && <a href={txUrl(note.tx)} target="_blank" rel="noreferrer">Transaction</a>}
        </p>
      )}
      {!data && <p className="muted">Reading your events from NEAR…</p>}

      {data && BigInt(data.owed) > 0n && (
        <section className="card block-cobalt shadow row" style={{ justifyContent: "space-between" }}>
          <span style={{ fontSize: 18 }}><b className="mono">{formatUsdc(data.owed, 6)} USDC</b> is waiting for you in the contract.</span>
          <button type="button" className="btn" disabled={busy} onClick={() => run("Paid to your wallet.", [call("withdraw", {}, "0", 50)])}>Withdraw</button>
        </section>
      )}

      {data && (
        <>
          <section id="tickets" className="stack" style={{ gap: 14, scrollMarginTop: 24 }}>
            <h2 className="h2" style={{ fontSize: 26 }}>My tickets</h2>
            {data.tickets.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No tickets yet. <Link href="/#events">Find an event.</Link></p>
            ) : (
              <div className="grid">
                {data.tickets.map(({ ticket, event }) => (
                  <Link key={ticket.token_id} href={`/t/${ticket.token_id}`} className="card shadow stack" style={{ gap: 8, color: "#111", textDecoration: "none" }}>
                    <span className="mono" style={{ fontSize: 13 }}>TICKET #{ticket.token_id}</span>
                    <b className="display" style={{ fontSize: 19 }}>{event.params.title}</b>
                    <span className="muted">{formatWhen(event.params.starts_at_ms)}</span>
                    <span className="pill" style={{ alignSelf: "flex-start" }}>{statusLabel(ticket.status)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section id="hosting" className="stack" style={{ gap: 14, scrollMarginTop: 24 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="h2" style={{ fontSize: 26 }}>Events I host</h2>
              <Link href="/new" className="btn btn-small">Host an event</Link>
            </div>
            {hosting.length === 0 && <p className="muted" style={{ margin: 0 }}>None yet.</p>}
            <div className="grid">
              {hosting.map((e) => {
                const r = data.reports[e.id];
                const ended = now >= e.params.ends_at_ms;
                const canSettle = ended && !e.settled && !e.cancelled && now >= e.params.ends_at_ms + data.delays.settle_ms;
                const pending = e.pledges.some((p) => !p.done) || e.programs.some((l) => l.approved && !l.done);
                const releaseAt = e.params.ends_at_ms + data.delays.release_ms;
                return (
                  <EventTile
                    key={e.id}
                    event={e}
                    footer={
                      <div className="stack" style={{ gap: 10, width: "100%" }}>
                        {r && <span className="muted" style={{ fontSize: 14 }}>{r.committed} committed · {r.checked_in} checked in · {r.verified} by phone{ended ? ` · ${r.no_shows} no-shows` : ""}</span>}
                        <div className="row" style={{ gap: 8 }}>
                          {!ended && <Link href={`/e/${e.id}/door`} className="btn btn-small btn-dark">Door screen</Link>}
                          <Link href={`/e/${e.id}/report`} className="btn btn-small">Report</Link>
                          <Link href={`/e/${e.id}/edit`} className="btn btn-small">Edit</Link>
                          {!ended && <Link href={`/programs?event=${e.id}`} className="btn btn-small">Apply for a bounty</Link>}
                        </div>
                        {canSettle && (
                          <button type="button" className="btn btn-hot" disabled={busy} onClick={async () => {
                            const holders = (await view<TicketView[]>("get_tickets", { event_id: e.id })).map((t) => t.owner);
                            await run("Settled and paid out.", [call("settle", { event_id: e.id }, "0", 150), call("withdraw_for", { accounts: [...new Set([e.host, ...holders])].slice(0, 20) }, "0", 250)]);
                          }}>Settle the no-shows</button>
                        )}
                        {ended && pending && (now >= releaseAt ? (
                          <button type="button" className="btn btn-hot" disabled={busy} onClick={() => run("Sponsor money released.", [call("release_sponsors", { event_id: e.id }, "0", 150), call("withdraw_for", { accounts: [e.host, ...e.pledges.map((p) => p.sponsor)].slice(0, 20) }, "0", 200)])}>Release sponsor money</button>
                        ) : (
                          <span className="muted" style={{ fontSize: 14 }}>Sponsor money releases {formatWhen(releaseAt)}.</span>
                        ))}
                      </div>
                    }
                  />
                );
              })}
            </div>
          </section>

          <section id="pledges" className="stack" style={{ gap: 14, scrollMarginTop: 24 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="h2" style={{ fontSize: 26 }}>Events I sponsor</h2>
              <Link href="/sponsor" className="btn btn-small">Sponsor an event</Link>
            </div>
            {pledges.length === 0 && <p className="muted" style={{ margin: 0 }}>No pledges yet.</p>}
            {pledges.length > 0 && (
              <div className="card scroll-x" style={{ padding: 0 }}>
                <table>
                  <thead><tr><th>Event</th><th>Pledge</th><th>Counted so far</th><th>Status</th></tr></thead>
                  <tbody>
                    {pledges.map(({ e, p, index }) => {
                      const r = data.reports[e.id];
                      const counted = r ? (p.proven_only ? r.proven : r.verified) : 0;
                      const releaseAt = e.params.ends_at_ms + data.delays.release_ms;
                      const total = BigInt(p.rate) * BigInt(p.cap);
                      const waiting = !p.done && r?.flagged && now >= releaseAt;
                      return (
                        <tr key={`${e.id}-${index}`}>
                          <td><Link href={`/e/${e.id}/report`}>{e.params.title}</Link><br /><span className="muted" style={{ fontSize: 14 }}>{formatWhen(e.params.starts_at_ms)}</span></td>
                          <td className="mono">{formatUsdc(p.rate)} × up to {p.cap}{p.proven_only ? " (proven)" : ""}</td>
                          <td>{counted}{r?.flagged && now >= e.params.ends_at_ms ? " · flagged" : ""}</td>
                          <td>
                            {p.done ? (
                              <>Paid {formatUsdc(p.paid_to_host)} to the host, {formatUsdc((total - BigInt(p.paid_to_host)).toString())} back to you</>
                            ) : waiting ? (
                              <span className="stack" style={{ gap: 8 }}>
                                <b>Check-ins look high against the crowd count. Your call:</b>
                                <span className="row" style={{ gap: 8 }}>
                                  <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => run("Approved: the host is paid.", [call("sponsor_decide", { event_id: e.id, pledge_index: index, approve: true }, "0", 150), call("withdraw_for", { accounts: [e.host, account] }, "0", 100)])}>Pay the host</button>
                                  <button type="button" className="btn btn-small" disabled={busy} onClick={() => run("Refused: your pledge comes back.", [call("sponsor_decide", { event_id: e.id, pledge_index: index, approve: false }, "0", 150), call("withdraw_for", { accounts: [account] }, "0", 100)])}>Refuse</button>
                                </span>
                              </span>
                            ) : (
                              <>Held in the contract until {formatWhen(releaseAt)}</>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="programs" className="stack" style={{ gap: 14, scrollMarginTop: 24 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 className="h2" style={{ fontSize: 26 }}>My bounty programs</h2>
              <Link href="/programs/new" className="btn btn-small">Start a program</Link>
            </div>
            {data.programs.length === 0 && <p className="muted" style={{ margin: 0 }}>None yet. A program pays per verified guest across many events, for example every Rust meetup in a city.</p>}
            <div className="grid">
              {data.programs.map((p) => (
                <Link key={p.id} href={`/programs/${p.id}`} className="card shadow stack" style={{ gap: 8, color: "#111", textDecoration: "none" }}>
                  <span className="pill" style={{ alignSelf: "flex-start" }}>#{p.tag}</span>
                  <b className="display" style={{ fontSize: 19 }}>{p.title}</b>
                  <span className="mono">{formatUsdc(p.available)} USDC free · {formatUsdc(p.paid_out)} paid out</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
