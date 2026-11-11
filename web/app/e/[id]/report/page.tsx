import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTRACT, accountUrl } from "@/lib/config";
import { formatTime, formatWhen } from "@/lib/format";
import { formatUsdc, view, type Report, type ShowUpEvent, type TicketView } from "@/lib/near";
import { ReleaseButton } from "../../../ReleaseButton";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!CONTRACT || !/^\d+$/.test(id)) notFound();
  const eventId = Number(id);
  const [event, report] = await Promise.all([
    view<ShowUpEvent | null>("get_event", { event_id: eventId }).catch(() => null),
    view<Report>("report", { event_id: eventId }).catch(() => null),
  ]);
  const [delays, tickets] = await Promise.all([
    view<{ settle_ms: number }>("delays").catch(() => null),
    view<TicketView[]>("get_tickets", { event_id: eventId, limit: 300 }).catch(() => [] as TicketView[]),
  ]);
  if (!event || !report) notFound();
  const p = event.params;
  const noShowRate = report.committed ? Math.round((report.no_shows / report.committed) * 100) : 0;
  const stats = [
    { label: "Committed", value: report.committed, note: "deposit paid or waived", cls: "" },
    { label: "Checked in", value: report.checked_in, note: `${report.verified} by own phone, ${report.checked_in - report.verified} at the desk`, cls: "block-cobalt" },
    { label: "Proven guests", value: report.proven, note: "seen at other hosts' events", cls: "" },
    { label: "No-shows", value: report.no_shows, note: `${noShowRate}% of committed`, cls: "block-tomato" },
    { label: "Peak crowd count", value: report.max_headcount ?? "–", note: report.max_headcount === null ? "no count recorded" : "counted in a TEE", cls: "block-ink" },
  ];
  const status = event.cancelled ? "Cancelled" : report.settled ? "Settled" : Date.now() < p.ends_at_ms ? "Live" : "Ended, not settled yet";

  return (
    <main className="wrap page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 10 }}>
          <span className="eyebrow">Attendance report · {formatWhen(p.starts_at_ms)} · {event.host}</span>
          <h1 className="display" style={{ fontSize: "clamp(34px, 5vw, 60px)" }}>{p.title}</h1>
        </div>
        <span className="sticker block-cobalt">{status}{report.flagged ? " · flagged" : ""}</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
        {stats.map((s) => (
          <div key={s.label} className={`card shadow stack ${s.cls}`} style={{ gap: 8, padding: 18 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{s.label}</span>
            <span className="display" style={{ fontSize: 46 }}>{s.value}</span>
            <span style={{ fontSize: 14 }}>{s.note}</span>
          </div>
        ))}
      </div>

      <div className="split">
        <section className="main-col card stack">
          <h2 className="h2" style={{ fontSize: 20 }}>Crowd counts, signed in a TEE</h2>
          {event.headcounts.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No crowd count recorded.</p>
          ) : (
            <div className="scroll-x">
              <table>
                <thead><tr><th>Time</th><th>Counted</th><th>Evidence</th></tr></thead>
                <tbody>
                  {event.headcounts.map((h) => (
                    <tr key={h.at_ms}><td>{formatTime(h.at_ms)}</td><td>{h.count}</td><td className="mono" style={{ fontSize: 13 }}>{h.evidence_hash.slice(0, 16)}…</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span style={{ lineHeight: 1.5 }}>
            Flag rule: verified check-ins above the highest count by {p.flag_pct}% plus {p.flag_abs}. {report.flagged ? <b>Flagged: sponsor payouts wait for the sponsor.</b> : <b>Not flagged.</b>}
          </span>
        </section>

        <section className="side-col card stack">
          <h2 className="h2" style={{ fontSize: 20 }}>Where the money goes</h2>
          {!event.cancelled && !report.settled && delays && Date.now() >= p.ends_at_ms + delays.settle_ms && (
            <ReleaseButton eventId={event.id} method="settle" label="Settle the no-shows now" payees={[...new Set([event.host, ...tickets.map((t) => t.owner)])]} />
          )}
          <div className="scroll-x">
            <table>
              <tbody>
                <tr><td>No-show pot</td><td className="mono" style={{ textAlign: "right" }}>{formatUsdc(report.settled ? report.no_show_pot : (BigInt(p.deposit) * BigInt(report.no_shows)).toString())}</td></tr>
                {event.pledges.map((pl, i) => (
                  <tr key={i}>
                    <td>{pl.sponsor}: ${formatUsdc(pl.rate)} × {pl.proven_only ? "proven" : "verified"} (cap {pl.cap})</td>
                    <td className="mono" style={{ textAlign: "right" }}>{pl.done ? `${formatUsdc(pl.paid_to_host)} to host` : "held"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(event.pledges.length > 0 || event.programs.some((l) => l.approved)) && <Link href={`/e/${event.id}/receipt`} className="btn btn-small btn-primary">Sponsor receipt: who counted and why</Link>}
          <a href={accountUrl(CONTRACT)} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Every transaction on the NEAR explorer</a>
        </section>
      </div>

      <section className="card block-ink stack" style={{ boxShadow: "6px 6px 0 #ff4d2e" }}>
        <span className="h2" style={{ fontSize: 22 }}>Recount it yourself</span>
        <span style={{ lineHeight: 1.5 }}>
          A verified check-in carries the guest&apos;s own signature and the door&apos;s. The contract <span className="mono">{CONTRACT}</span> holds the rules, and nobody can withdraw outside them.
        </span>
        <Link href={`/e/${event.id}`} style={{ color: "#fffdf7", fontWeight: 700 }}>Back to the event</Link>
      </section>
    </main>
  );
}
