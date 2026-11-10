"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { txUrl } from "@/lib/config";
import { call, formatUsdc, view, type TicketView } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

/** Opened by scanning the door screen: checks the signed-in guest's ticket in with that code. */
function CheckIn() {
  const q = useSearchParams();
  const eventId = Number(q.get("e"));
  const window = Number(q.get("w"));
  const sig = (q.get("s") ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const { account, signIn, send, busy } = useWallet();
  const [ticket, setTicket] = useState<TicketView | null | undefined>(undefined);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "working" } | { kind: "done"; tx: string | null } | { kind: "failed"; message: string }>({ kind: "idle" });

  useEffect(() => {
    if (!account) return;
    view<string | null>("ticket_for", { event_id: eventId, account_id: account })
      .then((id) => (id ? view<TicketView | null>("get_ticket", { token_id: id }) : null))
      .then(setTicket)
      .catch(() => setTicket(null));
  }, [account, eventId, state.kind]);

  const go = async () => {
    if (!ticket) return;
    setState({ kind: "working" });
    try {
      const tx = await send([call("check_in", { token_id: ticket.token_id, window, door_sig: sig })]);
      setState({ kind: "done", tx });
    } catch (e) {
      setState({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  if (!eventId || !window || !sig) return <p className="error">This link isn&apos;t a door code. Scan the screen at the door again.</p>;
  if (state.kind === "done" || (ticket && typeof ticket.status === "object")) {
    return (
      <div className="stack" style={{ gap: 22 }}>
        <span className="sticker block-cobalt">Checked in</span>
        <h1 className="display h1">Welcome in.</h1>
        {ticket && !ticket.waived && <span className="mono" style={{ fontSize: 36 }}>+{formatUsdc(ticket.deposit)} USDC</span>}
        <p style={{ fontSize: 18, margin: 0 }}>Signed by you and the door. Your share of the no-shows arrives after the event is settled.</p>
        <div className="row">
          {ticket && <Link href={`/t/${ticket.token_id}`} className="btn btn-hot">Post &quot;I was there&quot;</Link>}
          {state.kind === "done" && state.tx && <a href={txUrl(state.tx)} target="_blank" rel="noreferrer">See the transaction</a>}
        </div>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 22, maxWidth: 560 }}>
      <h1 className="display h1" style={{ fontSize: "clamp(34px, 6vw, 56px)" }}>Check in</h1>
      {!account ? (
        <button type="button" className="btn btn-primary" onClick={() => signIn()} disabled={busy}>Sign in to check in</button>
      ) : ticket === undefined ? (
        <p className="muted">Finding your ticket…</p>
      ) : ticket === null ? (
        <p className="error">{account} has no ticket for this event. <Link href={`/e/${eventId}`}>See the event</Link></p>
      ) : (
        <button type="button" className="btn btn-primary" onClick={go} disabled={busy || state.kind === "working"}>
          {state.kind === "working" ? "Confirm in your wallet…" : `Check in ticket #${ticket.token_id}`}
        </button>
      )}
      {state.kind === "failed" && <p className="error">{state.message}</p>}
      <span className="muted">Codes last about 2 minutes. If yours expires, scan the screen again.</span>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <main className="wrap page">
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <CheckIn />
      </Suspense>
    </main>
  );
}
