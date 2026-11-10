# ShowUp: specification

**Verified attendance, so event money follows real people.**

Guests commit with a small deposit and get it back at the door. Hosts get honest RSVPs and are paid by sponsors for every attendee proven to be in the room. Sponsors and ecosystems fund events per real attendee, from any chain, and get numbers they can check.

Working name. Second entry for NEAR HACKATHON 2026 (Q-015: independent of Aftercall; each README names the other). Build window 11–14 Nov 2026; repo public and submitted by **14 Nov, 23:59 UTC**.

Origin: Illia Polosukhin's 3 Oct 2026 list asked for event registration with escrowed funds, host check-in and the attendees splitting the rest, "now across any chain and any asset" (the Kickback model). ShowUp keeps that and adds what Kickback never had: a reason for hosts and sponsors to want honest numbers, and a way to check them.

## 1. Problem

Three people pay for an event's empty seats, and none of them can trust the numbers.

- **Hosts** plan food, merch and venue around RSVPs, and a large share of people who sign up never come.
- **Sponsors and ecosystems** pay hosts flat fees up front and get a headcount they can't verify. Afterwards the argument is public and unresolvable: "where did the money go?", "how many really came?"
- **Guests** who do show up get an event sized for people who didn't.

Kickback-style deposits fix only the first: they reward guests for showing up, but sponsors still pay for claimed numbers, and hosts still gain from inflated RSVPs.

## 2. Product

