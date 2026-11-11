import Link from "next/link";
import { CONTRACT } from "@/lib/config";
import { isUpcoming, listEvents, type EventCard } from "@/lib/near";
import { EventTile } from "./EventTile";

export const dynamic = "force-dynamic";

async function load(): Promise<{ events: EventCard[]; error: string | null }> {
  if (!CONTRACT) return { events: [], error: "The ShowUp contract isn't deployed yet." };
  try {
    return { events: await listEvents(), error: null };
  } catch {
    return { events: [], error: "Couldn't read events from NEAR right now." };
  }
}

const ROLES = [
  {
    href: "#events",
    cls: "block-cobalt shadow",
    title: "Going to an event?",
    body: "Commit with a dollar or two. Show up and it's back, plus a share of the no-shows'.",
    cta: "Find an event",
  },
  {
    href: "/new",
    cls: "block-tomato shadow",
    title: "Hosting one?",
    body: "A headcount you can plan around, and sponsor money for every verified guest, paid by the contract.",
    cta: "Host an event",
  },
  {
    href: "/sponsor",
    cls: "block-ink",
    title: "Sponsoring?",
    body: "Pay per real attendee, checked at the door. Anything not earned comes back to you.",
    cta: "Sponsor events",
  },
];

export default async function Home() {
  const { events, error } = await load();
  const now = Date.now();
  const upcoming = events.filter((e) => isUpcoming(e, now)).sort((a, b) => a.params.starts_at_ms - b.params.starts_at_ms);
  const past = events.filter((e) => !isUpcoming(e, now));

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
            <Link href="/proof" style={{ fontWeight: 700, color: "#111" }}>See a real event, start to finish →</Link>
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

      <section className="grid" aria-label="Start here">
        {ROLES.map((r) => (
          <Link key={r.href} href={r.href} className={`card role-card stack ${r.cls}`} style={{ gap: 10, textDecoration: "none" }}>
            <span className="h2">{r.title}</span>
            <span style={{ fontSize: 17, lineHeight: 1.5 }}>{r.body}</span>
            <span style={{ fontWeight: 700, marginTop: "auto" }}>{r.cta} →</span>
          </Link>
        ))}
      </section>

      <Link href="/proof" className="card shadow row" style={{ justifyContent: "space-between", textDecoration: "none", color: "#111" }}>
        <span className="stack" style={{ gap: 6, flex: "1 1 420px" }}>
          <span className="eyebrow">Ran on NEAR testnet, 10–11 Nov</span>
          <span className="h2" style={{ fontSize: 22 }}>4 RSVPs, 3 check-ins, 1 no-show split among the guests who came.</span>
          <span className="muted">Walk through that event step by step, with every transaction. No wallet needed.</span>
        </span>
        <span className="btn btn-dark">See it happen</span>
      </Link>

      <section id="events" className="stack" style={{ gap: 18, scrollMarginTop: 24 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="h2" style={{ fontSize: 30 }}>Coming up</h2>
          <Link href="/new" style={{ fontWeight: 700 }}>Host your own</Link>
        </div>
        {error && <p className="error">{error}</p>}
        {!error && upcoming.length === 0 && <p className="muted">Nothing coming up. <Link href="/new">Host the next one.</Link></p>}
        <div className="grid">
          {upcoming.map((e) => <EventTile key={e.id} event={e} />)}
        </div>
      </section>

      {past.length > 0 && (
        <section className="stack" style={{ gap: 18 }}>
          <h2 className="h2" style={{ fontSize: 24 }}>Already happened</h2>
          <div className="grid">
            {past.map((e) => <EventTile key={e.id} event={e} href={`/e/${e.id}/report`} />)}
          </div>
        </section>
      )}
    </main>
  );
}
