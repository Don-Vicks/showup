"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { doorKey, doorLink } from "@/lib/door";
import { call, view, type Report, type ShowUpEvent } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

export default function DoorPage({ params }: { params: Promise<{ id: string }> }) {
  const eventId = Number(use(params).id);
  const { account, signIn, send, busy } = useWallet();
  const [event, setEvent] = useState<ShowUpEvent | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [key, setKey] = useState<{ secret: Uint8Array; publicKey: string } | null>(null);
  const [desk, setDesk] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setEvent(await view<ShowUpEvent | null>("get_event", { event_id: eventId }).catch(() => null));
    setReport(await view<Report>("report", { event_id: eventId }).catch(() => null));
  }, [eventId]);

  useEffect(() => {
    setKey(doorKey(eventId));
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(load, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [eventId, load]);

  const link = useMemo(() => (key ? doorLink(window.location.origin, eventId, key.secret, now) : null), [key, eventId, now]);
  const qr = useMemo(() => (link ? renderSVG(link.url, { border: 1 }) : ""), [link]);

  if (!event || !key || !link) return <main className="wrap page"><p className="muted">Loading the door…</p></main>;
  const isHost = account === event.host;
  const registered = event.door_key === key.publicKey;

  const register = async () => {
    setNote(null);
    try {
      await send([call("add_door_key", { event_id: eventId, public_key: key.publicKey })]);
      await load();
      setNote({ ok: true, text: "This screen is now the door." });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  const deskCheckIn = async () => {
    setNote(null);
    try {
      await send([call("door_check_in", { token_id: desk.trim().replace(/^showup:ticket:/, "") })]);
      setDesk("");
      await load();
      setNote({ ok: true, text: "Checked in at the desk." });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!registered) {
    return (
      <main className="wrap page" style={{ maxWidth: 720 }}>
        <h1 className="display h1" style={{ fontSize: "clamp(32px, 5vw, 52px)" }}>Set up the door</h1>
        <p style={{ fontSize: 18, lineHeight: 1.5 }}>
          This screen makes a key that signs a new check-in code every 20 seconds. Register it once from the host account ({event.host}).
          Guests then check in by scanning the screen with their own phone.
        </p>
        {!account ? (
          <button type="button" className="btn btn-primary" onClick={() => signIn()} disabled={busy}>Sign in as the host</button>
        ) : !isHost ? (
          <p className="error">Signed in as {account}. Only {event.host} can set up this door.</p>
        ) : (
          <button type="button" className="btn btn-primary" onClick={register} disabled={busy}>Make this screen the door</button>
        )}
        {note && <p className={note.ok ? "ok" : "error"}>{note.text}</p>}
      </main>
    );
  }

  return (
    <main className="block-cobalt" style={{ minHeight: "calc(100vh - 70px)", display: "flex", flexWrap: "wrap" }}>
      <section style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "40px 24px" }}>
        <span className="sticker block-tomato">{event.params.title}</span>
        <h1 className="display" style={{ fontSize: "clamp(36px, 5vw, 64px)", textAlign: "center" }}>Scan to check in</h1>
        <div role="img" aria-label="Check-in code" style={{ width: "min(380px, 80vw)", aspectRatio: "1 / 1", background: "#fff", border: "3px solid #111", borderRadius: 22, boxShadow: "8px 8px 0 #111", padding: 14 }} dangerouslySetInnerHTML={{ __html: qr }} />
        <div style={{ width: "min(380px, 80vw)" }} className="stack">
          <div style={{ height: 10, borderRadius: 5, background: "#fff", border: "2px solid #111", overflow: "hidden" }}>
            <div style={{ width: `${(link.msLeft / 20_000) * 100}%`, height: "100%", background: "#ff4d2e" }} />
          </div>
          <div className="row" style={{ justifyContent: "space-between", fontWeight: 700, fontSize: 15 }}>
            <span>New code in {Math.ceil(link.msLeft / 1000)} s</span>
            <span>Signed by this door</span>
          </div>
        </div>
        <span style={{ fontSize: 18, textAlign: "center" }}>Point your phone&apos;s camera here and open the link.</span>
      </section>
      <aside className="block-ink" style={{ flex: "1 1 360px", minWidth: 0, padding: "32px 28px", display: "flex", flexDirection: "column", gap: 22 }}>
        <div className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">Checked in</span>
          <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
            <span className="display" style={{ fontSize: 72 }}>{report?.checked_in ?? 0}</span>
            <span style={{ fontSize: 18 }}>of {report?.committed ?? event.tickets}</span>
          </div>
          <span>{report?.verified ?? 0} by their own phone</span>
        </div>
        <div className="card stack" style={{ color: "#111" }}>
          <b>Crowd count</b>
          <span style={{ lineHeight: 1.5 }}>Counting crowd photos inside NEAR AI&apos;s secure hardware is not built yet. Until it is, this event&apos;s sponsor payouts are held for the sponsor&apos;s approval.</span>
        </div>
        <div className="stack">
          <label className="field">No phone? Ticket number
            <input value={desk} onChange={(e) => setDesk(e.target.value)} inputMode="numeric" style={{ color: "#111" }} />
          </label>
          <button type="button" className="btn btn-hot" onClick={deskCheckIn} disabled={busy || !desk.trim() || !isHost}>Check in at the desk</button>
          <span style={{ fontSize: 13 }}>Desk check-ins refund the deposit but don&apos;t count for sponsors.</span>
        </div>
        {note && <p className={note.ok ? "ok" : "error"} style={{ color: "#111" }}>{note.text}</p>}
      </aside>
    </main>
  );
}
