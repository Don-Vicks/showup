//! ShowUp: RSVPs backed by a small USDC deposit, check-ins proven at the venue, and sponsors who pay
//! hosts per verified attendee.
//!
//! Money only leaves this contract by the rules below. There is no withdraw method for hosts,
//! sponsors or the owner:
//! - a guest's deposit goes back to the ticket holder at check-in or on an early cancel;
//! - after the event, no-show deposits are split among the guests who came (weighted by referrals)
//!   or go to the host, by the rule fixed when the event was created;
//! - a sponsor pledge or bounty-program reservation pays the host `rate × counted guests` (capped)
//!   48 hours after the event, and the rest goes back to whoever funded it;
//! - a cancelled event refunds everything.
//!
//! End-of-event payouts are credited to `owed` and paid out by `withdraw` / `withdraw_for`, so one
//! settlement never needs more transfers than fit in a transaction.

use near_contract_standards::non_fungible_token::core::{NonFungibleTokenCore, NonFungibleTokenResolver};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, CurveType, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue, PublicKey,
};
use std::collections::HashMap;

/// A rotating door code changes every 20 seconds.
pub const DOOR_WINDOW_MS: u64 = 20_000;
/// A code stays valid for 6 windows (about 2 minutes), enough to approve the check-in in a wallet.
pub const DOOR_WINDOWS_VALID: u64 = 6;
/// Deposits and the no-show pot can be settled one hour after the event ends.
pub const SETTLE_DELAY_MS: u64 = 60 * 60 * 1000;
/// Sponsor and bounty payouts wait 48 hours after the event ends.
pub const RELEASE_DELAY_MS: u64 = 48 * 60 * 60 * 1000;
/// A flagged payout the funder never decides on goes to the host 7 days after it could first release.
pub const DECIDE_WINDOW_MS: u64 = 7 * 24 * 60 * 60 * 1000;

/// The waits after an event ends. Fixed once when the contract is deployed (the defaults above for real
/// deployments; the sandbox tests deploy with minutes instead of days).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Delays {
    pub settle_ms: u64,
    pub release_ms: u64,
    pub decide_ms: u64,
}

