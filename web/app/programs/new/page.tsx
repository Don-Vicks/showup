"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { call, formatUsdc, parseUsdc, view, type Program } from "@/lib/near";
import { useWallet } from "@/lib/wallet";

export default function NewProgram() {
  const router = useRouter();
  const { account, signIn, send, busy } = useWallet();
  const [title, setTitle] = useState("");
  const [tag, setTag] = useState("");
  const [rate, setRate] = useState("2");
  const [cap, setCap] = useState("40");
  const [error, setError] = useState<string | null>(null);

  let reserve = "0";
  try {
    reserve = (BigInt(parseUsdc(rate)) * BigInt(Math.max(0, Math.floor(Number(cap) || 0)))).toString();
  } catch {}

  const create = async () => {
    setError(null);
    try {
      const a = account ?? (await signIn());
      if (!a) return;
      if (!title.trim()) throw new Error("Give the program a name.");
      await send([call("create_program", { title: title.trim(), tag: tag.trim().replace(/^#/, "").toLowerCase() || "events", rate: parseUsdc(rate), per_event_cap: Number(cap) }, "0", 50)]);
      // Programs are numbered in order; find the newest one this account created.
      const last = await view<number>("last_program_id");
      for (let id = last; id > Math.max(0, last - 10); id--) {
        const p = await view<Program | null>("get_program", { program_id: id });
        if (p && p.owner === a && p.title === title.trim()) return router.push(`/programs/${id}`);
      }
      router.push("/programs");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="wrap page">
      <h1 className="display h1" style={{ fontSize: "clamp(34px, 5vw, 56px)" }}>Start a bounty program</h1>
      <div className="split">
        <section className="main-col card stack">
          <label className="field">Name<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rust meetups in Lagos" maxLength={120} /></label>
          <label className="field">Tag<input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="rust" maxLength={40} /></label>
          <div className="fields">
            <label className="field">Per verified guest (USDC)<input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="mono" /></label>
            <label className="field">Up to (guests per event)<input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="numeric" className="mono" /></label>
          </div>
          <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>Create the program</button>
          {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
        </section>
        <aside className="side-col card block-ink stack" style={{ boxShadow: "6px 6px 0 #ff4d2e" }}>
          <span className="h2" style={{ fontSize: 20 }}>How the budget works</span>
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }} className="stack">
            <li>Create the program, then add USDC to it</li>
            <li>Hosts apply with an event; you approve. Approving sets aside {formatUsdc(reserve)} USDC for that event</li>
            <li>48 hours after it, the host gets {rate || "?"} USDC per verified guest; the rest returns to the program</li>
            <li>Take back unreserved budget any time</li>
          </ol>
        </aside>
      </div>
    </main>
  );
}
