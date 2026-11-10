const TZ = process.env.NEXT_PUBLIC_TIMEZONE ?? "Africa/Lagos";

export function formatWhen(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }).format(ms);
}

export function formatDay(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(ms).toUpperCase();
}

export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(ms);
}

export function shortAccount(a: string): string {
  return a.length > 24 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}
