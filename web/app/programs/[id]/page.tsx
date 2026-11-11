"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import { txUrl } from "@/lib/config";
import { formatWhen } from "@/lib/format";
import { call, formatUsdc, fundProgramTransactions, listEvents, parseUsdc, view, type EventCard, type Program, type Report } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

export default function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  return (
    <Suspense fallback={<main className="wrap page"><p className="muted">Loading…</p></main>}>
      <ProgramView id={id} />
    </Suspense>
  );
}

function ProgramView({ id }: { id: number }) {
  const applyWith = Number(useSearchParams().get("event")) || null;
  const { account, signIn, send, busy } = useWallet();
  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const [events, setEvents] = useState<EventCard[]>([]);
  const [reports, setReports] = useState<Record<number, Report>>({});
  const [releaseMs, setReleaseMs] = useState(48 * 3600_000);
  const [amount, setAmount] = useState("50");
  const [note, setNote] = useState<{ ok: boolean; text: string; tx?: string | null } | null>(null);

  const load = useCallback(async () => {
    const [p, all, delays] = await Promise.all([view<Program | null>("get_program", { program_id: id }), listEvents(), view<{ release_ms: number }>("delays")]);
    setProgram(p);
    setEvents(all);
    setReleaseMs(delays.release_ms);
    const linked = all.filter((e) => e.programs.some((l) => l.program_id === id));
    setReports(Object.fromEntries(await Promise.all(linked.map(async (e) => [e.id, await view<Report>("report", { event_id: e.id })] as const))));
  }, [id]);
  useEffect(() => {
    load().catch(() => setProgram(null));
  }, [load]);

  const run = async (label: string, txs: Parameters<typeof send>[0]) => {
    setNote(null);
    try {
      if (!account && !(await signIn())) return;
      const tx = await send(txs);
      setNote({ ok: true, text: label, tx });
      await load();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  if (program === undefined) return <main className="wrap page"><p className="muted">Loading…</p></main>;
  if (program === null) return <main className="wrap page"><p className="error">No program {id}.</p></main>;

  const owner = account === program.owner;
  const now = Date.now();
  const linked = events.filter((e) => e.programs.some((l) => l.program_id === id));
  const myOpenEvents = events.filter((e) => e.host === account && !e.cancelled && now < e.params.ends_at_ms && !e.programs.some((l) => l.program_id === id));
  const reserve = BigInt(program.rate) * BigInt(program.per_event_cap);

  return (
    <main className="wrap page">
      <div className="stack" style={{ gap: 10 }}>
        <Link href="/programs" style={{ fontWeight: 700 }}>← All programs</Link>
        <span className="pill" style={{ alignSelf: "flex-start" }}>#{program.tag}</span>
        <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 56px)" }}>{program.title}</h1>
        <span style={{ fontSize: 19 }}>{formatUsdc(program.rate)} USDC per verified guest, up to {program.per_event_cap} per event · run by <span className="mono">{program.owner}</span></span>
      </div>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        <div className="card block-cobalt shadow stack" style={{ gap: 6 }}><b>Unreserved budget</b><span className="display" style={{ fontSize: 36 }}>{formatUsdc(program.available)}</span></div>
        <div className="card shadow stack" style={{ gap: 6 }}><b>Set aside per approved event</b><span className="display" style={{ fontSize: 36 }}>{formatUsdc(reserve)}</span></div>
        <div className="card block-tomato shadow stack" style={{ gap: 6 }}><b>Paid to hosts</b><span className="display" style={{ fontSize: 36 }}>{formatUsdc(program.paid_out)}</span></div>
      </section>

      {note && (
        <p className={note.ok ? "ok" : "error"} style={{ margin: 0 }}>
          {note.text} {note.tx && <a href={txUrl(note.tx)} target="_blank" rel="noreferrer">Transaction</a>}
        </p>
      )}

      <div className="split">
        <section className="main-col stack" style={{ gap: 14 }}>
          <h2 className="h2">Events</h2>
          {linked.length === 0 && <p className="muted" style={{ margin: 0 }}>No events have applied yet.</p>}
          {linked.map((e) => {
            const l = e.programs.find((x) => x.program_id === id)!;
            const r = reports[e.id];
            const releaseAt = e.params.ends_at_ms + releaseMs;
            return (
              <div key={e.id} className="card stack" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Link href={`/e/${e.id}`} style={{ fontWeight: 700, fontSize: 18 }}>{e.params.title}</Link>
                  <span className="pill">{l.done ? `Paid ${formatUsdc(l.paid_to_host)}` : l.approved ? `${formatUsdc(l.reserved)} set aside` : "Applied"}</span>
                </div>
                <span className="muted">{formatWhen(e.params.starts_at_ms)} · {e.params.venue} · {e.details?.host_name || e.host}{r && now >= e.params.ends_at_ms ? ` · ${r.verified} verified${r.flagged ? ", flagged" : ""}` : ""}</span>
                {owner && !l.approved && (
                  <button type="button" className="btn btn-small btn-primary" style={{ alignSelf: "flex-start" }} disabled={busy || BigInt(program.available) < reserve} onClick={() => run("Approved.", [call("program_approve", { program_id: id, event_id: e.id }, "0", 50)])}>
                    {BigInt(program.available) < reserve ? `Needs ${formatUsdc(reserve)} USDC of budget to approve` : `Approve and set aside ${formatUsdc(reserve)} USDC`}
                  </button>
                )}
                {owner && l.approved && !l.done && r?.flagged && now >= releaseAt && (
                  <span className="row" style={{ gap: 8 }}>
                    <b>Check-ins look high. Your call:</b>
                    <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => run("Approved: the host is paid.", [call("program_decide", { program_id: id, event_id: e.id, approve: true }, "0", 150), call("withdraw_for", { accounts: [e.host] }, "0", 60)])}>Pay the host</button>
                    <button type="button" className="btn btn-small" disabled={busy} onClick={() => run("Refused: the budget returns to the program.", [call("program_decide", { program_id: id, event_id: e.id, approve: false }, "0", 150)])}>Refuse</button>
                  </span>
                )}
              </div>
            );
          })}
        </section>

        <aside className="side-col stack" style={{ gap: 18 }}>
          <section className="card shadow stack">
            <h2 className="h2" style={{ fontSize: 20 }}>Add budget</h2>
            <label className="field">USDC<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mono" /></label>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => {
              let base: string;
              try { base = parseUsdc(amount); } catch { return setNote({ ok: false, text: "Not an amount." }); }
              const a = account ?? (await signIn());
              if (a) await run(`Added ${amount} USDC.`, fundProgramTransactions(a, id, base));
            }}>Add {amount || "0"} USDC</button>
            {owner && BigInt(program.available) > 0n && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => run("Unreserved budget returned to you.", [call("program_withdraw", { program_id: id }, "0", 60)])}>
                Take back {formatUsdc(program.available)} USDC
              </button>
            )}
          </section>

          <section className="card block-ink stack" style={{ boxShadow: "6px 6px 0 #1f4bff" }}>
            <h2 className="h2" style={{ fontSize: 20 }}>Hosting an event?</h2>
            {!account ? (
              <button type="button" className="btn btn-hot" onClick={() => signIn()} disabled={busy}>Sign in to apply</button>
            ) : myOpenEvents.length === 0 ? (
              <span style={{ lineHeight: 1.5 }}>You have no upcoming events to apply with. <Link href="/new" style={{ color: "#ffd23f" }}>Host one.</Link></span>
            ) : (
              myOpenEvents.map((e) => (
                <button key={e.id} type="button" className={`btn ${e.id === applyWith ? "btn-hot" : ""}`} disabled={busy} onClick={() => run("Applied. The program owner decides.", [call("apply_program", { event_id: e.id, program_id: id }, "0", 50)])}>
                  Apply with {e.params.title}
                </button>
              ))
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
