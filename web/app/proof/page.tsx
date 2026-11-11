import Link from "next/link";
import type { Metadata } from "next";
import { CONTRACT, accountUrl, txUrl } from "@/lib/config";
import { formatWhen } from "@/lib/format";
import { formatUsdc, statusLabel, view, type Report, type ShowUpEvent, type TicketView } from "@/lib/near";
import { PROOF_EVENT_ID, PROOF_STEPS } from "@/lib/proof";
import { ReleaseButton } from "../ReleaseButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "A real event, start to finish · ShowUp" };

export default async function ProofPage() {
  const [event, report, tickets, delays] = CONTRACT
    ? await Promise.all([
        view<ShowUpEvent | null>("get_event", { event_id: PROOF_EVENT_ID }).catch(() => null),
        view<Report>("report", { event_id: PROOF_EVENT_ID }).catch(() => null),
        view<TicketView[]>("get_tickets", { event_id: PROOF_EVENT_ID }).catch(() => []),
        view<{ release_ms: number }>("delays").catch(() => null),
      ])
    : [null, null, [], null];
  const pledge = event?.pledges[0];
  const releaseAt = event && delays ? event.params.ends_at_ms + delays.release_ms : null;
  const releaseOpen = releaseAt !== null && Date.now() >= releaseAt;

  return (
    <main className="wrap page">
      <div className="stack" style={{ gap: 12, maxWidth: 820 }}>
        <span className="eyebrow">For judges and the curious · no wallet needed</span>
        <h1 className="display h1" style={{ fontSize: "clamp(34px, 5vw, 64px)" }}>One real event, start to finish.</h1>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.5 }}>
          On 10 Nov we ran a small event on NEAR testnet with test accounts: a host, a sponsor and four guests. Every step below links to its transaction, and the numbers on this page are read live from the contract{" "}
          <a href={accountUrl(CONTRACT)} target="_blank" rel="noreferrer" className="mono">{CONTRACT}</a>.
        </p>
      </div>

      {event && report && (
        <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          {[
            { label: "Committed", value: report.committed, cls: "" },
            { label: "Checked in", value: report.checked_in, cls: "block-cobalt" },
            { label: "By their own phone", value: report.verified, cls: "" },
            { label: "No-shows", value: report.no_shows, cls: "block-tomato" },
            { label: "No-show pot", value: `${formatUsdc(report.no_show_pot)}`, cls: "block-ink" },
          ].map((s) => (
            <div key={s.label} className={`card shadow stack ${s.cls}`} style={{ gap: 6, padding: 18 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{s.label}</span>
              <span className="display" style={{ fontSize: 40 }}>{s.value}</span>
            </div>
          ))}
        </section>
      )}

      <div className="split">
        <section className="main-col stack" style={{ gap: 20 }}>
          <ol className="steps">
            {PROOF_STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <span className="step-num" style={s.txs.some((t) => t.failed) ? { background: "#ff4d2e" } : undefined}>{i + 1}</span>
                <div className="card stack" style={{ gap: 10, padding: 18 }}>
                  <b style={{ fontSize: 19 }}>{s.title}</b>
                  <span style={{ lineHeight: 1.55 }}>{s.body}</span>
                  <span className="row" style={{ gap: 8 }}>
                    {s.txs.map((t) => (
                      <a key={t.hash} href={txUrl(t.hash)} target="_blank" rel="noreferrer" className="pill tx" style={{ color: t.failed ? "#c42a10" : "#1f4bff" }}>
                        {t.label} · {t.hash.slice(0, 6)}…{t.failed ? " (refused)" : ""}
                      </a>
                    ))}
                  </span>
                </div>
              </li>
            ))}
            <li className="step">
              <span className="step-num block-cobalt">{PROOF_STEPS.length + 1}</span>
              <div className="card block-cobalt shadow stack" style={{ gap: 10, padding: 18 }}>
                <b style={{ fontSize: 19 }}>The sponsor&apos;s money follows real people</b>
                <span style={{ lineHeight: 1.55 }}>
                  48 hours after the event, the contract pays the host 1 USDC for each of the 2 guests who checked in with their own phone, and gives the sponsor back the other 2. guest2&apos;s desk check-in doesn&apos;t count, and nor does guest4.
                </span>
                <Link href={`/e/${PROOF_EVENT_ID}/receipt`} style={{ color: "#fff", fontWeight: 700 }}>The sponsor&apos;s receipt: who counted and why →</Link>
                {pledge?.done ? (
                  <b>Done: {formatUsdc(pledge.paid_to_host)} USDC went to the host, the rest back to the sponsor.</b>
                ) : releaseAt ? (
                  <span className="stack" style={{ gap: 10 }}>
                    <b>{releaseOpen ? "Ready to release now. Anyone can trigger it." : `Opens ${formatWhen(releaseAt)} (Lagos time). Until then the 4 USDC stays in the contract.`}</b>
                    {releaseOpen && event && <ReleaseButton eventId={PROOF_EVENT_ID} payees={[event.host, ...event.pledges.map((pl) => pl.sponsor)]} />}
                  </span>
                ) : null}
              </div>
            </li>
          </ol>
        </section>

        <aside className="side-col stack" style={{ gap: 18 }}>
          <section className="card shadow stack" style={{ gap: 10 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>The tickets, live</h2>
            <div className="scroll-x">
              <table>
                <thead><tr><th>Ticket</th><th>Holder</th><th>Status</th></tr></thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.token_id}>
                      <td className="mono">#{t.token_id}</td>
                      <td>{t.owner.split(".")[0]}{t.referrals > 0 ? ` (+${t.referrals} friend)` : ""}</td>
                      <td>{t.status === "Committed" && report?.settled ? "No-show" : statusLabel(t.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Link href={`/e/${PROOF_EVENT_ID}/report`} style={{ fontWeight: 700 }}>Full attendance report</Link>
            <Link href="/t/1" style={{ fontWeight: 700 }}>guest1&apos;s ticket and share card</Link>
          </section>

          <section className="card block-ink stack" style={{ boxShadow: "6px 6px 0 #ff4d2e", gap: 12 }}>
            <span className="h2" style={{ fontSize: 20 }}>Now try it</span>
            <span style={{ lineHeight: 1.5 }}>Sign in with any NEAR testnet wallet. Get test USDC from Circle&apos;s faucet.</span>
            <Link href="/#events" className="btn btn-hot">RSVP to an event</Link>
            <Link href="/new" className="btn">Host one</Link>
            <Link href="/sponsor" className="btn">Sponsor one</Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
