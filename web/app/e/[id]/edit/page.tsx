"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { txUrl } from "@/lib/config";
import { DETAILS_DEPOSIT, agendaText, call, getEvent, parseAgenda, type EventCard } from "@/lib/near";
import { useWallet } from "@/lib/wallet";
import { Cover } from "../../../Cover";
import { DetailsFields, EMPTY_DETAILS, type DetailsDraft } from "../../../DetailsFields";

export default function EditDetails({ params }: { params: Promise<{ id: string }> }) {
  const eventId = Number(use(params).id);
  const { account, signIn, send, busy } = useWallet();
  const [event, setEvent] = useState<EventCard | null | undefined>(undefined);
  const [draft, setDraft] = useState<DetailsDraft>(EMPTY_DETAILS);
  const [note, setNote] = useState<{ ok: boolean; text: string; tx?: string | null } | null>(null);

  useEffect(() => {
    getEvent(eventId)
      .then((e) => {
        setEvent(e);
        const d = e?.details;
        if (d) setDraft({ hostName: d.host_name, description: d.description, coverUrl: d.cover_url ?? "", agenda: agendaText(d.agenda) });
      })
      .catch(() => setEvent(null));
  }, [eventId]);

  if (event === undefined) return <main className="wrap page"><p className="muted">Loading…</p></main>;
  if (event === null) return <main className="wrap page"><p className="error">No event {eventId}.</p></main>;
  const isHost = account === event.host;

  const save = async () => {
    setNote(null);
    try {
      const cover = draft.coverUrl.trim();
      if (cover && !cover.startsWith("https://")) throw new Error("The cover link must start with https://");
      const details = { host_name: draft.hostName.trim(), description: draft.description.trim(), cover_url: cover || null, agenda: parseAgenda(draft.agenda) };
      const tx = await send([call("set_details", { event_id: eventId, details }, DETAILS_DEPOSIT, 50)]);
      setNote({ ok: true, text: "Saved.", tx });
      setEvent({ ...event, details });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="wrap page">
      <div className="stack" style={{ gap: 10 }}>
        <span className="eyebrow">Edit details · {event.params.title}</span>
        <h1 className="display" style={{ fontSize: "clamp(32px, 5vw, 54px)" }}>What guests and sponsors see</h1>
      </div>
      {!account && (
        <p className="ok row" style={{ justifyContent: "space-between" }}>
          Sign in as the host ({event.host}) to edit.
          <button type="button" className="btn btn-small btn-dark" onClick={() => signIn()} disabled={busy}>Sign in</button>
        </p>
      )}
      {account && !isHost && <p className="error">Only the host, {event.host}, can edit this event. You&apos;re signed in as {account}.</p>}
      <div className="split">
        <section className="main-col card stack">
          <DetailsFields value={draft} onChange={setDraft} />
          <button type="button" className="btn btn-primary" onClick={save} disabled={!isHost || busy}>Save details</button>
          {note && (
            <p className={note.ok ? "ok" : "error"} style={{ margin: 0 }}>
              {note.text} {note.tx && <a href={txUrl(note.tx)} target="_blank" rel="noreferrer">Transaction</a>} {note.ok && <Link href={`/e/${eventId}`}>Back to the event</Link>}
            </p>
          )}
          <span className="muted" style={{ fontSize: 14 }}>The title, time, deposit and rules are fixed once published. Saving asks for up to 0.06 NEAR for storage; the unused part comes back.</span>
        </section>
        <aside className="side-col card shadow" style={{ padding: 0, overflow: "hidden" }}>
          <Cover event={event} details={{ host_name: draft.hostName, description: draft.description, cover_url: draft.coverUrl.trim().startsWith("https://") ? draft.coverUrl.trim() : null, agenda: [] }} height={220} />
          <div className="stack" style={{ padding: 18, gap: 6 }}>
            <b className="display" style={{ fontSize: 20 }}>{event.params.title}</b>
            <span className="muted">by {draft.hostName || event.host}</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
