import { formatDay } from "@/lib/format";
import type { EventDetails, ShowUpEvent } from "@/lib/near";

const PALETTES = [
  { bg: "#1f4bff", fg: "#ffffff", accent: "#ff4d2e" },
  { bg: "#ff4d2e", fg: "#111111", accent: "#1f4bff" },
  { bg: "#111111", fg: "#fffdf7", accent: "#ffd23f" },
  { bg: "#ffd23f", fg: "#111111", accent: "#1f4bff" },
];

/**
 * An event's cover: the host's image when they gave one, otherwise a poster drawn from the event itself
 * (no stock photos pretending to be the event).
 */
export function Cover({ event, details, height = 180, big = false }: { event: ShowUpEvent; details: EventDetails | null; height?: number; big?: boolean }) {
  const p = event.params;
  if (details?.cover_url) {
    return (
      <div style={{ position: "relative", height, background: "#111", borderBottom: "2px solid #111", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={details.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <span className="mono" style={{ position: "absolute", left: 14, top: 14, background: "#fffdf7", color: "#111", border: "2px solid #111", borderRadius: 8, padding: "4px 8px", fontSize: 13 }}>
          {formatDay(p.starts_at_ms)}
        </span>
      </div>
    );
  }
  const c = PALETTES[event.id % PALETTES.length];
  const words = p.title.replace(/\(demo\)/i, "").trim().split(/\s+/);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: process.env.NEXT_PUBLIC_TIMEZONE ?? "Africa/Lagos" }).format(p.starts_at_ms);
  return (
    <div aria-hidden="true" style={{ position: "relative", height, background: c.bg, color: c.fg, borderBottom: "2px solid #111", overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -height * 0.18, top: -height * 0.25, width: height * 0.95, height: height * 0.95, borderRadius: "50%", background: c.accent, border: "2px solid #111" }} />
      <div style={{ position: "absolute", right: height * 0.08, bottom: -height * 0.3, width: height * 0.7, height: height * 0.7, borderRadius: "50%", border: `${big ? 14 : 8}px solid ${c.fg}`, opacity: 0.9 }} />
      <span className="display" style={{ position: "absolute", right: height * 0.16, top: height * 0.08, fontSize: height * 0.42, color: "#111", lineHeight: 1 }}>{day}</span>
      <div style={{ position: "absolute", left: big ? 28 : 16, bottom: big ? 24 : 14, right: height * 0.5, display: "flex", flexDirection: "column", gap: 2 }}>
        {words.slice(0, 4).map((w, i) => (
          <span key={i} className="display" style={{ fontSize: big ? Math.min(54, height * 0.16) : Math.min(24, height * 0.14), lineHeight: 1.02, textTransform: "uppercase", wordBreak: "break-word" }}>
            {w}
          </span>
        ))}
      </div>
    </div>
  );
}
