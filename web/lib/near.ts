import { CONTRACT, RPC_URL, USDC } from "./config";

/** Types mirror contracts/showup/src/lib.rs. */
export type NoShowRule = "SplitAmongAttendees" | "ToHost";

export interface EventParams {
  title: string;
  venue: string;
  starts_at_ms: number;
  ends_at_ms: number;
  capacity: number;
  deposit: string;
  cancel_cutoff_ms: number;
  no_show_rule: NoShowRule;
  waive_after: number | null;
  flag_pct: number;
  flag_abs: number;
  require_headcount: boolean;
}

export interface Pledge {
  sponsor: string;
  rate: string;
  cap: number;
  proven_only: boolean;
  decision: boolean | null;
  done: boolean;
  paid_to_host: string;
}

export interface ShowUpEvent {
  id: number;
  host: string;
  params: EventParams;
  door_key: string | null;
  tickets: number;
  cancelled: boolean;
  settled: boolean;
  no_show_pot: string;
  headcounts: { count: number; at_ms: number; evidence_hash: string }[];
  pledges: Pledge[];
  programs: ProgramLink[];
}

export interface ProgramLink {
  program_id: number;
  approved: boolean;
  reserved: string;
  decision: boolean | null;
  done: boolean;
  paid_to_host: string;
}

export interface AgendaItem {
  at: string;
  what: string;
}

/** Stored apart from the event (see `set_details`); events may have none. */
export interface EventDetails {
  host_name: string;
  description: string;
  cover_url: string | null;
  agenda: AgendaItem[];
}

export interface Program {
  id: number;
  owner: string;
  title: string;
  tag: string;
  rate: string;
  per_event_cap: number;
  available: string;
  paid_out: string;
}

/** An event with its details, as most pages show it. */
export interface EventCard extends ShowUpEvent {
  details: EventDetails | null;
}

export type TicketStatus = "Committed" | "Cancelled" | { CheckedIn: { at_ms: number; verified: boolean } };

export interface TicketView {
  token_id: string;
  owner: string;
  event_id: number;
  deposit: string;
  waived: boolean;
  status: TicketStatus;
  referrer: string | null;
  referrals: number;
  proven: boolean;
}

export interface Report {
  committed: number;
  cancelled: number;
  checked_in: number;
  verified: number;
  proven: number;
  no_shows: number;
  max_headcount: number | null;
  flagged: boolean;
  settled: boolean;
  no_show_pot: string;
}

/** Read-only call on a contract through JSON-RPC. */
export async function view<T>(method: string, args: Record<string, unknown> = {}, contract = CONTRACT): Promise<T> {
  if (!contract) throw new Error("NO_CONTRACT");
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "showup",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: contract,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const body = (await res.json()) as { result?: { result?: number[]; error?: string }; error?: { message?: string } };
  if (body.error || !body.result?.result) throw new Error(body.result?.error ?? body.error?.message ?? "RPC_ERROR");
  return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result))) as T;
}

export async function getEvent(id: number): Promise<EventCard | null> {
  const [event, details] = await Promise.all([
    view<ShowUpEvent | null>("get_event", { event_id: id }),
    view<EventDetails | null>("get_details", { event_id: id }).catch(() => null),
  ]);
  return event ? { ...event, details } : null;
}

/** Newest first. The contract numbers events from 1, so this reads the last `limit` of them. */
export async function listEvents(limit = 60): Promise<EventCard[]> {
  const last = await view<number>("last_event_id");
  const ids = Array.from({ length: Math.min(limit, last) }, (_, i) => last - i);
  const events = await Promise.all(ids.map((id) => getEvent(id).catch(() => null)));
  return events.filter((e): e is EventCard => e !== null);
}

export async function listPrograms(): Promise<Program[]> {
  const last = await view<number>("last_program_id");
  const ids = Array.from({ length: last }, (_, i) => last - i);
  const programs = await Promise.all(ids.map((id) => view<Program | null>("get_program", { program_id: id }).catch(() => null)));
  return programs.filter((p): p is Program => p !== null);
}

export const isUpcoming = (e: ShowUpEvent, now = Date.now()) => !e.cancelled && now < e.params.ends_at_ms;

/** What a host has run before: events that ended, and guests who checked in with their own phone. */
export interface HostRecord {
  hosted: number;
  verified: number;
}