### Guests
- **Commit with a small deposit,** paid from any chain and token; get it back at the door.
- **Earn from no-shows:** unclaimed deposits are split among the people who came (or go to the host, by the event's rule).
- **Build an attendance record** that travels: verified check-ins across every ShowUp event. It waives deposits at events that allow it and unlocks host perks.
- **Sign in with email or any NEAR wallet;** never pay gas.

### Hosts
- **Honest RSVPs:** committed guests, a live count, a waitlist-free capacity cap.
- **Run the door from a phone:** a rotating check-in code on screen, a live count, crowd headcount at set times.
- **Get paid by sponsors automatically** for every verified attendee: no invoices, no chasing, no arguing about numbers.
- **A public attendance report** to win the next sponsor.

### Sponsors and ecosystems
- **Sponsor an event per attendee:** "$2 per verified attendee, up to 100", funded from any chain through NEAR Intents and held by the contract. Pay only for real attendance; the rest comes back automatically.
- **Run a standing meetup bounty:** "$3 per verified attendee at any NEAR meetup, up to 50 per event, 20 events a month." Hosts anywhere attach their events; the program owner approves each with one click; payouts run themselves. Community spending becomes pay-for-results and checkable.
- **Get the evidence:** a verified report per event, and the X handles of attendees who opted in to share them.

## 3. Proof of presence

The aim is not to catch every fake but to make fakes cost more than they earn. Four layers:

| Layer | How it works | What it stops |
| --- | --- | --- |
| **1. Two-sided check-in at the venue** | The door screen shows a QR code that changes every 20 seconds, signed by the event's door key. The guest scans it with their own phone and sends `check_in` from their own account; the contract verifies the door signature and that the code's time window matches the block time | A host checking in ghosts from home; a guest checking in without being at the door |
| **2. Private headcount** | The door app takes crowd photos at set times. Each goes to a vision model inside NEAR AI Cloud's TEEs (`Qwen/Qwen3-VL-30B-A3B-Instruct`, see risk 1), encrypted end to end to the attested model. Only a count comes back, signed by the TEE. Photos are never stored or seen by anyone | Inflation: if check-ins exceed the photo count by more than the event's tolerance, sponsor payouts are flagged |
| **3. Proven attendees** | A sponsor can choose to pay only for proven attendees: guests with a verified check-in at an event run by a different host. New accounts still attend; they just don't earn the host sponsor money yet | Armies of fresh accounts: they have no history anywhere else |
| **4. Held payouts** | Sponsor money is released 48 hours after the event. A flagged event's payout waits for the sponsor: approve or refund within 7 days, after which it is paid to the host | Paying out before the evidence is in |

What remains is a host who pays real people to come and stand in the room. At that point the sponsor is paying for real people in the room.

No face matching or biometric identity: photos are used for a headcount only, inside the TEE, and discarded.

## 4. Money

All amounts in USDC on NEAR (Circle USDC); anything else is swapped on the way in through NEAR Intents.

| Pot | Funded by | Released |
| --- | --- | --- |
| Guest deposit | Guest, at RSVP | To the guest at check-in or on cancel; otherwise into the no-show pot at settlement |
| No-show pot | Unclaimed deposits | At settlement: split equally among checked-in guests, or to the host (event rule). With no attendees, to the host |
| Sponsor pledge | Sponsor, up front: `rate × cap` | 48 h after the event: `rate × min(counted attendees, cap)` to the host, the rest back to the sponsor. Flagged: held for the sponsor's decision (layer 4) |
| Bounty program | Ecosystem, up front: a budget | Per approved event, the same as a pledge, from the program's budget |

`counted attendees` = verified check-ins, or proven attendees only if the sponsor chose that.

The contract has no withdraw method. Money leaves only through the rules above.

## 5. Flows

1. **Create.** Host signs in, creates an event: title, times, venue, capacity, deposit, cancel cutoff, no-show rule, headcount tolerance (default: flag if check-ins exceed the highest photo count by 20% plus 5), optional deposit waiver for guests with N past check-ins, card style. Adds a door key (a function-call key that can only call door methods). Optionally attaches the event to a bounty program.
2. **Sponsor.** A sponsor opens the event page, chooses rate, cap and counting rule, pays from any chain. The pledge appears on the event page.
3. **Bounty program.** An ecosystem creates a program (rate, per-event cap, budget, monthly event limit, tag such as `near`) and funds it. It approves or declines events that ask to join.
4. **RSVP.** A guest signs in (email via Privy, or a NEAR wallet), pays the deposit from any chain or token (live Intents quote), and receives a ticket NFT and a share card. Guests who meet the waiver RSVP free.
5. **Cancel or transfer.** Cancel before the cutoff for a refund; transfer the ticket until the event starts, deposit included.
6. **Door.** The door screen shows the rotating code and the live count. Guests scan and check in from their own phones; the deposit comes back at once and an "I was there" card appears. Door staff can scan a guest's ticket for someone without a phone; that check-in counts toward deposits but not toward sponsor payouts.
7. **Headcount.** At times the host sets (for example 30 and 60 minutes in), the door app takes a crowd photo and records the TEE-signed count.
8. **Settle.** After the event ends plus 1 hour, anyone calls `settle`: deposits and the no-show pot are paid out. Sponsor and bounty payouts follow 48 hours later, unless flagged.
9. **Report.** A public page shows the event's numbers and evidence (section 8).

## 6. Ticket NFT and attendance record

- Each RSVP mints a NEP-171 ticket that holds the deposit; whoever holds it owns the outcome.
- Transferable until the event starts; at check-in it is stamped `attended` and becomes non-transferable.
- `attended_count(account)` and `hosts_attended(account)` (distinct hosts) form the attendance record that drives waivers and proven-attendee status.
- A guest who RSVPs free under a waiver and doesn't come loses one from their count.

## 7. Share cards (built in, after xCardGen)

ShowUp makes each guest a card to post on X, the way Victor's xCardGen does for organizers. xCardGen started in Dec 2025, before the hackathon, so its code counts as baseline (FAQ Q-001). ShowUp's card maker is written new for this repo, follows xCardGen's card design, and the README credits xCardGen.

- A Next.js image route renders the event's cover, title, date and venue with the guest's name and photo (1200×675). The host picks a style and accent color.
- "I'm attending" at RSVP, "I was there" at check-in, "Sponsored by …" on the event page's X preview.
- Each guest's card links to the event with their referral code. A referral bonus (weight `1 + 0.5` per referred friend who checks in, capped at 3) applies to the no-show split.

## 8. Attendance report

`/e/[id]/report`, public, no sign-in:

- committed RSVPs, check-ins (two-sided and door-scanned), proven attendees, no-shows, no-show rate;
- arrivals over time; headcounts with their times and a "re-check" button that verifies each TEE signature in the browser;
- sponsors and bounty programs, what each pledged and paid, flags and decisions;
- every deposit, refund and payout linked to its transaction, and the contract address, so anyone can recount;
- opted-in attendee handles, visible to sponsors only.

## 9. Contract

near-sdk-rs, one contract for all events and programs.

| Method | Caller | Does |
| --- | --- | --- |
| `create_event(params)` | Host | Stores the event and rules |
| `add_door_key(event_id, public_key)` | Host | Adds a function-call key for `door_*` methods and registers it as the event's code signer |
| `ft_on_transfer(sender, amount, msg)` | USDC | Routes by `msg`: RSVP (mints ticket), sponsor pledge, or program funding |
| `rsvp_waived(event_id, referrer)` | Guest | Free RSVP if the guest meets the event's waiver |
| `cancel(token_id)` | Ticket holder | Before the cutoff: burn and refund |
| `nft_transfer(...)` | Ticket holder | Until the event starts; refused after check-in |
| `check_in(token_id, window, door_sig)` | Guest | Verifies the door key's ed25519 signature over `(event_id, window)` and that `window` matches block time; stamps attended; refunds the deposit |
| `door_check_in(token_id)` | Door key | Fallback scan; counts for deposits, not sponsor payouts |
| `door_record_headcount(event_id, count, at, evidence_hash)` | Door key | Stores a headcount and the hash of its TEE-signed evidence |
| `settle(event_id)` | Anyone | Deposits and no-show pot, after end + 1 h |
| `release_sponsors(event_id)` | Anyone | Pledge and bounty payouts after 48 h, unless flagged |
| `sponsor_decide(event_id, approve)` | Sponsor | Resolves a flagged payout |
| `create_program(params)`, `program_approve(program_id, event_id)` | Ecosystem | Bounty programs |
| `cancel_event(event_id)` | Host | Refunds every deposit and pledge |
| Views | Anyone | Events, tickets, pledges, programs, headcounts, `attended_count`, `hosts_attended`, `report(event_id)` |

Safety rules: no withdraw method; one settlement per event; failed transfers recorded and retryable; only the configured USDC accepted; door keys can't touch money methods.

Tests: near-workspaces sandbox tests for every method and rule, including expired or forged door codes, check-in from the wrong account, headcount flags at the tolerance edge, proven-only counting, pledge caps, program budgets running out, settle twice, and a failed payout retried.

## 10. Headcount service

- The door app posts a photo to a small serverless function that forwards it to NEAR AI Cloud, encrypted end to end to the attested model (E2EE v2), so the function can't see the photo either.
- The function checks the TEE's attestation first and the response signature after, and returns the count with the signed evidence.
- The evidence (attestation summary, request and response hashes, signature) is stored off chain with its hash on chain; `/report` re-checks it in the browser.
- Prompt: count visible people, return strict JSON `{count, confidence}`; nothing else about the image.

## 11. Web app

Next.js; NEAR Connect with the Privy plugin (email sign-in creates a NEAR account); a NEP-366 relayer pays gas for guest calls to the ShowUp contract only.

| Page | For |
| --- | --- |
| `/` | What ShowUp is; upcoming events; live bounty programs |
| `/new` | Host: create an event |
| `/e/[id]` | Event, RSVP from any chain, sponsor button, ticket QR and card after RSVP |
| `/e/[id]/door` | Door screen: rotating code, live count, headcount capture |
| `/e/[id]/report` | The attendance report |
| `/sponsor/[id]` | Sponsor: pledge, decide flags, see opted-in attendees |
| `/programs/new`, `/programs/[id]` | Ecosystem: create and run a bounty program |
| `/me` | Guest: tickets, attendance record, waivers |

## 12. NEAR pieces

| Piece | Used for |
| --- | --- |
| near-sdk-rs contract | Deposits, tickets, pledges, programs, settlement, attendance record |
| NEAR AI Cloud (TEE, E2EE v2) | Private headcount from crowd photos, with attestation and signed results |
| NEAR Intents 1Click | Deposits, pledges and program funding from any chain and token |
| NEP-141 (Circle USDC) | All money in and out |
| NEP-171 | Tickets |
| NEP-366 meta transactions | Gas-free guest calls |
| Function-call keys + `ed25519_verify` | Door keys and the rotating, signed check-in code |
| NEAR Connect + Privy | Email sign-in that creates a NEAR account |

## 13. Networks

- **Testnet:** the whole flow, sandbox tests in CI, dry Intents quotes.
- **Mainnet, tiny amounts:** NEAR Intents has no testnet (FAQ Q-007) and the rules allow mainnet where an integration is mainnet-only (Q-010): deposits of 0.50–1 USDC, a small sponsor pledge. **Victor deploys the mainnet contract and funds the relayer** (HACKATHON.md: never deploy to mainnet or spend tokens on the team's behalf). Contract storage is about 3–4 NEAR.

## 14. Tracks

- **`realworld`** (primary): event money for real hosts and sponsors.
- **`social`**: community funding with rules; bounty programs; reputation from showing up.
- **`privacy`**: headcount from photos inside TEEs; nothing stored or seen.
- **`nfts`**: tickets that hold money and become credentials.

## 15. Proof for judges

- **A real event before submission:** at least 5 guests on different accounts, including one paying from another chain on mainnet; two-sided check-ins; one no-show; a headcount; a sponsor pledge paid out per verified attendee with the rest refunded; the report with every transaction linked.
- **A flagged case in the sandbox tests and the video:** check-ins far above the headcount, payout held, sponsor decides.
- README for a machine reader as well as a human: "do X, see Y", sandbox tests in CI, one-command verify. Video of the real run, posted on X with @NEARProtocol and #NEARHackathon.

## 16. Out of scope

Paid tickets, fiat, a native mobile app, multi-day events, arbitration beyond the sponsor's decision, face matching.

## 17. Plan

| Day | Ship |
| --- | --- |
| 11 Nov | Spikes: Intents delivery into the contract; Privy sign-in; Qwen3-VL headcount in a TEE with attestation. Contract with deposits, tickets, two-sided check-in, settlement; sandbox tests; testnet deploy |
| 12 Nov | Pledges, programs, flags, release; web: create, event page, RSVP, door screen, relayer |
| 13 Nov | Headcount service; report; sponsor and program pages; cards; mainnet any-chain payment; the live event |
| 14 Nov | README, video, X post, Aftercall README names ShowUp (Q-015), submit |

If time runs short, cut in this order: referral bonus, deposit waiver, bounty programs (keep per-event pledges), opted-in handles. Never cut: deposits, two-sided check-in, headcount, per-event pledge, report.

## 18. Open questions and risks

1. **Headcount model:** `Qwen/Qwen3-VL-30B-A3B-Instruct` is listed by NEAR AI Cloud's models endpoint (checked 10 Nov), but its TEE attestation, image input and counting accuracy are unverified. The 11 Nov spike decides; if it fails, headcount drops to a stretch goal and layers 1, 3 and 4 remain.
2. **Intents delivery:** can a 1Click swap deliver USDC straight into the contract with a routing message, or does it land in the payer's account first, needing one more signed step? The spike decides; the fallback is the two-step path.
3. **Victor's steps:** a Privy app and its app ID; a NEAR AI key and the OK to spend credit on headcount runs; the mainnet deploy; NEAR for the relayer and storage.
4. **The live run:** who are the 5+ guests, ideally a real small meetup, with one holding USDC on Base or Solana, and who plays the sponsor?
5. **Defaults:** no-show pot to attendees or host; headcount tolerance; what a flagged payout does if the sponsor never decides (this spec: paid to the host after 7 days).
6. **Name:** ShowUp is a working name.