impl Default for Delays {
    fn default() -> Self {
        Self { settle_ms: SETTLE_DELAY_MS, release_ms: RELEASE_DELAY_MS, decide_ms: DECIDE_WINDOW_MS }
    }
}
/// Referrals that raise a guest's share of the no-show pot.
pub const MAX_REFERRALS: u32 = 3;
pub const MAX_CAPACITY: u32 = 300;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_ON_PAY: Gas = Gas::from_tgas(10);

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Tokens,
    TokenMetadata,
    Enumeration,
    Events,
    EventTickets,
    Tickets,
    Buyers,
    Attended,
    HostsSeen,
    Owed,
    Programs,
    DoorKeys,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum NoShowRule {
    SplitAmongAttendees,
    ToHost,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct EventParams {
    pub title: String,
    pub venue: String,
    pub starts_at_ms: u64,
    pub ends_at_ms: u64,
    pub capacity: u32,
    /// Deposit in the token's smallest unit (USDC: 6 decimals).
    pub deposit: U128,
    pub cancel_cutoff_ms: u64,
    pub no_show_rule: NoShowRule,
    /// Guests with at least this many past check-ins may RSVP without a deposit.
    pub waive_after: Option<u32>,
    /// Flag sponsor payouts when verified check-ins exceed the highest headcount by this percent…
    pub flag_pct: u32,
    /// …plus this many people.
    pub flag_abs: u32,
    /// Flag sponsor payouts when no headcount was recorded.
    pub require_headcount: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Headcount {
    pub count: u32,
    pub at_ms: u64,
    /// sha256 (hex) of the TEE-signed evidence kept off chain.
    pub evidence_hash: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Pledge {
    pub sponsor: AccountId,
    pub rate: U128,
    pub cap: u32,
    pub proven_only: bool,
    /// Set by the sponsor on a flagged event.
    pub decision: Option<bool>,
    pub done: bool,
    pub paid_to_host: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct ProgramLink {
    pub program_id: u64,
    pub approved: bool,
    /// `rate × per_event_cap`, set aside from the program's budget on approval.
    pub reserved: U128,
    pub decision: Option<bool>,
    pub done: bool,
    pub paid_to_host: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Event {
    pub id: u64,
    pub host: AccountId,
    pub params: EventParams,
    pub door_key: Option<PublicKey>,
    pub tickets: u32,
    pub cancelled: bool,
    pub settled: bool,
    pub no_show_pot: U128,
    pub headcounts: Vec<Headcount>,
    pub pledges: Vec<Pledge>,
    pub programs: Vec<ProgramLink>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum TicketStatus {
    Committed,
    Cancelled,
    /// `verified`: the guest's own account scanned a code signed by the door key.
    CheckedIn { at_ms: u64, verified: bool },
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Ticket {
    pub event_id: u64,
    pub deposit: U128,
    pub waived: bool,
    pub status: TicketStatus,
    pub referrer: Option<TokenId>,
    pub referrals: u32,
    /// Checked in after attending an event run by a different host.
    pub proven: bool,
}

#[near(serializers = [json])]
pub struct TicketView {
    pub token_id: TokenId,
    pub owner: AccountId,
    #[serde(flatten)]
    pub ticket: Ticket,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Program {
    pub id: u64,
    pub owner: AccountId,
    pub title: String,
    pub tag: String,
    pub rate: U128,
    pub per_event_cap: u32,
    /// Funded and not reserved for an event.
    pub available: U128,
    pub paid_out: U128,
}

#[near(serializers = [json])]
pub struct Report {
    pub committed: u32,
    pub cancelled: u32,
    pub checked_in: u32,
    pub verified: u32,
    pub proven: u32,
    pub no_shows: u32,
    pub max_headcount: Option<u32>,
    pub flagged: bool,
    pub settled: bool,
    pub no_show_pot: U128,
}

/// What a USDC transfer to this contract is for (`msg` of `ft_transfer_call`).
#[near(serializers = [json])]
pub enum DepositMsg {
    /// `for_account`: the ticket holder when someone else pays (a friend, or NEAR Intents).
    Rsvp { event_id: u64, referrer: Option<TokenId>, for_account: Option<AccountId> },
    Pledge { event_id: u64, rate: U128, cap: u32, proven_only: bool },
    FundProgram { program_id: u64 },
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    usdc: AccountId,
    delays: Delays,
    tokens: NonFungibleToken,
    next_event: u64,
    next_ticket: u64,
    next_program: u64,
    events: LookupMap<u64, Event>,
    event_tickets: LookupMap<u64, Vec<TokenId>>,
    tickets: LookupMap<TokenId, Ticket>,
    /// (event, account that paid or RSVP'd): one RSVP per account per event.
    buyers: LookupMap<String, TokenId>,
    attended: LookupMap<AccountId, u32>,
    hosts_seen: LookupMap<AccountId, Vec<AccountId>>,
    owed: LookupMap<AccountId, u128>,
    programs: LookupMap<u64, Program>,
    /// Door keys already added to this account as function-call keys (a host may reuse one).
    door_keys: LookupMap<PublicKey, ()>,
}

fn buyer_key(event_id: u64, account: &AccountId) -> String {
    format!("{event_id}:{account}")
}

fn now_ms() -> u64 {
    env::block_timestamp_ms()
}

/// The bytes a door key signs for one 20-second window.
pub fn door_message(event_id: u64, window: u64) -> Vec<u8> {
    format!("showup:door:{event_id}:{window}").into_bytes()
}

#[near]
impl Contract {
    #[init]
    #[private]
    pub fn new(usdc: AccountId, delays: Option<Delays>) -> Self {
        Self {
            usdc,
            delays: delays.unwrap_or_default(),
            tokens: NonFungibleToken::new(
                Key::Tokens,
                env::current_account_id(),
                Some(Key::TokenMetadata),
                Some(Key::Enumeration),
                None::<Key>,
            ),
            next_event: 1,
            next_ticket: 1,
            next_program: 1,
            events: LookupMap::new(Key::Events),
            event_tickets: LookupMap::new(Key::EventTickets),
            tickets: LookupMap::new(Key::Tickets),
            buyers: LookupMap::new(Key::Buyers),
            attended: LookupMap::new(Key::Attended),
            hosts_seen: LookupMap::new(Key::HostsSeen),
            owed: LookupMap::new(Key::Owed),
            programs: LookupMap::new(Key::Programs),
            door_keys: LookupMap::new(Key::DoorKeys),
        }
    }

    // ---------- Events ----------

    pub fn create_event(&mut self, params: EventParams) -> u64 {
        let now = now_ms();
        require!(!params.title.trim().is_empty(), "A title is required");
        require!(params.starts_at_ms > now, "The event must start in the future");
        require!(params.ends_at_ms > params.starts_at_ms, "The event must end after it starts");
        require!(params.cancel_cutoff_ms <= params.starts_at_ms, "The cancel cutoff must be before the start");
        require!(params.capacity > 0 && params.capacity <= MAX_CAPACITY, "Capacity must be 1 to 300");
        let id = self.next_event;
        self.next_event += 1;
        let event = Event {
            id,
            host: env::predecessor_account_id(),
            params,
            door_key: None,
            tickets: 0,
            cancelled: false,
            settled: false,
            no_show_pot: U128(0),
            headcounts: vec![],
            pledges: vec![],
            programs: vec![],
        };
        self.events.insert(id, event);
        self.event_tickets.insert(id, vec![]);
        env::log_str(&format!("EVENT_CREATED {id}"));
        id
    }

    /// The host names the door device's key. It becomes a function-call key on this contract that can
    /// only call `door_check_in` and `door_record_headcount`, and it signs the rotating check-in codes.
    pub fn add_door_key(&mut self, event_id: u64, public_key: PublicKey) -> Option<Promise> {
        let mut event = self.event_or_panic(event_id);
        require!(env::predecessor_account_id() == event.host, "Only the host can add a door key");
        require!(public_key.curve_type() == CurveType::ED25519, "The door key must be ed25519");
        event.door_key = Some(public_key.clone());
        self.events.insert(event_id, event);
        if self.door_keys.contains_key(&public_key) {
            return None;
        }
        self.door_keys.insert(public_key.clone(), ());
        #[allow(deprecated)]
        Some(Promise::new(env::current_account_id()).add_access_key(
            public_key,
            NearToken::from_millinear(500),
            env::current_account_id(),
            "door_check_in,door_record_headcount",
        ))
    }

    /// The host cancels before settlement: every deposit and pledge is refunded in full.
    pub fn cancel_event(&mut self, event_id: u64) {
        let mut event = self.event_or_panic(event_id);
        require!(env::predecessor_account_id() == event.host, "Only the host can cancel");
        require!(!event.cancelled && !event.settled, "Already cancelled or settled");
        event.cancelled = true;
        for token_id in self.event_tickets.get(&event_id).cloned().unwrap_or_default() {
            let mut ticket = self.tickets.get(&token_id).cloned().unwrap();
            if ticket.status == TicketStatus::Committed {
                let owner = self.owner_of(&token_id);
                self.credit(&owner, ticket.deposit.0);
                ticket.status = TicketStatus::Cancelled;
                self.tickets.insert(token_id, ticket);
            }
        }
        for pledge in event.pledges.iter_mut().filter(|p| !p.done) {
            let total = pledge.rate.0 * pledge.cap as u128;
            let sponsor = pledge.sponsor.clone();
            self.credit(&sponsor, total);
            pledge.done = true;
        }
        for link in event.programs.iter_mut().filter(|l| l.approved && !l.done) {
            if let Some(mut program) = self.programs.get(&link.program_id).cloned() {
                program.available = U128(program.available.0 + link.reserved.0);
                self.programs.insert(link.program_id, program);
            }
            link.done = true;
        }
        self.events.insert(event_id, event);
        env::log_str(&format!("EVENT_CANCELLED {event_id}"));
    }

    // ---------- RSVP ----------

    /// USDC arrives here for an RSVP, a sponsor pledge or a bounty program. Returns what to refund.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdc, "Only USDC is accepted");
        let parsed: DepositMsg = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Unknown deposit message"));
        match parsed {
            DepositMsg::Rsvp { event_id, referrer, for_account } => {
                let event = self.event_or_panic(event_id);
                let deposit = event.params.deposit.0;
                require!(amount.0 >= deposit, "Deposit too small");
                let holder = for_account.unwrap_or(sender_id);
                self.mint_ticket(event, holder, deposit, false, referrer);
                PromiseOrValue::Value(U128(amount.0 - deposit))
            }
            DepositMsg::Pledge { event_id, rate, cap, proven_only } => {
                let mut event = self.event_or_panic(event_id);
                require!(!event.cancelled && !event.settled, "This event is closed");
                require!(now_ms() < event.params.ends_at_ms, "This event has ended");
                require!(rate.0 > 0 && cap > 0, "Rate and cap must be above zero");
                let total = rate.0.checked_mul(cap as u128).unwrap_or_else(|| env::panic_str("Too large"));
                require!(amount.0 >= total, "The pledge must cover rate × cap");
                event.pledges.push(Pledge {
                    sponsor: sender_id,
                    rate,
                    cap,
                    proven_only,
                    decision: None,
                    done: false,
                    paid_to_host: U128(0),
                });
                env::log_str(&format!("PLEDGE {event_id} {} {cap}", rate.0));
                self.events.insert(event_id, event);
                PromiseOrValue::Value(U128(amount.0 - total))
            }
            DepositMsg::FundProgram { program_id } => {
                let mut program = self.programs.get(&program_id).cloned().unwrap_or_else(|| env::panic_str("No such program"));
                program.available = U128(program.available.0 + amount.0);
                self.programs.insert(program_id, program);
                PromiseOrValue::Value(U128(0))
            }
        }
    }

    /// A free RSVP for guests whose attendance record meets the event's waiver.
    pub fn rsvp_waived(&mut self, event_id: u64, referrer: Option<TokenId>) -> TokenId {
        let event = self.event_or_panic(event_id);
        let guest = env::predecessor_account_id();
        let needed = event.params.waive_after.unwrap_or_else(|| env::panic_str("This event has no waiver"));
        require!(self.attended_count(guest.clone()) >= needed, "Not enough past check-ins for a free RSVP");
        self.mint_ticket(event, guest, 0, true, referrer)
    }

    /// Before the cancel cutoff the holder cancels and gets the deposit back.
    pub fn cancel(&mut self, token_id: TokenId) -> Option<Promise> {
        let owner = self.owner_of(&token_id);
        require!(env::predecessor_account_id() == owner, "Only the ticket holder can cancel");
        let mut ticket = self.ticket_or_panic(&token_id);
        let event = self.event_or_panic(ticket.event_id);
        require!(ticket.status == TicketStatus::Committed, "This ticket can't be cancelled");
        require!(now_ms() < event.params.cancel_cutoff_ms, "The cancel cutoff has passed");
        ticket.status = TicketStatus::Cancelled;
        let deposit = ticket.deposit.0;
        self.tickets.insert(token_id.clone(), ticket);
        env::log_str(&format!("CANCELLED {token_id}"));
        self.pay(owner, deposit)
    }

    // ---------- Door ----------

    /// The guest's own account checks in with the code on the door screen: the door key's signature
    /// over this event and a 20-second window from the last 2 minutes.
    pub fn check_in(&mut self, token_id: TokenId, window: u64, door_sig: Base64VecU8) -> Option<Promise> {
        let owner = self.owner_of(&token_id);
        require!(env::predecessor_account_id() == owner, "Check in from the account that holds the ticket");
        let ticket = self.ticket_or_panic(&token_id);
        let event = self.event_or_panic(ticket.event_id);
        let door_key = event.door_key.clone().unwrap_or_else(|| env::panic_str("This event has no door key yet"));
        let current = now_ms() / DOOR_WINDOW_MS;
        // One window of slack for a door device whose clock runs slightly ahead of the chain.
        require!(window <= current + 1 && window + DOOR_WINDOWS_VALID >= current, "This door code has expired");
        let sig: [u8; 64] = door_sig.0.as_slice().try_into().unwrap_or_else(|_| env::panic_str("Bad signature length"));
        let pk: [u8; 32] = door_key.as_bytes()[1..33].try_into().unwrap();
        require!(env::ed25519_verify(&sig, door_message(event.id, window), &pk), "The door code's signature doesn't match");
        self.mark_checked_in(token_id, owner, ticket, event, true)
    }

    /// Fallback for a guest without a phone: the door device scans their ticket. It refunds the deposit
    /// but doesn't count as verified for sponsors.
    pub fn door_check_in(&mut self, token_id: TokenId) -> Option<Promise> {
        let ticket = self.ticket_or_panic(&token_id);
        let event = self.event_or_panic(ticket.event_id);
        self.assert_door(&event);
        let owner = self.owner_of(&token_id);
        self.mark_checked_in(token_id, owner, ticket, event, false)
    }

    /// A crowd count from a photo, made inside NEAR AI's TEE; the signed evidence is kept off chain.
    pub fn door_record_headcount(&mut self, event_id: u64, count: u32, evidence_hash: String) {
        let mut event = self.event_or_panic(event_id);
        self.assert_door(&event);
        let now = now_ms();
        require!(now >= event.params.starts_at_ms && now <= event.params.ends_at_ms, "Headcounts are taken during the event");
        require!(evidence_hash.len() == 64, "evidence_hash is a hex sha256");
        event.headcounts.push(Headcount { count, at_ms: now, evidence_hash });
        self.events.insert(event_id, event);
        env::log_str(&format!("HEADCOUNT {event_id} {count}"));
    }

    // ---------- After the event ----------

    /// One hour after the event: no-show deposits go to the guests who came (or the host).
    pub fn settle(&mut self, event_id: u64) {
        let mut event = self.event_or_panic(event_id);
        require!(!event.cancelled && !event.settled, "Already cancelled or settled");
        require!(now_ms() >= event.params.ends_at_ms + self.delays.settle_ms, "Too early to settle");
        let ids = self.event_tickets.get(&event_id).cloned().unwrap_or_default();
        let mut pot: u128 = 0;
        let mut weights: Vec<(AccountId, u128)> = vec![];
        for token_id in &ids {
            let ticket = self.tickets.get(token_id).cloned().unwrap();
            match ticket.status {
                TicketStatus::Committed => {
                    pot += ticket.deposit.0;
                    if ticket.waived {
                        let owner = self.owner_of(token_id);
                        let n = self.attended.get(&owner).copied().unwrap_or(0);
                        self.attended.insert(owner, n.saturating_sub(1));
                    }
                }
                TicketStatus::CheckedIn { .. } => {
                    // Weight in half-guests: 2 for you, 1 per friend who came through your link.
                    weights.push((self.owner_of(token_id), 2 + ticket.referrals.min(MAX_REFERRALS) as u128));
                }
                TicketStatus::Cancelled => {}
            }
        }
        let total_w: u128 = weights.iter().map(|(_, w)| w).sum();
        let host = event.host.clone();
        if pot > 0 {
            if event.params.no_show_rule == NoShowRule::ToHost || total_w == 0 {
                self.credit(&host, pot);
            } else {
                let mut paid = 0;
                for (who, w) in &weights {
                    let share = pot * w / total_w;
                    paid += share;
                    self.credit(who, share);
                }
                self.credit(&host, pot - paid);
            }
        }
        event.settled = true;
        event.no_show_pot = U128(pot);
        self.events.insert(event_id, event);
        env::log_str(&format!("SETTLED {event_id} {pot}"));
    }

    /// 48 hours after the event: sponsors and bounty programs pay the host per counted guest, and the
    /// rest goes back. Flagged payouts wait for the funder, or 7 more days.
    pub fn release_sponsors(&mut self, event_id: u64) {
        let mut event = self.event_or_panic(event_id);
        require!(!event.cancelled, "This event was cancelled");
        let now = now_ms();
        let opens = event.params.ends_at_ms + self.delays.release_ms;
        require!(now >= opens, "Sponsor payouts aren't open yet");
        let report = self.report(event_id);
        let auto_approve = now >= opens + self.delays.decide_ms;
        let host = event.host.clone();
        for pledge in event.pledges.iter_mut().filter(|p| !p.done) {
            let approve = match (report.flagged, pledge.decision) {
                (_, Some(d)) => d,
                (false, None) => true,
                (true, None) if auto_approve => true,
                (true, None) => continue,
            };
            let total = pledge.rate.0 * pledge.cap as u128;
            let counted = if pledge.proven_only { report.proven } else { report.verified };
            let earned = if approve { pledge.rate.0 * counted.min(pledge.cap) as u128 } else { 0 };
            let sponsor = pledge.sponsor.clone();
            self.credit(&host, earned);
            self.credit(&sponsor, total - earned);
            pledge.paid_to_host = U128(earned);
            pledge.done = true;
        }
        for link in event.programs.iter_mut().filter(|l| l.approved && !l.done) {
            let approve = match (report.flagged, link.decision) {
                (_, Some(d)) => d,
                (false, None) => true,
                (true, None) if auto_approve => true,
                (true, None) => continue,
            };
            let mut program = self.programs.get(&link.program_id).cloned().unwrap();
            let earned = if approve { program.rate.0 * report.verified.min(program.per_event_cap) as u128 } else { 0 };
            self.credit(&host, earned);
            program.available = U128(program.available.0 + link.reserved.0 - earned);
            program.paid_out = U128(program.paid_out.0 + earned);
            self.programs.insert(link.program_id, program);
            link.paid_to_host = U128(earned);
            link.done = true;
        }
        self.events.insert(event_id, event);
    }

    /// A sponsor approves or refuses its payout on a flagged event, then payouts run.
    pub fn sponsor_decide(&mut self, event_id: u64, pledge_index: u32, approve: bool) {
        let mut event = self.event_or_panic(event_id);
        let pledge = event.pledges.get_mut(pledge_index as usize).unwrap_or_else(|| env::panic_str("No such pledge"));
        require!(env::predecessor_account_id() == pledge.sponsor, "Only the sponsor decides");
        require!(!pledge.done, "Already paid out");
        pledge.decision = Some(approve);
        self.events.insert(event_id, event);
        self.release_sponsors(event_id);
    }

    // ---------- Bounty programs ----------

    pub fn create_program(&mut self, title: String, tag: String, rate: U128, per_event_cap: u32) -> u64 {
        require!(rate.0 > 0 && per_event_cap > 0, "Rate and cap must be above zero");
        let id = self.next_program;
        self.next_program += 1;
        self.programs.insert(
            id,
            Program { id, owner: env::predecessor_account_id(), title, tag, rate, per_event_cap, available: U128(0), paid_out: U128(0) },
        );
        id
    }

    /// The host asks a program to pay per verified guest at this event.
    pub fn apply_program(&mut self, event_id: u64, program_id: u64) {
        let mut event = self.event_or_panic(event_id);
        require!(env::predecessor_account_id() == event.host, "Only the host can apply");
        require!(self.programs.get(&program_id).is_some(), "No such program");
        require!(!event.programs.iter().any(|l| l.program_id == program_id), "Already applied");
        require!(now_ms() < event.params.ends_at_ms && !event.cancelled, "This event is closed");
        event.programs.push(ProgramLink { program_id, approved: false, reserved: U128(0), decision: None, done: false, paid_to_host: U128(0) });
        self.events.insert(event_id, event);
    }

    /// The program owner approves an event; `rate × per_event_cap` is set aside from the budget.
    pub fn program_approve(&mut self, program_id: u64, event_id: u64) {
        let mut program = self.programs.get(&program_id).cloned().unwrap_or_else(|| env::panic_str("No such program"));
        require!(env::predecessor_account_id() == program.owner, "Only the program owner approves");
        let mut event = self.event_or_panic(event_id);
        let link = event.programs.iter_mut().find(|l| l.program_id == program_id).unwrap_or_else(|| env::panic_str("This event didn't apply"));
        require!(!link.approved, "Already approved");
        let reserve = program.rate.0 * program.per_event_cap as u128;
        require!(program.available.0 >= reserve, "Not enough budget left");
        program.available = U128(program.available.0 - reserve);
        link.approved = true;
        link.reserved = U128(reserve);
        self.programs.insert(program_id, program);
        self.events.insert(event_id, event);
    }

    /// The program owner decides a flagged event's payout, then payouts run.
    pub fn program_decide(&mut self, program_id: u64, event_id: u64, approve: bool) {
        let program = self.programs.get(&program_id).cloned().unwrap_or_else(|| env::panic_str("No such program"));
        require!(env::predecessor_account_id() == program.owner, "Only the program owner decides");
        let mut event = self.event_or_panic(event_id);
        let link = event.programs.iter_mut().find(|l| l.program_id == program_id).unwrap_or_else(|| env::panic_str("No such link"));
        require!(!link.done, "Already paid out");
        link.decision = Some(approve);
        self.events.insert(event_id, event);
        self.release_sponsors(event_id);
    }

    /// The program owner takes back budget that isn't set aside for an approved event.
    pub fn program_withdraw(&mut self, program_id: u64) -> Option<Promise> {
        let mut program = self.programs.get(&program_id).cloned().unwrap_or_else(|| env::panic_str("No such program"));
        require!(env::predecessor_account_id() == program.owner, "Only the program owner");
        let amount = program.available.0;
        program.available = U128(0);
        let owner = program.owner.clone();
        self.programs.insert(program_id, program);
        self.pay(owner, amount)
    }

    // ---------- Payouts ----------

    /// Pays the caller everything credited to them.
    pub fn withdraw(&mut self) -> Option<Promise> {
        let who = env::predecessor_account_id();
        let amount = self.owed.remove(&who).unwrap_or(0);
        self.pay(who, amount)
    }

    /// Anyone can push credited payouts to up to 20 accounts (the app does this after settlement).
    pub fn withdraw_for(&mut self, accounts: Vec<AccountId>) {
        require!(accounts.len() <= 20, "At most 20 accounts at a time");
        for who in accounts {
            let amount = self.owed.remove(&who).unwrap_or(0);
            self.pay(who, amount);
        }
    }

    #[private]
    pub fn on_pay(&mut self, account: AccountId, amount: U128) {
        if env::promise_result_checked(0, 64).is_err() {
            // The token refused (for example the account isn't registered on USDC): keep it owed.
            self.credit(&account, amount.0);
            env::log_str(&format!("PAY_FAILED {account} {}", amount.0));
        }
    }

    // ---------- Views ----------

    pub fn get_event(&self, event_id: u64) -> Option<Event> {
        self.events.get(&event_id).cloned()
    }

    pub fn last_event_id(&self) -> u64 {
        self.next_event - 1
    }

    pub fn get_ticket(&self, token_id: TokenId) -> Option<TicketView> {
        let ticket = self.tickets.get(&token_id).cloned()?;
        Some(TicketView { owner: self.owner_of(&token_id), token_id, ticket })
    }

    pub fn get_tickets(&self, event_id: u64, from: Option<u32>, limit: Option<u32>) -> Vec<TicketView> {
        let ids = self.event_tickets.get(&event_id).cloned().unwrap_or_default();
        ids.into_iter()
            .skip(from.unwrap_or(0) as usize)
            .take(limit.unwrap_or(100) as usize)
            .filter_map(|id| self.get_ticket(id))
            .collect()
    }

    pub fn ticket_for(&self, event_id: u64, account_id: AccountId) -> Option<TokenId> {
        self.buyers.get(&buyer_key(event_id, &account_id)).cloned()
    }

    pub fn attended_count(&self, account_id: AccountId) -> u32 {
        self.attended.get(&account_id).copied().unwrap_or(0)
    }

    pub fn hosts_attended(&self, account_id: AccountId) -> u32 {
        self.hosts_seen.get(&account_id).map(|v| v.len() as u32).unwrap_or(0)
    }

    pub fn owed(&self, account_id: AccountId) -> U128 {
        U128(self.owed.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_program(&self, program_id: u64) -> Option<Program> {
        self.programs.get(&program_id).cloned()
    }

    pub fn delays(&self) -> Delays {
        self.delays.clone()
    }

    pub fn usdc(&self) -> AccountId {
        self.usdc.clone()
    }

    pub fn report(&self, event_id: u64) -> Report {
        let event = self.event_or_panic(event_id);
        let mut r = Report {
            committed: 0,
            cancelled: 0,
            checked_in: 0,
            verified: 0,
            proven: 0,
            no_shows: 0,
            max_headcount: event.headcounts.iter().map(|h| h.count).max(),
            flagged: false,
            settled: event.settled,
            no_show_pot: event.no_show_pot,
        };
        for token_id in self.event_tickets.get(&event_id).cloned().unwrap_or_default() {
            let ticket = self.tickets.get(&token_id).cloned().unwrap();
            match ticket.status {
                TicketStatus::Cancelled => r.cancelled += 1,
                TicketStatus::Committed => {
                    r.committed += 1;
                    r.no_shows += 1;
                }
                TicketStatus::CheckedIn { verified, .. } => {
                    r.committed += 1;
                    r.checked_in += 1;
                    if verified {
                        r.verified += 1;
                        if ticket.proven {
                            r.proven += 1;
                        }
                    }
                }
            }
        }
        if now_ms() < event.params.ends_at_ms {
            // Before the end, nobody is a no-show yet.
            r.no_shows = 0;
        }
        r.flagged = match r.max_headcount {
            None => event.params.require_headcount,
            Some(max) => {
                let allowed = max as u64 * (100 + event.params.flag_pct as u64) + event.params.flag_abs as u64 * 100;
                r.verified as u64 * 100 > allowed
            }
        };
        r
    }

    // ---------- Internal ----------

    fn event_or_panic(&self, event_id: u64) -> Event {
        self.events.get(&event_id).cloned().unwrap_or_else(|| env::panic_str("No such event"))
    }

    fn ticket_or_panic(&self, token_id: &TokenId) -> Ticket {
        self.tickets.get(token_id).cloned().unwrap_or_else(|| env::panic_str("No such ticket"))
    }

    fn owner_of(&self, token_id: &TokenId) -> AccountId {
        self.tokens.owner_by_id.get(token_id).unwrap_or_else(|| env::panic_str("No such ticket"))
    }

    fn assert_door(&self, event: &Event) {
        let caller = env::predecessor_account_id();
        let by_door_key = caller == env::current_account_id() && event.door_key.as_ref() == Some(&env::signer_account_pk());
        require!(by_door_key || caller == event.host, "Only this event's door key or host");
    }

    fn mint_ticket(&mut self, mut event: Event, holder: AccountId, deposit: u128, waived: bool, referrer: Option<TokenId>) -> TokenId {
        require!(!event.cancelled && !event.settled, "This event is closed");
        require!(now_ms() < event.params.starts_at_ms, "RSVPs are closed");
        require!(event.tickets < event.params.capacity, "This event is full");
        let key = buyer_key(event.id, &holder);
        require!(self.buyers.get(&key).is_none(), "This account already has a ticket");
        let referrer = referrer.filter(|r| self.tickets.get(r).map(|t| t.event_id == event.id).unwrap_or(false));
        let token_id = self.next_ticket.to_string();
        self.next_ticket += 1;
        event.tickets += 1;
        let metadata = TokenMetadata {
            title: Some(format!("{} · Ticket #{}", event.params.title, token_id)),
            description: Some(format!("ShowUp ticket. Holds a deposit of {} USDC units until check-in.", deposit)),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(now_ms().to_string()),
            expires_at: None,
            starts_at: Some(event.params.starts_at_ms.to_string()),
            updated_at: None,
            extra: Some(format!("{{\"event_id\":{}}}", event.id)),
            reference: None,
            reference_hash: None,
        };
        self.tokens.internal_mint_with_refund(token_id.clone(), holder.clone(), Some(metadata), None);
        self.tickets.insert(
            token_id.clone(),
            Ticket { event_id: event.id, deposit: U128(deposit), waived, status: TicketStatus::Committed, referrer, referrals: 0, proven: false },
        );
        self.buyers.insert(key, token_id.clone());
        let mut ids = self.event_tickets.get(&event.id).cloned().unwrap_or_default();
        ids.push(token_id.clone());
        self.event_tickets.insert(event.id, ids);
        env::log_str(&format!("RSVP {} {} {}", event.id, token_id, holder));
        self.events.insert(event.id, event);
        token_id
    }

    fn mark_checked_in(&mut self, token_id: TokenId, owner: AccountId, mut ticket: Ticket, event: Event, verified: bool) -> Option<Promise> {
        require!(!event.cancelled, "This event was cancelled");
        let now = now_ms();
        require!(ticket.status == TicketStatus::Committed, "This ticket can't check in");
        require!(now + 60 * 60 * 1000 >= event.params.starts_at_ms && now <= event.params.ends_at_ms, "Check-in opens an hour before the start");
        let mut seen = self.hosts_seen.get(&owner).cloned().unwrap_or_default();
        ticket.proven = seen.iter().any(|h| *h != event.host);
        if !seen.contains(&event.host) && seen.len() < 50 {
            seen.push(event.host.clone());
        }
        self.hosts_seen.insert(owner.clone(), seen);
        let n = self.attended.get(&owner).copied().unwrap_or(0);
        self.attended.insert(owner.clone(), n + 1);
        ticket.status = TicketStatus::CheckedIn { at_ms: now, verified };
        if let Some(ref_id) = ticket.referrer.clone() {
            if let Some(mut referrer) = self.tickets.get(&ref_id).cloned() {
                referrer.referrals = (referrer.referrals + 1).min(MAX_REFERRALS);
                self.tickets.insert(ref_id, referrer);
            }
        }
        let deposit = ticket.deposit.0;
        self.tickets.insert(token_id.clone(), ticket);
        env::log_str(&format!("CHECKED_IN {} {} {}", event.id, token_id, if verified { "verified" } else { "desk" }));
        self.pay(owner, deposit)
    }

    fn credit(&mut self, who: &AccountId, amount: u128) {
        if amount == 0 {
            return;
        }
        let n = self.owed.get(who).copied().unwrap_or(0);
        self.owed.insert(who.clone(), n + amount);
    }

    fn pay(&mut self, who: AccountId, amount: u128) -> Option<Promise> {
        if amount == 0 {
            return None;
        }
        Some(
            Promise::new(self.usdc.clone())
                .function_call(
                    "ft_transfer".to_string(),
                    near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({ "receiver_id": who, "amount": U128(amount) })).unwrap(),
                    NearToken::from_yoctonear(1),
                    GAS_FT_TRANSFER,
                )
                .then(Self::ext(env::current_account_id()).with_static_gas(GAS_ON_PAY).on_pay(who, U128(amount))),
        )
    }

    fn assert_transferable(&self, token_id: &TokenId) {
        let ticket = self.ticket_or_panic(token_id);
        let event = self.event_or_panic(ticket.event_id);
        require!(ticket.status == TicketStatus::Committed, "Only an unused ticket can change hands");
        require!(now_ms() < event.params.starts_at_ms, "Tickets can change hands until the event starts");
    }
}

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        self.assert_transferable(&token_id);
        self.tokens.nft_transfer(receiver_id, token_id, approval_id, memo)
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.assert_transferable(&token_id);
        self.tokens.nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(previous_owner_id, receiver_id, token_id, approved_account_ids)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "ShowUp tickets".to_string(),
            symbol: "SHOWUP".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}
