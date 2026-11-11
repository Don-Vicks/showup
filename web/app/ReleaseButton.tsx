"use client";

import { useState } from "react";
import { txUrl } from "@/lib/config";
import { call } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

/**
 * Anyone may call `release_sponsors` once the wait is over; the contract decides who gets what. The second
 * transaction pushes the credited payouts to the host and sponsors.
 */
export function ReleaseButton({ eventId, payees, label = "Release the sponsor payout" }: { eventId: number; payees: string[]; label?: string }) {
  const { account, signIn, send, busy } = useWallet();
  const [note, setNote] = useState<{ ok: boolean; text: string; tx?: string | null } | null>(null);
  const release = async () => {
    setNote(null);
    try {
      if (!account && !(await signIn())) return;
      const tx = await send([call("release_sponsors", { event_id: eventId }, "0", 150), call("withdraw_for", { accounts: payees.slice(0, 20) }, "0", 200)]);
      setNote({ ok: true, text: "Released and paid out. Reload to see it.", tx });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <span className="stack" style={{ gap: 8 }}>
      <button type="button" className="btn btn-hot" onClick={release} disabled={busy}>{label}</button>
      {note && (
        <span className={note.ok ? "ok" : "error"} style={{ color: "#111" }}>
          {note.text} {note.tx && <a href={txUrl(note.tx)} target="_blank" rel="noreferrer">Transaction</a>}
        </span>
      )}
    </span>
  );
}
