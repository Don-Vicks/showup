import Link from "next/link";
import type { ReactNode } from "react";
import { formatWhen } from "@/lib/format";
import { formatUsdc, type EventCard } from "@/lib/near";
import { Cover } from "./Cover";

/** An event as a card in a grid: cover, when and where, deposit and spots. */
export function EventTile({ event: e, href, footer }: { event: EventCard; href?: string; footer?: ReactNode }) {
  const p = e.params;
  const ended = Date.now() >= p.ends_at_ms;
  return (
    <div className="card shadow" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <Link href={href ?? `/e/${e.id}`} style={{ color: "#111", textDecoration: "none", display: "flex", flexDirection: "column", flex: 1 }}>
        <Cover event={e} details={e.details} height={170} />
        <div className="stack" style={{ padding: 18, gap: 8, fontSize: 15, flex: 1 }}>
          <span className="display" style={{ fontSize: 21, lineHeight: 1.12 }}>{p.title}</span>
          <span className="muted">{formatWhen(p.starts_at_ms)} · {p.venue}</span>
          {e.details?.host_name && <span>by <b>{e.details.host_name}</b></span>}
          <span className="row" style={{ justifyContent: "space-between", marginTop: "auto", gap: 8 }}>
            <span>Deposit <b className="mono">{formatUsdc(p.deposit)} USDC</b></span>
            <span>{ended ? `${e.tickets} committed` : `${Math.max(0, p.capacity - e.tickets)} spots left`}</span>
          </span>
          <span className="row" style={{ gap: 8 }}>
            {e.pledges.length > 0 && <span className="pill">Sponsored per guest</span>}
            {e.cancelled && <span className="pill">Cancelled</span>}
            {e.settled && <span className="pill">Settled</span>}
          </span>
        </div>
      </Link>
      {footer && <div className="row" style={{ padding: "0 18px 18px", gap: 10 }}>{footer}</div>}
    </div>
  );
}
