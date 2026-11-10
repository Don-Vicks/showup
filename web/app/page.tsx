import Link from "next/link";
import { CONTRACT } from "@/lib/config";
import { formatDay } from "@/lib/format";
import { formatUsdc, listEvents, type ShowUpEvent } from "@/lib/near";

export const dynamic = "force-dynamic";

async function upcoming(): Promise<{ events: ShowUpEvent[]; error: string | null }> {
  if (!CONTRACT) return { events: [], error: "The ShowUp contract isn't deployed yet." };
  try {
    return { events: await listEvents(12), error: null };
  } catch {
    return { events: [], error: "Couldn't read events from NEAR right now." };
  }
}

const BANDS = ["block-cobalt", "block-tomato", "block-ink"];

export default async function Home() {
  const { events, error } = await upcoming();
  return (
    <main className="wrap page">
      <section className="split" style={{ alignItems: "center", paddingTop: 16 }}>
        <div className="main-col stack" style={{ gap: 24 }}>
          <h1 className="display h1">RSVP like you mean it.</h1>
          <p style={{ margin: 0, fontSize: 21, lineHeight: 1.5, maxWidth: 600 }}>
            Put down a small deposit. Get it back at the door. Sponsors pay hosts for every guest who&apos;s really there, checked on NEAR.
          </p>
          <div className="row">
            <Link href="#events" className="btn btn-primary">Find an event</Link>
            <Link href="/new" className="btn">Host an event</Link>
          </div>
        </div>
        <div className="side-col" style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
          <div style={{ position: "relative", width: 340, maxWidth: "100%" }}>
            <div className="block-cobalt shadow-lg" style={{ border: "2px solid #111", borderRadius: 20, transform: "rotate(-3deg)", overflow: "hidden" }}>
              <div className="stack" style={{ padding: 22, gap: 8 }}>
                <span className="mono" style={{ fontSize: 13 }}>TICKET · NFT</span>
                <span className="display" style={{ fontSize: 26, lineHeight: 1.05 }}>Your seat, held by a deposit</span>
              </div>
              <div style={{ borderTop: "2px dashed #fff" }} />
              <div className="row" style={{ padding: "18px 22px", justifyContent: "space-between" }}>
                <span>Held in your ticket</span>
                <span className="mono" style={{ fontSize: 20 }}>1.00 USDC</span>
              </div>
            </div>
            <span className="sticker block-tomato" style={{ position: "absolute", right: -12, bottom: -26, transform: "rotate(5deg)" }}>Back at the door</span>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="card block-cobalt shadow stack" style={{ gap: 10 }}>
          <span className="h2">Guests</span>
          <span style={{ fontSize: 17, lineHeight: 1.5 }}>Commit with a dollar or two. Show up and it&apos;s back, plus a share of the no-shows&apos;.</span>
        </div>
        <div className="card block-tomato shadow stack" style={{ gap: 10 }}>
          <span className="h2">Hosts</span>
          <span style={{ fontSize: 17, lineHeight: 1.5 }}>A headcount you can plan around, and sponsor money for every verified guest, paid by the contract.</span>
        </div>
        <div className="card block-ink stack" style={{ gap: 10, boxShadow: "4px 4px 0 #ff4d2e" }}>
          <span className="h2">Sponsors</span>
          <span style={{ fontSize: 17, lineHeight: 1.5 }}>Pay per real attendee, checked at the door. Anything not earned comes back to you.</span>
        </div>
      </section>

      <section id="events" className="stack" style={{ gap: 18 }}>
        <h2 className="h2" style={{ fontSize: 30 }}>Events</h2>
        {error && <p className="error">{error}</p>}
        {!error && events.length === 0 && <p className="muted">No events yet. <Link href="/new">Host the first one.</Link></p>}
        <div className="grid">
          {events.map((e, i) => (
            <Link key={e.id} href={`/e/${e.id}`} className="card shadow" style={{ padding: 0, overflow: "hidden", color: "#111", textDecoration: "none", display: "flex", flexDirection: "column" }}>
              <div className={`${BANDS[i % 3]} stack`} style={{ padding: 18, gap: 6, borderBottom: "2px solid #111", minHeight: 96 }}>
                <span className="mono" style={{ fontSize: 14 }}>{formatDay(e.params.starts_at_ms)}</span>
                <span className="display" style={{ fontSize: 22, lineHeight: 1.1 }}>{e.params.title}</span>
              </div>
              <div className="stack" style={{ padding: 18, gap: 8, fontSize: 15 }}>
                <span>{e.params.venue}</span>
                <span className="row" style={{ justifyContent: "space-between" }}>
                  <span>Deposit <b className="mono">{formatUsdc(e.params.deposit)} USDC</b></span>
                  <span>{Math.max(0, e.params.capacity - e.tickets)} spots left</span>
                </span>
                {e.pledges.length > 0 && <span className="pill">Sponsored per guest</span>}
                {e.cancelled && <span className="pill">Cancelled</span>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
