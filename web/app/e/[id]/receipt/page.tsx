import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CONTRACT, accountUrl } from "@/lib/config";
import { formatTime, formatWhen } from "@/lib/format";
import { formatUsdc, getEvent, view, type Pledge, type Program, type Report, type TicketView } from "@/lib/near";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sponsor receipt · ShowUp" };

/** Why a ticket did or didn't count for a pledge. */
function verdict(t: TicketView, provenOnly: boolean, ended: boolean): { counted: boolean; why: string } {
  if (t.status === "Cancelled") return { counted: false, why: "Cancelled before the event" };
  if (t.status === "Committed") return { counted: false, why: ended ? "Didn't come" : "Not checked in yet" };
  const c = t.status.CheckedIn;
  if (!c.verified) return { counted: false, why: `Checked in at the desk, ${formatTime(c.at_ms)}: no phone signature` };
  if (provenOnly && !t.proven) return { counted: false, why: `Scanned the door, ${formatTime(c.at_ms)}, but hasn't checked in with another host before` };
  return { counted: true, why: `Scanned the door from their own account, ${formatTime(c.at_ms)}${t.proven ? "; proven guest" : ""}` };
}

export default async function Receipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sponsor?: string }> }) {
  const { id } = await params;
  const { sponsor } = await searchParams;
  if (!CONTRACT || !/^\d+$/.test(id)) notFound();
  const eventId = Number(id);
  const [event, report, tickets, delays] = await Promise.all([
    getEvent(eventId).catch(() => null),
    view<Report>("report", { event_id: eventId }).catch(() => null),
    view<TicketView[]>("get_tickets", { event_id: eventId, limit: 300 }).catch(() => [] as TicketView[]),
    view<{ release_ms: number; decide_ms: number }>("delays").catch(() => null),
  ]);
  if (!event || !report || !delays) notFound();
  const programs = await Promise.all(event.programs.filter((l) => l.approved).map(async (l) => ({ link: l, program: await view<Program | null>("get_program", { program_id: l.program_id }).catch(() => null) })));

  const p = event.params;
  const now = Date.now();
  const ended = now >= p.ends_at_ms;
  const releaseAt = p.ends_at_ms + delays.release_ms;
  const autoAt = releaseAt + delays.decide_ms;
  const pledges = event.pledges.map((pl, index) => ({ pl, index })).filter(({ pl }) => !sponsor || pl.sponsor === sponsor);
  const flagReason = report.max_headcount === null
    ? "No crowd count was recorded, and this event requires one."
    : `${report.verified} phone check-ins against a highest crowd count of ${report.max_headcount}; the limit is the count plus ${p.flag_pct}% plus ${p.flag_abs}.`;

  const status = (done: boolean, decision: boolean | null) => {
    if (event.cancelled) return "Event cancelled: refunded in full";
    if (done) return "Paid out";
    if (!ended) return `Event hasn't ended. Pays out from ${formatWhen(releaseAt)}`;
    if (now < releaseAt) return `Held in the contract until ${formatWhen(releaseAt)}`;
    if (report.flagged && decision === null) return `Flagged: waiting for the funder's decision, or it goes to the host on ${formatWhen(autoAt)}`;
    return "Ready to release: anyone can trigger it";
  };

  const Lines = ({ provenOnly }: { provenOnly: boolean }) => (
    <div className="scroll-x">
      <table>
        <thead><tr><th>Ticket</th><th>Guest</th><th>Counted</th><th>Why</th></tr></thead>
        <tbody>
          {tickets.map((t) => {
            const v = verdict(t, provenOnly, ended);
            return (
              <tr key={t.token_id}>
                <td className="mono">#{t.token_id}</td>
                <td><a href={accountUrl(t.owner)} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 14 }}>{t.owner}</a></td>
                <td style={{ fontWeight: 700, color: v.counted ? "#1f4bff" : "#4b4b4b" }}>{v.counted ? "Yes" : "No"}</td>
                <td>{v.why}</td>
              </tr>
            );
          })}
          {tickets.length === 0 && <tr><td colSpan={4} className="muted">No RSVPs yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const Money = ({ rate, cap, counted, done, paid, total }: { rate: string; cap: number; counted: number; done: boolean; paid: string; total: bigint }) => {
    const toHost = done ? BigInt(paid) : BigInt(rate) * BigInt(Math.min(counted, cap));
    return (
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <div className="card stack" style={{ gap: 4, padding: 16 }}><span className="muted">Put in</span><b className="mono" style={{ fontSize: 24 }}>{formatUsdc(total)}</b><span style={{ fontSize: 14 }}>{formatUsdc(rate)} × up to {cap}</span></div>
        <div className="card block-cobalt stack" style={{ gap: 4, padding: 16 }}><span>To the host{done ? "" : " (if released now)"}</span><b className="mono" style={{ fontSize: 24 }}>{formatUsdc(toHost)}</b><span style={{ fontSize: 14 }}>{Math.min(counted, cap)} counted × {formatUsdc(rate)}</span></div>
        <div className="card stack" style={{ gap: 4, padding: 16 }}><span className="muted">Back to the funder</span><b className="mono" style={{ fontSize: 24 }}>{formatUsdc(total - toHost)}</b><span style={{ fontSize: 14 }}>everything not earned</span></div>
      </div>
    );
  };

  return (
    <main className="wrap page receipt">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Sponsor receipt · event {event.id} on {CONTRACT}</span>
          <h1 className="display" style={{ fontSize: "clamp(30px, 4.5vw, 52px)" }}>{p.title}</h1>
          <span className="muted">{formatWhen(p.starts_at_ms)}–{formatTime(p.ends_at_ms)} · {p.venue} · hosted by {event.details?.host_name || event.host} (<span className="mono">{event.host}</span>)</span>
        </div>
        <PrintButton />
      </div>

      <section className="card block-ink stack" style={{ gap: 8, boxShadow: "6px 6px 0 #1f4bff" }}>
        <b style={{ fontSize: 18 }}>How guests are counted</b>
        <span style={{ lineHeight: 1.55 }}>
          A guest counts only if their own NEAR account signed a check-in with a door code from this event&apos;s door screen, which changes every 20 seconds and expires after 2 minutes. Desk check-ins and no-shows never count. Every row below is read live from the contract, and the guest accounts open on the NEAR explorer.
        </span>
        {report.flagged && ended && <span style={{ color: "#ffd23f", fontWeight: 700 }}>This event is flagged. {flagReason}</span>}
      </section>

      {pledges.length === 0 && programs.length === 0 && (
        <p className="muted">{sponsor ? `${sponsor} has no pledge on this event.` : "No sponsor has pledged on this event yet."} <Link href={`/e/${event.id}/sponsor`}>Sponsor it</Link></p>
      )}

      {pledges.map(({ pl, index }: { pl: Pledge; index: number }) => {
        const counted = pl.proven_only ? report.proven : report.verified;
        return (
          <section key={`p${index}`} className="card shadow stack" style={{ gap: 16 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="stack" style={{ gap: 4 }}>
                <span className="eyebrow">Pledge {index + 1} · {pl.proven_only ? "proven guests only" : "every phone check-in"}</span>
                <b className="mono" style={{ fontSize: 17 }}>{pl.sponsor}</b>
              </span>
              <span className="pill">{status(pl.done, pl.decision)}</span>
            </div>
            <Money rate={pl.rate} cap={pl.cap} counted={counted} done={pl.done} paid={pl.paid_to_host} total={BigInt(pl.rate) * BigInt(pl.cap)} />
            {pl.decision !== null && <span><b>Funder&apos;s decision:</b> {pl.decision ? "pay the host" : "refused, refunded"}</span>}
            <Lines provenOnly={pl.proven_only} />
          </section>
        );
      })}

      {!sponsor && programs.map(({ link, program }) => program && (
        <section key={`g${link.program_id}`} className="card shadow stack" style={{ gap: 16 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Bounty program · every phone check-in</span>
              <Link href={`/programs/${program.id}`} style={{ fontWeight: 700 }}>{program.title}</Link>
            </span>
            <span className="pill">{status(link.done, link.decision)}</span>
          </div>
          <Money rate={program.rate} cap={program.per_event_cap} counted={report.verified} done={link.done} paid={link.paid_to_host} total={BigInt(link.reserved)} />
          <Lines provenOnly={false} />
        </section>
      ))}

      <section className="row" style={{ gap: 14 }}>
        <a href={accountUrl(CONTRACT)} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Every transaction on the NEAR explorer</a>
        <Link href={`/e/${event.id}/report`} style={{ fontWeight: 700 }}>Attendance report</Link>
        <Link href={`/e/${event.id}`} style={{ fontWeight: 700 }}>Event page</Link>
      </section>
    </main>
  );
}
