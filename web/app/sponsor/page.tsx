import Link from "next/link";
import type { Metadata } from "next";
import { CONTRACT } from "@/lib/config";
import { formatUsdc, hostRecord, isUpcoming, listEvents, type EventCard, type HostRecord } from "@/lib/near";
import { EventTile } from "../EventTile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sponsor events · ShowUp" };

async function load(): Promise<{ events: (EventCard & { record: HostRecord })[]; error: string | null }> {
  if (!CONTRACT) return { events: [], error: "The ShowUp contract isn't deployed yet." };
  try {
    const all = await listEvents();
    const upcoming = all.filter((e) => isUpcoming(e)).sort((a, b) => a.params.starts_at_ms - b.params.starts_at_ms);
    const records = await Promise.all(upcoming.map((e) => hostRecord(e.host, all)));
    return { events: upcoming.map((e, i) => ({ ...e, record: records[i] })), error: null };
  } catch {
    return { events: [], error: "Couldn't read events from NEAR right now." };
  }
}

const pledged = (e: EventCard) => e.pledges.filter((p) => !p.done).reduce((n, p) => n + BigInt(p.rate) * BigInt(p.cap), 0n);

export default async function SponsorBrowse() {
  const { events, error } = await load();
  return (
    <main className="wrap page">
      <section className="split" style={{ alignItems: "flex-end" }}>
        <div className="main-col stack" style={{ gap: 14 }}>
          <span className="eyebrow">For sponsors</span>
          <h1 className="display h1" style={{ fontSize: "clamp(34px, 5vw, 64px)" }}>Pay for people, not promises.</h1>
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.5, maxWidth: 640 }}>
            Pick an event, set a price per guest and a cap. The money waits in the contract. Two days after the event the host gets paid for every guest who checked in with their own phone, and the rest comes back to you.
          </p>
        </div>
        <div className="side-col stack" style={{ gap: 10 }}>
          <Link href="/programs" className="btn">Fund many events: bounty programs</Link>
          <Link href="/me#pledges" className="btn btn-small">My pledges</Link>
        </div>
      </section>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {[
          ["01", "Pick an event", "See the crowd so far and what the host has run before."],
          ["02", "Pledge per guest", "Say 2 USDC per verified guest, up to 100. You pay the cap up front, into the contract."],
          ["03", "Pay for who came", "48 hours after, the host is paid for verified guests. The rest is yours again."],
        ].map(([n, t, b]) => (
          <div key={n} className="card stack" style={{ gap: 8, padding: 18 }}>
            <span className="mono" style={{ color: "#1f4bff" }}>{n}</span>
            <b style={{ fontSize: 17 }}>{t}</b>
            <span className="muted">{b}</span>
          </div>
        ))}
      </section>

      <section className="stack" style={{ gap: 18 }}>
        <h2 className="h2" style={{ fontSize: 28 }}>Events looking for sponsors</h2>
        {error && <p className="error">{error}</p>}
        {!error && events.length === 0 && <p className="muted">No upcoming events right now.</p>}
        <div className="grid">
          {events.map((e) => (
            <EventTile
              key={e.id}
              event={e}
              footer={
                <div className="stack" style={{ gap: 10, width: "100%" }}>
                  <div className="row" style={{ gap: 8, fontSize: 14 }}>
                    <span className="pill">{e.tickets}/{e.params.capacity} committed</span>
                    <span className="pill">{e.record.hosted ? `Host account: ${e.record.hosted} past event${e.record.hosted === 1 ? "" : "s"}, ${e.record.verified} verified guests` : "First event by this host"}</span>
                    {pledged(e) > 0n && <span className="pill">{formatUsdc(pledged(e))} USDC pledged</span>}
                  </div>
                  <Link href={`/e/${e.id}/sponsor`} className="btn btn-primary">Sponsor this event</Link>
                </div>
              }
            />
          ))}
        </div>
      </section>
    </main>
  );
}
