# ShowUp

**Sponsor money that only pays for people who came, and RSVPs backed by a dollar you get back at the door.**

Ecosystems, brands and communities fund meetups with flat fees and get back a headcount nobody can check. Free RSVPs cost nothing to ignore, so hosts also plan food and seats for people who never come. ShowUp moves event money by rules in a NEAR contract, and gives every sponsor a receipt that lists which guests counted and why:

1. **Guests commit** with a deposit. It sits in the contract, not with the host.
2. **At the door, guests check in from their own phone** by scanning a code that the door screen signs and rotates every 20 seconds. The deposit comes straight back.
3. **No-shows' deposits** are split among the guests who came (weighted by friends they brought), or go to the host, by a rule fixed when the event is created.
4. **Sponsors pledge per verified guest** ("2 USDC per guest, up to 100"). Two days after the event the contract pays the host for the guests who were really there and returns the rest. If check-ins look inflated, the payout waits for the sponsor.

[![Live site](https://img.shields.io/badge/Live-showup--lake.vercel.app-1f4bff)](https://showup-lake.vercel.app)
[![License: MIT](https://img.shields.io/badge/license-MIT-555)](LICENSE)

Built for NEAR HACKATHON (1–14 Nov 2026). Tracks: realworld, social, nfts.

**No wallet? Start at [showup-lake.vercel.app/proof](https://showup-lake.vercel.app/proof):** one real testnet event, step by step, with every transaction linked and the numbers read live from the contract.

**Demo video (60 s):** [`video/showup-demo.mp4`](video/showup-demo.mp4), real screens of the live site. Its source is in [`video/`](video) (Remotion): `scripts/capture.mjs` screenshots the site, and `npm run render` builds the video.

## Status

| Piece | State |
| --- | --- |
| Contract: events, deposits, ticket NFTs (NEP-171), two-sided check-in, desk check-in, settlement, sponsor pledges, flags, bounty programs, cancellations | Built; sandbox tests below |
| Contract: event details (host name, description, cover link, agenda) under their own storage key, paid for by the host | Built; sandbox test below; on testnet since 11 Nov |
| Web app: home with an entry point per role, the `/proof` walkthrough, event page with cover, details and paying the deposit for someone else, create and edit event, ticket, check-in link, door screen, report, sponsor receipt (every guest, counted or not, and why), sponsor browse and pledge pages, My ShowUp (tickets, hosted events with settle and release, pledges with flagged decisions), bounty programs (list, create, fund, apply, approve), X share card | Built; deployed at https://showup-lake.vercel.app |
| Contract on NEAR testnet | Deployed at [`showup-app.testnet`](https://testnet.nearblocks.io/address/showup-app.testnet) (10 Nov), with the real delays: 1 hour, 48 hours, 7 days |
| Crowd headcount from photos inside NEAR AI's TEEs | Not built. The contract stores counts and their evidence hash; until counts exist, sponsor payouts for events that require one wait for the sponsor |
| Paying the deposit from another chain (NEAR Intents 1Click) | Not built; Intents has no testnet (FAQ Q-007) |
| Email sign-in (Privy) | Not built; sign-in is any NEAR wallet through NEAR Connect |

## How to test

**The contract on a local NEAR node** (Rust stable, `wasm32-unknown-unknown`, `cargo-near`):

```bash
cd contracts && cargo test -p showup --test sandbox -- --test-threads=1
```

Each test deploys ShowUp and a USDC-like token (`contracts/mock-ft`) to a sandbox and runs a whole story: deposits returned at the door, no-shows split by referral weight, forged and expired door codes refused, a sponsor paying per verified guest, a flagged event refused by its sponsor, cancels and ticket transfers, an event cancelled with refunds, a bounty program, a free RSVP for a proven guest, a deposit paid by a friend, and event details that only the host can set and must pay storage for. The sandbox tests deploy with minutes instead of days for the post-event waits (`Delays` in `new`); real deployments use 1 hour, 48 hours and 7 days.

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
- **What this doesn't stop yet:** one person holding several NEAR accounts could check each of them in at the door. The defences today: an event that requires a crowd count is flagged when none is recorded, so its sponsor payouts wait for the sponsor, who decides with the receipt (`/e/<id>/receipt`) listing every counted account; sponsors can pay for proven guests only; and nothing is paid until 48 hours after the event. A crowd count from photos inside NEAR AI's TEEs is designed in SPEC.md but not built.

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
- **Event 5, "Dry run"** (11 Nov) ran every path the site added since: the event and its details created in one call, a guest whose deposit a friend paid, a referred guest who didn't come, a sponsor pledge, the door screen running on the live site, two check-ins with its codes, and a refused check-in. The guests are test accounts signing with near-cli, using the codes that door screen showed (its key, so the same ed25519 signatures); no browser wallet was used. Receipt: [`/e/5/receipt`](https://showup-lake.vercel.app/e/5/receipt).

  | Step | Transaction |
  | --- | --- |
  | Event created with details | [`2TrLn44d…`](https://testnet.nearblocks.io/txns/2TrLn44dozVYawJQb5rXw9hoUk1MZkqQV6hpq23zeEGY) |
  | Sponsor pledges 0.10 USDC per guest, up to 3 | [`DseuKdTy…`](https://testnet.nearblocks.io/txns/DseuKdTy5dPGTM5rJL1xG5s3SKjj6QYKhHwMyF9oTgvd) |
  | guest1 RSVPs | [`8Z62MdNe…`](https://testnet.nearblocks.io/txns/8Z62MdNeY7w2yeWA6HKrXiobMtGG88x2ozDo5XGxkNsS) |
  | guest2 pays guest4's deposit | [`45XduivZ…`](https://testnet.nearblocks.io/txns/45XduivZuj5K9M9TTVR1CdBFboTKAFbor73ZaReW8Q7u) |
  | guest3 RSVPs through guest1's link | [`EKDcCe9r…`](https://testnet.nearblocks.io/txns/EKDcCe9rEDVpN2o13GfceVBaMtaV7x9nY2yrywVZK1HD) |
  | Door key registered | [`Dqm3ZYs9…`](https://testnet.nearblocks.io/txns/Dqm3ZYs9GGoJca5XxZ7Ds9RaMg9yvUizW6YpYZSFhcYi) |
  | guest1 checks in; deposit back | [`FvSXTpbn…`](https://testnet.nearblocks.io/txns/FvSXTpbnxyBxsssaN43P5MbGKXXLB6g3MUb5ca6sLCDd) |
  | guest4 checks in; the deposit guest2 paid goes to guest4 | [`UNGXoy97…`](https://testnet.nearblocks.io/txns/UNGXoy97KH8dizbp9jMvWgiXsUrao2UCfeHjAcC1WPw) |
  | guest1 tries to check in guest3's ticket: refused | [`57PZLfZw…`](https://testnet.nearblocks.io/txns/57PZLfZwVzKahu1QNv6pVmDCxdFLPfJcoyhsAawTSYqt) |

  Settling opens an hour after the end and the sponsor payout 48 hours after; anyone can trigger either from the report and receipt pages.
- **Events 1–3 are demo events** marked "(demo)", hosted by `demo-host.showup-app.testnet`, with descriptions written for the demo. Their cover photos are from [Unsplash](https://unsplash.com) (Unsplash License), not from those events.
- **Program 1** is a demo bounty program funded with 10 test USDC by `sponsor.showup-app.testnet`; event 1 is approved and event 3 has applied.

## Claims, code and tests

Contract code is in `contracts/showup/src/lib.rs`; tests are in `contracts/showup/tests/sandbox.rs` and run on a local NEAR node.

| Claim | Code | Test |
| --- | --- | --- |
| A deposit sits in the contract and comes back to the ticket holder at check-in | `ft_on_transfer`, `mint_ticket`, `check_in` | `deposits_come_back_at_the_door_and_no_shows_are_split_by_referral_weight` |
| A check-in needs the ticket holder's own account and a door code signed in the last 2 minutes; forged, expired and other people's codes fail | `check_in` (`ed25519_verify`, window check, owner check) | `a_check_in_needs_a_fresh_door_signature_from_the_ticket_holder` |
| No-show deposits are split by weight 2 plus 1 per referred guest who came (up to 3), or go to the host | `settle` | `deposits_come_back_…_split_by_referral_weight` |
| A sponsor pays `rate × verified guests` (capped) 48 hours after; the rest goes back; desk check-ins don't count | `release_sponsors` | `a_sponsor_pays_the_host_per_verified_guest_and_gets_the_rest_back` |
| A flagged event's payout waits for the sponsor, who can refuse | `report` (flag), `sponsor_decide` | `a_flagged_event_waits_for_the_sponsor_who_can_refuse` |
| Tickets cancel for a refund before the cutoff and change hands until the start; the new holder checks in and gets the deposit | `cancel`, `nft_transfer` guard | `tickets_cancel_before_the_cutoff_and_change_hands_until_the_start` |
| Someone else can pay the deposit; the ticket and the refund are the guest's | `DepositMsg::Rsvp { for_account }` | `a_friend_pays_the_deposit_and_the_ticket_and_refund_are_the_guests` |
| A cancelled event refunds every deposit and pledge | `cancel_event` | `cancelling_the_event_refunds_every_deposit_and_pledge` |
| A bounty program pays approved events and keeps the unused budget | `create_program`, `program_approve`, `release_sponsors` | `a_bounty_program_pays_approved_events_and_keeps_the_rest_of_its_budget` |
| Guests seen at other hosts' events are "proven": they can RSVP free and count for proven-only pledges | `rsvp_waived`, `check_in` (`hosts_seen`) | `proven_guests_rsvp_free_and_count_for_proven_only_pledges` |
| Only the host sets an event's details, and pays for their storage | `create_event_with_details`, `set_details` | `the_host_sets_event_details_and_pays_only_for_their_storage` |
| The receipt lists every ticket with the reason it counted or didn't | `web/app/e/[id]/receipt/page.tsx` | Read from the contract's `get_tickets` and `report`; see `/e/4/receipt` |

## Repository

```
contracts/showup    The NEAR contract (near-sdk 5.29, near-contract-standards)
contracts/mock-ft   A 6-decimal token for the sandbox tests
web                 Next.js app (NEAR Connect for wallets)
video               The demo video and its Remotion source
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
