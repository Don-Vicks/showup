import { ImageResponse } from "next/og";
import { formatWhen } from "@/lib/format";
import { formatUsdc, view, type ShowUpEvent, type TicketView } from "@/lib/near";

/** The share card for X: "I'm attending" before check-in, "I was there" after. 1200×675. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ticket = await view<TicketView | null>("get_ticket", { token_id: token }).catch(() => null);
  const event = ticket ? await view<ShowUpEvent | null>("get_event", { event_id: ticket.event_id }).catch(() => null) : null;
  if (!ticket || !event) return new Response("Not found", { status: 404 });
  const there = typeof ticket.status === "object";
  const p = event.params;
  const holder = ticket.owner.length > 28 ? `${ticket.owner.slice(0, 10)}…${ticket.owner.slice(-8)}` : ticket.owner;

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 675, display: "flex", background: there ? "#111111" : "#1F4BFF", color: "#FFFFFF", padding: 56, gap: 48 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ display: "flex", alignSelf: "flex-start", background: "#FF4D2E", color: "#111111", border: "3px solid #111111", borderRadius: 999, padding: "10px 22px", fontSize: 28, fontWeight: 700 }}>
              {there ? "I WAS THERE" : "I'M ATTENDING"}
            </div>
            <div style={{ display: "flex", fontSize: 84, fontWeight: 900, lineHeight: 1, letterSpacing: -2 }}>{p.title}</div>
            <div style={{ display: "flex", fontSize: 30 }}>{`${formatWhen(p.starts_at_ms)} · ${p.venue}`}</div>
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>{holder}</div>
        </div>
        <div style={{ width: 300, display: "flex", flexDirection: "column", background: "#FFFDF7", color: "#111111", border: "3px solid #111111", borderRadius: 26 }}>
          <div style={{ display: "flex", flexDirection: "column", padding: 28, gap: 12 }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 900 }}>ShowUp</div>
            <div style={{ display: "flex", fontSize: 22, lineHeight: 1.35 }}>{`Commit ${formatUsdc(p.deposit)} USDC. Get it back at the door.`}</div>
          </div>
          <div style={{ display: "flex", borderTop: "3px dashed #111111" }} />
          <div style={{ display: "flex", flexDirection: "column", padding: 28, gap: 8, marginTop: "auto" }}>
            <div style={{ display: "flex", fontSize: 16, fontWeight: 700 }}>{event.pledges.length ? "SPONSORED PER GUEST" : "ON NEAR"}</div>
            <div style={{ display: "flex", fontSize: 20, color: "#1F4BFF", fontWeight: 700 }}>{`Ticket #${ticket.token_id}`}</div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 675 },
  );
}
