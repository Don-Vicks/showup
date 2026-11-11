# ShowUp

**RSVPs backed by a small deposit you get back at the door, and sponsors who pay hosts per verified attendee.**

Free RSVPs cost nothing to ignore, so hosts plan food, seats and venues for people who never come, and sponsors pay flat fees for headcounts nobody can check. ShowUp puts a small USDC deposit behind every RSVP and moves event money by rules in a NEAR contract:

1. **Guests commit** with a deposit. It sits in the contract, not with the host.
2. **At the door, guests check in from their own phone** by scanning a code that the door screen signs and rotates every 20 seconds. The deposit comes straight back.
3. **No-shows' deposits** are split among the guests who came (weighted by friends they brought), or go to the host, by a rule fixed when the event is created.
4. **Sponsors pledge per verified guest** ("2 USDC per guest, up to 100"). Two days after the event the contract pays the host for the guests who were really there and returns the rest. If check-ins look inflated, the payout waits for the sponsor.

[![Live site](https://img.shields.io/badge/Live-showup--lake.vercel.app-1f4bff)](https://showup-lake.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-555)](LICENSE)

Built for NEAR HACKATHON (1–14 Nov 2026). Tracks: realworld, social, nfts.

**No wallet? Start at [showup-lake.vercel.app/proof](https://showup-lake.vercel.app/proof):** one real testnet event, step by step, with every transaction linked and the numbers read live from the contract.

## Status

| Piece | State |
| --- | --- |
| Contract: events, deposits, ticket NFTs (NEP-171), two-sided check-in, desk check-in, settlement, sponsor pledges, flags, bounty programs, cancellations | Built; sandbox tests below |
| Contract: event details (host name, description, cover link, agenda) under their own storage key, paid for by the host | Built; sandbox test below; on testnet since 11 Nov |
| Web app: home with an entry point per role, the `/proof` walkthrough, event page with cover and details, create and edit event, ticket, check-in link, door screen, report, sponsor browse and pledge pages, My ShowUp (tickets, hosted events with settle and release, pledges with flagged decisions), bounty programs (list, create, fund, apply, approve), X share card | Built; deployed at https://showup-lake.vercel.app |
| Contract on NEAR testnet | Deployed at [`showup-app.testnet`](https://testnet.nearblocks.io/address/showup-app.testnet) (10 Nov), with the real delays: 1 hour, 48 hours, 7 days |
| Crowd headcount from photos inside NEAR AI's TEEs | Not built. The contract stores counts and their evidence hash; until counts exist, sponsor payouts for events that require one wait for the sponsor |
| Paying the deposit from another chain (NEAR Intents 1Click) | Not built; Intents has no testnet (FAQ Q-007) |
| Email sign-in (Privy) | Not built; sign-in is any NEAR wallet through NEAR Connect |

## How to test

**The contract on a local NEAR node** (Rust stable, `wasm32-unknown-unknown`, `cargo-near`):

```bash
cd contracts && cargo test -p showup --test sandbox -- --test-threads=1
```

Each test deploys ShowUp and a USDC-like token (`contracts/mock-ft`) to a sandbox and runs a whole story: deposits returned at the door, no-shows split by referral weight, forged and expired door codes refused, a sponsor paying per verified guest, a flagged event refused by its sponsor, cancels and ticket transfers, an event cancelled with refunds, a bounty program, a free RSVP for a proven guest, and event details that only the host can set and must pay storage for. The sandbox tests deploy with minutes instead of days for the post-event waits (`Delays` in `new`); real deployments use 1 hour, 48 hours and 7 days.

**The web app:**

```bash
cd web && pnpm install && pnpm build && pnpm start
```

Set `NEXT_PUBLIC_SHOWUP_CONTRACT` to a deployed ShowUp contract (and `NEXT_PUBLIC_NEAR_NETWORK=testnet`).

## How check-in is proven

- The host registers a door key from the door screen (`add_door_key`). The screen keeps the private key in the browser and signs `showup:door:<event>:<20-second window>` into a QR code.
- The guest's phone camera opens the code's link, and the guest's own account calls `check_in(token, window, signature)`. The contract checks the ed25519 signature against the event's door key and that the window is from the last 2 minutes. So a check-in needs both the door and the guest.
- A guest without a phone can be checked in at the desk (`door_check_in`). That refunds the deposit but doesn't count for sponsors.
- A guest who has checked in at events by other hosts is "proven"; sponsors can choose to pay for proven guests only, and hosts can waive the deposit for guests with enough past check-ins.

## Money rules

| Money | Leaves the contract |
| --- | --- |
| A guest's deposit | To the ticket holder at check-in, or on cancel before the cutoff |
| No-show deposits | One hour after the event: split among checked-in guests (weight 2, plus 1 per referred friend who came, up to 3), or to the host |
| A sponsor pledge (`rate × cap`, paid up front) | 48 hours after the event: `rate × counted guests` to the host, the rest to the sponsor. Flagged: the sponsor decides, or after 7 more days it goes to the host |
| A bounty program's budget | The same per approved event; unused reservations go back to the program |
| Everything, if the host cancels | Back to whoever paid it |

There is no withdraw method for hosts, sponsors or the deployer. End-of-event payouts are credited and paid with `withdraw` / `withdraw_for`.

## Testnet data

- **Event 4, "ShowUp test run"** is a real run with test accounts (10–11 Nov): four RSVPs, two phone check-ins, one desk check-in, one no-show, a refused check-in, settlement and payouts. `/proof` lists its transactions; the sponsor payout opens 48 hours after it ended.
- **Events 1–3 are demo events** marked "(demo)", hosted by `demo-host.showup-app.testnet`, with descriptions written for the demo. Their cover photos are from [Unsplash](https://unsplash.com) (Unsplash License), not from those events.
- **Program 1** is a demo bounty program funded with 10 test USDC by `sponsor.showup-app.testnet`; event 1 is approved and event 3 has applied.

## Repository

```
contracts/showup    The NEAR contract (near-sdk 5.29, near-contract-standards)
contracts/mock-ft   A 6-decimal token for the sandbox tests
web                 Next.js app (NEAR Connect for wallets)
SPEC.md             The product specification
```

## Other project

Victor's other NEAR HACKATHON entry is [Aftercall](https://github.com/Don-Vicks/aftercall), private meeting notes that do the follow-ups. The two are independent (FAQ Q-015).

## Built with

- **AI-written code:** most of this repository was written by Claude Code under Victor's direction, from Victor's product decisions.
- **Share cards** follow the design of Victor's earlier product xCardGen (Dec 2025, before this hackathon); no xCardGen code is in this repository.
- **Libraries:** near-sdk, near-contract-standards, near-workspaces, ed25519-dalek, bs58 (tests); Next.js, React, @hot-labs/near-connect, @noble/curves, uqr.

## License

[MIT](LICENSE).