export async function hostRecord(host: string, events: ShowUpEvent[], now = Date.now()): Promise<HostRecord> {
  const past = events.filter((e) => e.host === host && !e.cancelled && e.params.ends_at_ms < now);
  const reports = await Promise.all(past.map((e) => view<Report>("report", { event_id: e.id }).catch(() => null)));
  return { hosted: past.length, verified: reports.reduce((n, r) => n + (r?.verified ?? 0), 0) };
}

/** USDC has 6 decimals; amounts travel as integer strings. */
export function formatUsdc(base: string | bigint, digits = 2): string {
  const v = typeof base === "bigint" ? base : BigInt(base || "0");
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, digits);
  return digits > 0 ? `${whole}.${frac}` : whole.toString();
}

export function parseUsdc(input: string): string {
  const [w, f = ""] = input.trim().split(".");
  if (!/^\d+$/.test(w || "0") || !/^\d*$/.test(f)) throw new Error("Not an amount");
  return (BigInt(w || "0") * 1_000_000n + BigInt((f + "000000").slice(0, 6))).toString();
}

export function statusLabel(s: TicketStatus): string {
  if (s === "Committed") return "Committed";
  if (s === "Cancelled") return "Cancelled";
  return s.CheckedIn.verified ? "Checked in" : "Checked in at the desk";
}

// ---------- Transactions (NEAR Connect's shape) ----------

export interface WalletTransaction {
  receiverId: string;
  actions: { type: "FunctionCall"; params: { methodName: string; args: Record<string, unknown>; gas: string; deposit: string } }[];
}

const TGAS = (n: number) => (BigInt(n) * 10n ** 12n).toString();
const ONE_YOCTO = "1";
/** NEP-145 registration on USDC; refunded if the account is already registered. */
const USDC_STORAGE = "1250000000000000000000";

export const call = (methodName: string, args: Record<string, unknown>, deposit = "0", gas = 100, receiverId = CONTRACT): WalletTransaction => ({
  receiverId,
  actions: [{ type: "FunctionCall", params: { methodName, args, gas: TGAS(gas), deposit } }],
});

/** Registers the account on USDC (so refunds can reach it), then pays the deposit with a routing message. */
export function rsvpTransactions(account: string, eventId: number, deposit: string, referrer: string | null): WalletTransaction[] {
  return [
    call("storage_deposit", { account_id: account, registration_only: true }, USDC_STORAGE, 30, USDC),
    call(
      "ft_transfer_call",
      { receiver_id: CONTRACT, amount: deposit, msg: JSON.stringify({ Rsvp: { event_id: eventId, referrer, for_account: null } }) },
      ONE_YOCTO,
      150,
      USDC,
    ),
  ];
}

export function pledgeTransactions(account: string, eventId: number, rate: string, cap: number, provenOnly: boolean): WalletTransaction[] {
  const total = (BigInt(rate) * BigInt(cap)).toString();
  return [
    call("storage_deposit", { account_id: account, registration_only: true }, USDC_STORAGE, 30, USDC),
    call(
      "ft_transfer_call",
      { receiver_id: CONTRACT, amount: total, msg: JSON.stringify({ Pledge: { event_id: eventId, rate, cap, proven_only: provenOnly } }) },
      ONE_YOCTO,
      150,
      USDC,
    ),
  ];
}

/** NEAR attached to `create_event_with_details` / `set_details` for storage; the unused part is refunded. */
export const DETAILS_DEPOSIT = "60000000000000000000000"; // 0.06 NEAR

export function fundProgramTransactions(account: string, programId: number, amount: string): WalletTransaction[] {
  return [
    call("storage_deposit", { account_id: account, registration_only: true }, USDC_STORAGE, 30, USDC),
    call("ft_transfer_call", { receiver_id: CONTRACT, amount, msg: JSON.stringify({ FundProgram: { program_id: programId } }) }, ONE_YOCTO, 150, USDC),
  ];
}

/** Agenda typed one item per line: "18:00 Doors open" or "18:00 – Doors open". */
export function parseAgenda(text: string): AgendaItem[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((l) => {
      const m = l.match(/^(\d{1,2}[:.]\d{2}|\d{1,2}\s?(?:am|pm))\s*[-–:]?\s*(.+)$/i);
      return m ? { at: m[1], what: m[2].slice(0, 120) } : { at: "", what: l.slice(0, 120) };
    });
}

export const agendaText = (items: AgendaItem[]) => items.map((a) => (a.at ? `${a.at} ${a.what}` : a.what)).join("\n");

export const DOOR_WINDOW_MS = 20_000;
export const doorMessage = (eventId: number, window: number) => `showup:door:${eventId}:${window}`;
