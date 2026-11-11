import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTRACT } from "@/lib/config";
import { formatTime, formatWhen } from "@/lib/format";
import { formatUsdc, getEvent, hostRecord, listEvents } from "@/lib/near";
import { Cover } from "../../Cover";
import { RsvpPanel } from "./RsvpPanel";

export const dynamic = "force-dynamic";

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string }> }) {
  const { id } = await params;
  const { ref } = await searchParams;
  if (!CONTRACT || !/^\d+$/.test(id)) notFound();
  const event = await getEvent(Number(id)).catch(() => null);
  if (!event) notFound();
  const p = event.params;
  const d = event.details;
  const record = await listEvents().then((all) => hostRecord(event.host, all)).catch(() => null);
  const spotsLeft = Math.max(0, p.capacity - event.tickets);
  const split = p.no_show_rule === "SplitAmongAttendees";

  return (
    <main className="wrap page">
      <section className="card shadow-lg" style={{ padding: 0, overflow: "hidden", borderRadius: 22 }}>
        <Cover event={event} details={d} height={300} big />
        <div className="row" style={{ padding: 28, justifyContent: "space-between", alignItems: "flex-end" }}>
          <div className="stack" style={{ gap: 12, minWidth: 0, flex: "1 1 420px" }}>
            {event.pledges.length > 0 && <span className="sticker block-tomato">Sponsored per guest</span>}
            <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 58px)" }}>{p.title}</h1>
            <span style={{ fontSize: 19 }}>
              {formatWhen(p.starts_at_ms)}–{formatTime(p.ends_at_ms)} · {p.venue}
            </span>
            <span className="muted">
              Hosted by <b style={{ color: "#111" }}>{d?.host_name || event.host}</b>
              {d?.host_name && <> · <span className="mono" style={{ fontSize: 14 }}>{event.host}</span></>}
              {record && record.hosted > 0 && <> · {record.hosted} past event{record.hosted === 1 ? "" : "s"}, {record.verified} verified guests</>}
            </span>
          </div>
          <div className="stack mono" style={{ gap: 4, alignItems: "flex-end" }}>
            <span style={{ fontSize: 44, lineHeight: 1 }}>{event.tickets}</span>
            <span style={{ fontSize: 14 }}>committed · {spotsLeft} spots left</span>
          </div>
        </div>
      </section>

      <div className="split">
        <div className="main-col stack" style={{ gap: 24 }}>
          {event.cancelled && <p className="error">The host cancelled this event. Every deposit and pledge is being refunded.</p>}
          {(d?.description || (d?.agenda.length ?? 0) > 0) && (
            <section className="card stack" style={{ gap: 14 }}>
              <h2 className="h2" style={{ fontSize: 22 }}>About</h2>
              {d?.description && <div style={{ fontSize: 17, lineHeight: 1.6, whiteSpace: "pre-line" }}>{d.description}</div>}
              {d && d.agenda.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <b>Programme</b>
                  {d.agenda.map((a, i) => (
                    <div key={i} className="row" style={{ gap: 14, alignItems: "baseline", borderTop: i ? "1px dashed #111" : "none", paddingTop: i ? 8 : 0 }}>
                      <span className="mono" style={{ minWidth: 64 }}>{a.at}</span>
                      <span>{a.what}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
          <section className="stack">
            <h2 className="h2">How your deposit works</h2>
            <div className="fields">
              <div className="card stack" style={{ gap: 8, padding: 18 }}>
                <span className="mono" style={{ color: "#1f4bff" }}>01</span>
                <b style={{ fontSize: 17 }}>Commit {formatUsdc(p.deposit)} USDC</b>
                <span className="muted">Held by the ShowUp contract, not the host.</span>
              </div>
              <div className="card stack" style={{ gap: 8, padding: 18 }}>
                <span className="mono" style={{ color: "#1f4bff" }}>02</span>
                <b style={{ fontSize: 17 }}>Scan the door screen</b>
                <span className="muted">Your deposit comes straight back.</span>
              </div>
              <div className="card stack" style={{ gap: 8, padding: 18 }}>
                <span className="mono" style={{ color: "#1f4bff" }}>03</span>
                <b style={{ fontSize: 17 }}>{split ? "Split the no-shows" : "No-shows fund the host"}</b>
                <span className="muted">{split ? "Their deposits go to the people who came." : "Their deposits cover the host's costs."}</span>
              </div>
            </div>
          </section>

          <section className="card block-tomato shadow stack" style={{ gap: 12 }}>
            <h2 className="h2" style={{ fontSize: 22 }}>Paid for by real attendance</h2>
            {event.pledges.length === 0 ? (
              <span>No sponsors yet. Sponsors pay the host only for guests who check in at the door.</span>
            ) : (
              <div className="row">
                {event.pledges.map((pl, i) => (
                  <span key={i} className="pill">
                    {pl.sponsor} · ${formatUsdc(pl.rate)} per verified guest, up to {pl.cap}
                  </span>
                ))}
              </div>
            )}
            <Link href={`/e/${event.id}/sponsor`} style={{ color: "#111", fontWeight: 700 }}>Sponsor this event</Link>
          </section>

          <div className="row">
            <Link href={`/e/${event.id}/report`} className="btn btn-small">Attendance report</Link>
            <Link href={`/e/${event.id}/door`} className="btn btn-small">Door screen (host)</Link>
            <Link href={`/e/${event.id}/edit`} className="btn btn-small">Edit details (host)</Link>
          </div>
        </div>

        <aside className="side-col">
          <RsvpPanel event={event} referrer={ref ?? null} />
        </aside>
      </div>
    </main>
  );
}
