import Link from "next/link";
import type { Metadata } from "next";
import { CONTRACT } from "@/lib/config";
import { formatUsdc, listEvents, listPrograms, type EventCard, type Program } from "@/lib/near";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bounty programs · ShowUp" };

async function load(): Promise<{ programs: Program[]; events: EventCard[]; error: string | null }> {
  if (!CONTRACT) return { programs: [], events: [], error: "The ShowUp contract isn't deployed yet." };
  try {
    const [programs, events] = await Promise.all([listPrograms(), listEvents()]);
    return { programs, events, error: null };
  } catch {
    return { programs: [], events: [], error: "Couldn't read programs from NEAR right now." };
  }
}

export default async function Programs({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  const { programs, events, error } = await load();
  const applying = event ? events.find((e) => e.id === Number(event)) : undefined;
  return (
    <main className="wrap page">
      <section className="split" style={{ alignItems: "flex-end" }}>
        <div className="main-col stack" style={{ gap: 14 }}>
          <span className="eyebrow">Bounty programs</span>
          <h1 className="display h1" style={{ fontSize: "clamp(34px, 5vw, 60px)" }}>One budget, many events.</h1>
          <p style={{ margin: 0, fontSize: 19, lineHeight: 1.5, maxWidth: 660 }}>
            A program pays hosts per verified guest across many events: &ldquo;2 USDC per verified guest at any Rust meetup in Lagos, up to 40 per event.&rdquo; Hosts apply, the program owner approves, and the contract pays 48 hours after each event. Budget nobody earned stays in the program.
          </p>
        </div>
        <div className="side-col stack">
          <Link href="/programs/new" className="btn btn-primary">Start a program</Link>
        </div>
      </section>

      {applying && (
        <p className="ok">Applying with <b>{applying.params.title}</b>: open a program below and press Apply.</p>
      )}
      {error && <p className="error">{error}</p>}
      {!error && programs.length === 0 && (
        <section className="card block-ink stack" style={{ boxShadow: "6px 6px 0 #1f4bff" }}>
          <span className="h2" style={{ fontSize: 22 }}>No programs yet.</span>
          <span style={{ lineHeight: 1.5 }}>Run a developer-relations budget, a city grant or a community fund? Start the first one and pay only for people who turn up.</span>
          <Link href="/programs/new" className="btn btn-hot" style={{ alignSelf: "flex-start" }}>Start a program</Link>
        </section>
      )}
      <div className="grid">
        {programs.map((p) => {
          const linked = events.filter((e) => e.programs.some((l) => l.program_id === p.id));
          return (
            <Link key={p.id} href={`/programs/${p.id}${applying ? `?event=${applying.id}` : ""}`} className="card shadow stack" style={{ gap: 10, color: "#111", textDecoration: "none" }}>
              <span className="pill" style={{ alignSelf: "flex-start" }}>#{p.tag}</span>
              <b className="display" style={{ fontSize: 22 }}>{p.title}</b>
              <span className="mono">{formatUsdc(p.rate)} USDC per verified guest, up to {p.per_event_cap} per event</span>
              <span className="muted">{formatUsdc(p.available)} USDC unreserved · {formatUsdc(p.paid_out)} paid out · {linked.length} event{linked.length === 1 ? "" : "s"}</span>
              <span className="muted" style={{ fontSize: 14 }}>Run by {p.owner}</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
