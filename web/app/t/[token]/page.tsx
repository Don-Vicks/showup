"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { renderSVG } from "uqr";
import { txUrl } from "@/lib/config";
import { formatWhen } from "@/lib/format";
import { call, formatUsdc, statusLabel, view, type ShowUpEvent, type TicketView } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

export default function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { account, send, busy } = useWallet();
  const [ticket, setTicket] = useState<TicketView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [event, setEvent] = useState<ShowUpEvent | null>(null);
  const [friend, setFriend] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string; tx?: string | null } | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      const t = await view<TicketView | null>("get_ticket", { token_id: token });
      if (!t) return setFailed(`There's no ticket #${token}.`);
      setTicket(t);
      setEvent(await view<ShowUpEvent | null>("get_event", { event_id: t.event_id }));
    } catch {
      setFailed("Couldn't reach NEAR to read this ticket. Check your connection.");
    }
  }, [token]);
  useEffect(() => {
    load();
  }, [load]);

  if (failed)
    return (
      <main className="wrap page">
        <p className="error">{failed}</p>
        <button type="button" className="btn btn-small" style={{ alignSelf: "flex-start" }} onClick={() => load()}>Try again</button>
      </main>
    );
  if (!ticket || !event) return <main className="wrap page"><p className="muted">Loading ticket…</p></main>;
  const p = event.params;
  const mine = account === ticket.owner;
  const committed = ticket.status === "Committed";
  const shareUrl = `${window.location.origin}/e/${event.id}?ref=${ticket.token_id}`;
  const text = committed ? `I'm going to ${p.title}. Committed with a deposit I get back at the door.` : `I was at ${p.title}. Checked in on NEAR, deposit back at the door.`;
  const tweet = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
  const qr = renderSVG(`showup:ticket:${ticket.token_id}`, { border: 1 });

  const act = async (what: "cancel" | "pass") => {
    setNote(null);
    try {
      const tx =
        what === "cancel"
          ? await send([call("cancel", { token_id: ticket.token_id })])
          : await send([call("nft_transfer", { receiver_id: friend.trim(), token_id: ticket.token_id }, "1", 50)]);
      setNote({ ok: true, text: what === "cancel" ? "Cancelled. Your deposit is on its way back." : `Passed to ${friend.trim()}.`, tx });
      await load();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <main className="wrap page">
      <div className="row">
        <h1 className="display h1" style={{ fontSize: "clamp(34px, 5vw, 60px)" }}>{committed ? "You're in." : statusLabel(ticket.status) + "."}</h1>
        {committed && <span className="sticker block-tomato">{ticket.waived ? "No deposit needed" : `${formatUsdc(ticket.deposit)} USDC held for you`}</span>}
      </div>
      <div className="split">
        <section className="main-col card block-cobalt shadow-lg" style={{ padding: 0, overflow: "hidden", borderRadius: 22 }}>
          <div className="stack" style={{ padding: 28, gap: 10 }}>
            <span className="mono" style={{ fontSize: 14 }}>TICKET #{ticket.token_id} · NFT · {ticket.owner}</span>
            <Link href={`/e/${event.id}`} className="display" style={{ fontSize: 34, color: "#fff", textDecoration: "none" }}>{p.title}</Link>
            <span style={{ fontSize: 18 }}>{formatWhen(p.starts_at_ms)} · {p.venue}</span>
          </div>
          <div style={{ borderTop: "2px dashed #fff" }} />
          <div className="row" style={{ padding: "24px 28px", gap: 24 }}>
            <div aria-label="Ticket code for door staff" role="img" style={{ width: 148, height: 148, background: "#fff", border: "2px solid #111", borderRadius: 12, padding: 6 }} dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="stack" style={{ gap: 8, maxWidth: 300, fontSize: 16, lineHeight: 1.5 }}>
              {committed ? (
                <>
                  <b style={{ fontSize: 18 }}>At the door</b>
                  <span>Point your phone&apos;s camera at the door screen and open the link. No phone? Staff can scan this code.</span>
                </>
              ) : (
                <>
                  <b style={{ fontSize: 18 }}>{statusLabel(ticket.status)}</b>
                  <span>{ticket.status === "Cancelled" ? "This ticket was cancelled and its deposit returned." : "Your deposit came back at the door. Your share of the no-shows arrives after the event is settled."}</span>
                </>
              )}
            </div>
          </div>
        </section>

        <div className="side-col stack" style={{ gap: 18 }}>
          <section className="card shadow stack">
            <h2 className="h2" style={{ fontSize: 22 }}>{committed ? "Tell people you're going" : "Tell people you were there"}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/card/${ticket.token_id}`} alt={`Share card for ${p.title}`} style={{ width: "100%", borderRadius: 12, border: "2px solid #111" }} />
            <a href={tweet} target="_blank" rel="noreferrer" className="btn btn-dark">Post to X</a>
            <span className="muted" style={{ fontSize: 14 }}>Friends who come through your link raise your share of the no-show pot.</span>
          </section>
          {mine && committed && (
            <section className="card stack">
              <label className="field">Pass to a friend (NEAR account)<input value={friend} onChange={(e) => setFriend(e.target.value)} placeholder="friend.testnet" /></label>
              <div className="row">
                <button type="button" className="btn btn-small" disabled={busy || !friend.trim() || Date.now() >= p.starts_at_ms} onClick={() => act("pass")}>Pass ticket</button>
                <button type="button" className="btn btn-small" disabled={busy || Date.now() >= p.cancel_cutoff_ms} onClick={() => act("cancel")}>Cancel and refund</button>
              </div>
              <span className="muted" style={{ fontSize: 14 }}>Cancel open until {formatWhen(p.cancel_cutoff_ms)}.</span>
            </section>
          )}
          {note && (
            <p className={note.ok ? "ok" : "error"} style={{ margin: 0 }}>
              {note.text} {note.tx && <a href={txUrl(note.tx)} target="_blank" rel="noreferrer">Transaction</a>}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
