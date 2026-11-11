//! Sandbox tests: ShowUp and a USDC-like token on a local NEAR node.
//! Run from contracts/: cargo test -p showup --test sandbox -- --test-threads=1

use ed25519_dalek::{Signer, SigningKey};
use near_workspaces::network::Sandbox;
use near_workspaces::types::{Gas, NearToken, SecretKey};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const USDC: u128 = 1_000_000;
const MIN: u64 = 60_000;

struct Env {
    worker: Worker<Sandbox>,
    showup: Contract,
    usdc: Contract,
    host: Account,
    sponsor: Account,
    guests: Vec<Account>,
    door_signer: SigningKey,
    door_account: Account,
}

async fn now_ms(worker: &Worker<Sandbox>) -> anyhow::Result<u64> {
    Ok(worker.view_block().await?.timestamp() / 1_000_000)
}

/// Moves the sandbox clock past `target_ms`.
async fn advance_to(worker: &Worker<Sandbox>, target_ms: u64) -> anyhow::Result<()> {
    loop {
        let now = now_ms(worker).await?;
        if now >= target_ms {
            return Ok(());
        }
        let blocks = ((target_ms - now) / 1000).max(1) + 5;
        worker.fast_forward(blocks).await?;
    }
}

async fn setup() -> anyhow::Result<Env> {
    let worker = near_workspaces::sandbox().await?;
    let showup_wasm = near_workspaces::compile_project("./").await?;
    let ft_wasm = near_workspaces::compile_project("../mock-ft").await?;
    let root = worker.root_account()?;

    async fn make(root: &Account, name: &str) -> anyhow::Result<Account> {
        Ok(root.create_subaccount(name).initial_balance(NearToken::from_near(10)).transact().await?.into_result()?)
    }
    let host = make(&root, "host").await?;
    let sponsor = make(&root, "sponsor").await?;
    let mut guests = vec![];
    for name in ["alice", "bob", "carol", "dave"] {
        guests.push(make(&root, name).await?);
    }

    let usdc = worker.dev_deploy(&ft_wasm).await?;
    usdc.call("new")
        .args_json(json!({ "owner_id": sponsor.id(), "total_supply": (1_000_000 * USDC).to_string() }))
        .transact().await?.into_result()?;

    let showup = worker.dev_deploy(&showup_wasm).await?;
    // Minutes instead of days, so the sandbox clock doesn't need to run for 48 hours.
    showup.call("new").args_json(json!({ "usdc": usdc.id(), "delays": { "settle_ms": 2 * MIN, "release_ms": 5 * MIN, "decide_ms": 5 * MIN } })).transact().await?.into_result()?;

    // Everyone who sends or receives USDC registers on the token; the sponsor hands guests 10 USDC.
    let mut ids = vec![showup.id().clone(), host.id().clone()];
    ids.extend(guests.iter().map(|g| g.id().clone()));
    for id in &ids {
        sponsor.call(usdc.id(), "storage_deposit")
            .args_json(json!({ "account_id": id }))
            .deposit(NearToken::from_millinear(125))
            .transact().await?.into_result()?;
    }
    for g in &guests {
        sponsor.call(usdc.id(), "ft_transfer")
            .args_json(json!({ "receiver_id": g.id(), "amount": (10 * USDC).to_string() }))
            .deposit(NearToken::from_yoctonear(1))
            .transact().await?.into_result()?;
    }

    let door_signer = SigningKey::from_bytes(&[7u8; 32]);
    let mut full = door_signer.to_bytes().to_vec();
    full.extend_from_slice(door_signer.verifying_key().as_bytes());
    let door_secret: SecretKey = format!("ed25519:{}", bs58::encode(full).into_string()).parse()?;
    let door_account = Account::from_secret_key(showup.id().clone(), door_secret, &worker);

    Ok(Env { worker, showup, usdc, host, sponsor, guests, door_signer, door_account })
}

fn door_public_key(e: &Env) -> String {
    format!("ed25519:{}", bs58::encode(e.door_signer.verifying_key().as_bytes()).into_string())
}

/// Creates an event starting 10 minutes from now (check-in opens an hour before) and lasting 10 minutes.
async fn create_event(e: &Env, rule: &str, require_headcount: bool) -> anyhow::Result<(u64, u64)> {
    let now = now_ms(&e.worker).await?;
    let ends = now + 20 * MIN;
    let id: u64 = e.host.call(e.showup.id(), "create_event")
        .args_json(json!({ "params": {
            "title": "Builders Night", "venue": "Yaba",
            "starts_at_ms": now + 10 * MIN, "ends_at_ms": ends,
            "capacity": 50, "deposit": USDC.to_string(),
            "cancel_cutoff_ms": now + 5 * MIN, "no_show_rule": rule,
            "waive_after": 1, "flag_pct": 20, "flag_abs": 0, "require_headcount": require_headcount
        }}))
        .transact().await?.json()?;
    e.host.call(e.showup.id(), "add_door_key")
        .args_json(json!({ "event_id": id, "public_key": door_public_key(e) }))
        .transact().await?.into_result()?;
    Ok((id, ends))
}

async fn rsvp(e: &Env, guest: &Account, event_id: u64, referrer: Option<&str>) -> anyhow::Result<String> {
    guest.call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": e.showup.id(), "amount": USDC.to_string(),
            "msg": json!({ "Rsvp": { "event_id": event_id, "referrer": referrer, "for_account": null } }).to_string() }))
        .deposit(NearToken::from_yoctonear(1)).max_gas()
        .transact().await?.into_result()?;
    let token: Option<String> = e.showup.view("ticket_for")
        .args_json(json!({ "event_id": event_id, "account_id": guest.id() })).await?.json()?;
    Ok(token.expect("ticket minted"))
}

async fn door_code(e: &Env, event_id: u64) -> anyhow::Result<(u64, String)> {
    let window = now_ms(&e.worker).await? / 20_000;
    let sig = e.door_signer.sign(format!("showup:door:{event_id}:{window}").as_bytes());
    let b64 = near_sdk_base64(&sig.to_bytes());
    Ok((window, b64))
}

fn near_sdk_base64(bytes: &[u8]) -> String {
    // Standard base64 without a dependency.
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (b[0] as u32) << 16 | (b[1] as u32) << 8 | b[2] as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

async fn check_in(e: &Env, guest: &Account, event_id: u64, token: &str) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let (window, sig) = door_code(e, event_id).await?;
    Ok(guest.call(e.showup.id(), "check_in")
        .args_json(json!({ "token_id": token, "window": window, "door_sig": sig }))
        .max_gas().transact().await?)
}

async fn balance(e: &Env, who: &Account) -> anyhow::Result<u128> {
    let b: String = e.usdc.view("ft_balance_of").args_json(json!({ "account_id": who.id() })).await?.json()?;
    Ok(b.parse()?)
}

async fn report(e: &Env, event_id: u64) -> anyhow::Result<Value> {
    Ok(e.showup.view("report").args_json(json!({ "event_id": event_id })).await?.json()?)
}

async fn headcount(e: &Env, event_id: u64, count: u32) -> anyhow::Result<()> {
    e.door_account.call(e.showup.id(), "door_record_headcount")
        .args_json(json!({ "event_id": event_id, "count": count, "evidence_hash": "ab".repeat(32) }))
        .gas(Gas::from_tgas(50))
        .transact().await?.into_result()?;
    Ok(())
}

#[tokio::test]
async fn deposits_come_back_at_the_door_and_no_shows_are_split_by_referral_weight() -> anyhow::Result<()> {
    let e = setup().await?;
    let (event_id, ends) = create_event(&e, "SplitAmongAttendees", false).await?;
    let [alice, bob, carol, _] = [&e.guests[0], &e.guests[1], &e.guests[2], &e.guests[3]];
    let a = rsvp(&e, alice, event_id, None).await?;
    let b = rsvp(&e, bob, event_id, None).await?;
    let c = rsvp(&e, carol, event_id, Some(&a)).await?;
    assert_eq!(balance(&e, alice).await?, 9 * USDC);

    check_in(&e, alice, event_id, &a).await?.into_result()?;
    check_in(&e, carol, event_id, &c).await?.into_result()?;
    assert_eq!(balance(&e, alice).await?, 10 * USDC, "alice's deposit came back at the door");
    let _ = b;

    advance_to(&e.worker, ends + 2 * MIN + 1000).await?;
    e.host.call(e.showup.id(), "settle").args_json(json!({ "event_id": event_id })).max_gas().transact().await?.into_result()?;
    let r = report(&e, event_id).await?;
    assert_eq!(r["checked_in"], 2);
    assert_eq!(r["no_shows"], 1);
    assert_eq!(r["no_show_pot"], USDC.to_string());

    // Alice brought Carol, so her weight is 3 to Carol's 2: 0.6 and 0.4 USDC.
    e.host.call(e.showup.id(), "withdraw_for")
        .args_json(json!({ "accounts": [alice.id(), carol.id(), e.host.id()] }))
        .max_gas().transact().await?.into_result()?;
    assert_eq!(balance(&e, alice).await?, 10 * USDC + 600_000);
    assert_eq!(balance(&e, carol).await?, 10 * USDC + 400_000);
    assert_eq!(balance(&e, bob).await?, 9 * USDC, "bob didn't come");
    Ok(())
}

#[tokio::test]
async fn a_check_in_needs_a_fresh_door_signature_from_the_ticket_holder() -> anyhow::Result<()> {
    let e = setup().await?;
    let (event_id, _) = create_event(&e, "SplitAmongAttendees", false).await?;
    let alice = &e.guests[0];
    let bob = &e.guests[1];
    let a = rsvp(&e, alice, event_id, None).await?;

    // Bob can't check in Alice's ticket.
    assert!(check_in(&e, bob, event_id, &a).await?.is_failure());

    // A forged signature fails.
    let window = now_ms(&e.worker).await? / 20_000;
    let forged = SigningKey::from_bytes(&[9u8; 32]).sign(format!("showup:door:{event_id}:{window}").as_bytes());
    let res = alice.call(e.showup.id(), "check_in")
        .args_json(json!({ "token_id": a, "window": window, "door_sig": near_sdk_base64(&forged.to_bytes()) }))
        .max_gas().transact().await?;
    assert!(res.is_failure());

    // A code more than 2 minutes old fails.
    let old = window - 20;
    let sig = e.door_signer.sign(format!("showup:door:{event_id}:{old}").as_bytes());
    let res = alice.call(e.showup.id(), "check_in")
        .args_json(json!({ "token_id": a, "window": old, "door_sig": near_sdk_base64(&sig.to_bytes()) }))
        .max_gas().transact().await?;
    assert!(res.is_failure());

    // The real, current code works, once.
    check_in(&e, alice, event_id, &a).await?.into_result()?;
    assert!(check_in(&e, alice, event_id, &a).await?.is_failure());
    Ok(())
}

#[tokio::test]
async fn a_sponsor_pays_the_host_per_verified_guest_and_gets_the_rest_back() -> anyhow::Result<()> {
    let e = setup().await?;
    let (event_id, ends) = create_event(&e, "ToHost", true).await?;
    e.sponsor.call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": e.showup.id(), "amount": (200 * USDC).to_string(),
            "msg": json!({ "Pledge": { "event_id": event_id, "rate": (2 * USDC).to_string(), "cap": 100, "proven_only": false } }).to_string() }))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?.into_result()?;
    let sponsor_before = balance(&e, &e.sponsor).await?;

    let alice = &e.guests[0];
    let bob = &e.guests[1];
    let carol = &e.guests[2];
    let a = rsvp(&e, alice, event_id, None).await?;
    let b = rsvp(&e, bob, event_id, None).await?;
    let c = rsvp(&e, carol, event_id, None).await?;
    advance_to(&e.worker, now_ms(&e.worker).await? + 11 * MIN).await?;
    check_in(&e, alice, event_id, &a).await?.into_result()?;
    check_in(&e, bob, event_id, &b).await?.into_result()?;
    // Carol had no phone: the door scanned her. Her deposit comes back, but she isn't verified.
    e.door_account.call(e.showup.id(), "door_check_in").args_json(json!({ "token_id": c })).gas(Gas::from_tgas(50)).transact().await?.into_result()?;
    headcount(&e, event_id, 3).await?;

    let r = report(&e, event_id).await?;
    assert_eq!(r["verified"], 2);
    assert_eq!(r["checked_in"], 3);
    assert_eq!(r["flagged"], false);

    // Too early: the release delay hasn't passed.
    assert!(e.host.call(e.showup.id(), "release_sponsors").args_json(json!({ "event_id": event_id })).max_gas().transact().await?.is_failure());
    advance_to(&e.worker, ends + 5 * MIN + 1000).await?;
    e.host.call(e.showup.id(), "release_sponsors").args_json(json!({ "event_id": event_id })).max_gas().transact().await?.into_result()?;
    let host_owed: String = e.showup.view("owed").args_json(json!({ "account_id": e.host.id() })).await?.json()?;
    assert_eq!(host_owed, (4 * USDC).to_string(), "2 USDC × 2 verified guests");
    e.sponsor.call(e.showup.id(), "withdraw").max_gas().transact().await?.into_result()?;
    assert_eq!(balance(&e, &e.sponsor).await?, sponsor_before + 196 * USDC);
    Ok(())
}

#[tokio::test]
async fn a_flagged_event_waits_for_the_sponsor_who_can_refuse() -> anyhow::Result<()> {
    let e = setup().await?;
    let (event_id, ends) = create_event(&e, "ToHost", true).await?;
    e.sponsor.call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": e.showup.id(), "amount": (20 * USDC).to_string(),
            "msg": json!({ "Pledge": { "event_id": event_id, "rate": (2 * USDC).to_string(), "cap": 10, "proven_only": false } }).to_string() }))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?.into_result()?;
    let sponsor_before = balance(&e, &e.sponsor).await?;
    let mut tokens = vec![];
    for g in &e.guests[0..3] {
        tokens.push(rsvp(&e, g, event_id, None).await?);
    }
    advance_to(&e.worker, now_ms(&e.worker).await? + 11 * MIN).await?;
    for (g, t) in e.guests[0..3].iter().zip(&tokens) {
        check_in(&e, g, event_id, t).await?.into_result()?;
    }
    // Three verified check-ins, but the crowd photo counted one person.
    headcount(&e, event_id, 1).await?;
    assert_eq!(report(&e, event_id).await?["flagged"], true);

    advance_to(&e.worker, ends + 5 * MIN + 1000).await?;
    e.host.call(e.showup.id(), "release_sponsors").args_json(json!({ "event_id": event_id })).max_gas().transact().await?.into_result()?;
    let event: Value = e.showup.view("get_event").args_json(json!({ "event_id": event_id })).await?.json()?;
    assert_eq!(event["pledges"][0]["done"], false, "held for the sponsor");

    e.sponsor.call(e.showup.id(), "sponsor_decide")
        .args_json(json!({ "event_id": event_id, "pledge_index": 0, "approve": false }))
        .max_gas().transact().await?.into_result()?;
    e.sponsor.call(e.showup.id(), "withdraw").max_gas().transact().await?.into_result()?;
    assert_eq!(balance(&e, &e.sponsor).await?, sponsor_before + 20 * USDC, "refused: all back to the sponsor");
    let host_owed: String = e.showup.view("owed").args_json(json!({ "account_id": e.host.id() })).await?.json()?;
    assert_eq!(host_owed, "0");
    Ok(())
}

#[tokio::test]
async fn tickets_cancel_before_the_cutoff_and_change_hands_until_the_start() -> anyhow::Result<()> {
    let e = setup().await?;
    let (event_id, _) = create_event(&e, "SplitAmongAttendees", false).await?;
    let alice = &e.guests[0];
    let bob = &e.guests[1];
    let dave = &e.guests[3];
    let a = rsvp(&e, alice, event_id, None).await?;
    let b = rsvp(&e, bob, event_id, None).await?;

    alice.call(e.showup.id(), "cancel").args_json(json!({ "token_id": a })).max_gas().transact().await?.into_result()?;
    assert_eq!(balance(&e, alice).await?, 10 * USDC);

    // Bob can't come and passes his ticket to Dave, deposit and all.
    bob.call(e.showup.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": dave.id(), "token_id": b }))
        .deposit(NearToken::from_yoctonear(1)).transact().await?.into_result()?;
    advance_to(&e.worker, now_ms(&e.worker).await? + 11 * MIN).await?;
    check_in(&e, dave, event_id, &b).await?.into_result()?;
    assert_eq!(balance(&e, dave).await?, 11 * USDC, "Dave gets Bob's deposit back at the door");

    // After the start, and after check-in, it can't move.
    assert!(dave.call(e.showup.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": bob.id(), "token_id": b }))
        .deposit(NearToken::from_yoctonear(1)).transact().await?.is_failure());
    Ok(())
}

#[tokio::test]
async fn cancelling_the_event_refunds_every_deposit_and_pledge() -> anyhow::Result<()> {
    let e = setup().await?;
    let (event_id, _) = create_event(&e, "SplitAmongAttendees", false).await?;
    e.sponsor.call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": e.showup.id(), "amount": (10 * USDC).to_string(),
            "msg": json!({ "Pledge": { "event_id": event_id, "rate": USDC.to_string(), "cap": 10, "proven_only": false } }).to_string() }))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?.into_result()?;
    let alice = &e.guests[0];
    rsvp(&e, alice, event_id, None).await?;
    // Only the host can cancel.
    assert!(alice.call(e.showup.id(), "cancel_event").args_json(json!({ "event_id": event_id })).transact().await?.is_failure());
    e.host.call(e.showup.id(), "cancel_event").args_json(json!({ "event_id": event_id })).max_gas().transact().await?.into_result()?;
    e.host.call(e.showup.id(), "withdraw_for")
        .args_json(json!({ "accounts": [alice.id(), e.sponsor.id()] })).max_gas().transact().await?.into_result()?;
    assert_eq!(balance(&e, alice).await?, 10 * USDC);
    let owed: String = e.showup.view("owed").args_json(json!({ "account_id": e.sponsor.id() })).await?.json()?;
    assert_eq!(owed, "0");
    Ok(())
}

#[tokio::test]
async fn a_bounty_program_pays_approved_events_and_keeps_the_rest_of_its_budget() -> anyhow::Result<()> {
    let e = setup().await?;
    let (event_id, ends) = create_event(&e, "ToHost", false).await?;
    let program_id: u64 = e.sponsor.call(e.showup.id(), "create_program")
        .args_json(json!({ "title": "Meetups Everywhere", "tag": "near", "rate": (3 * USDC).to_string(), "per_event_cap": 50 }))
        .transact().await?.json()?;
    e.sponsor.call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": e.showup.id(), "amount": (300 * USDC).to_string(),
            "msg": json!({ "FundProgram": { "program_id": program_id } }).to_string() }))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?.into_result()?;
    e.host.call(e.showup.id(), "apply_program").args_json(json!({ "event_id": event_id, "program_id": program_id })).transact().await?.into_result()?;
    // Only the program owner approves.
    assert!(e.host.call(e.showup.id(), "program_approve").args_json(json!({ "program_id": program_id, "event_id": event_id })).transact().await?.is_failure());
    e.sponsor.call(e.showup.id(), "program_approve").args_json(json!({ "program_id": program_id, "event_id": event_id })).transact().await?.into_result()?;
    let p: Value = e.showup.view("get_program").args_json(json!({ "program_id": program_id })).await?.json()?;
    assert_eq!(p["available"], (150 * USDC).to_string(), "3 USDC × 50 set aside");

    let alice = &e.guests[0];
    let a = rsvp(&e, alice, event_id, None).await?;
    advance_to(&e.worker, now_ms(&e.worker).await? + 11 * MIN).await?;
    check_in(&e, alice, event_id, &a).await?.into_result()?;
    advance_to(&e.worker, ends + 5 * MIN + 1000).await?;
    e.host.call(e.showup.id(), "release_sponsors").args_json(json!({ "event_id": event_id })).max_gas().transact().await?.into_result()?;
    let p: Value = e.showup.view("get_program").args_json(json!({ "program_id": program_id })).await?.json()?;
    assert_eq!(p["available"], (297 * USDC).to_string(), "147 back to the budget");
    assert_eq!(p["paid_out"], (3 * USDC).to_string());
    let host_owed: String = e.showup.view("owed").args_json(json!({ "account_id": e.host.id() })).await?.json()?;
    assert_eq!(host_owed, (3 * USDC).to_string());
    Ok(())
}

#[tokio::test]
async fn proven_guests_rsvp_free_and_count_for_proven_only_pledges() -> anyhow::Result<()> {
    let e = setup().await?;
    let alice = &e.guests[0];
    // Alice attends an event run by the host first.
    let (first, _) = create_event(&e, "ToHost", false).await?;
    let a1 = rsvp(&e, alice, first, None).await?;
    advance_to(&e.worker, now_ms(&e.worker).await? + 11 * MIN).await?;
    check_in(&e, alice, first, &a1).await?.into_result()?;
    assert_eq!(e.showup.view("attended_count").args_json(json!({ "account_id": alice.id() })).await?.json::<u32>()?, 1);

    // A different host's event waives the deposit after 1 check-in; Alice is proven there.
    let other = &e.guests[3];
    let now = now_ms(&e.worker).await?;
    let second: u64 = other.call(e.showup.id(), "create_event")
        .args_json(json!({ "params": {
            "title": "Founders breakfast", "venue": "Accra",
            "starts_at_ms": now + 10 * MIN, "ends_at_ms": now + 20 * MIN,
            "capacity": 10, "deposit": USDC.to_string(), "cancel_cutoff_ms": now + 5 * MIN,
            "no_show_rule": "ToHost", "waive_after": 1, "flag_pct": 20, "flag_abs": 0, "require_headcount": false
        }}))
        .transact().await?.json()?;
    other.call(e.showup.id(), "add_door_key")
        .args_json(json!({ "event_id": second, "public_key": door_public_key(&e) }))
        .transact().await?.into_result()?;
    let before = balance(&e, alice).await?;
    let t: String = alice.call(e.showup.id(), "rsvp_waived").args_json(json!({ "event_id": second, "referrer": null })).max_gas().transact().await?.json()?;
    assert_eq!(balance(&e, alice).await?, before, "no deposit taken");
    // Bob, with no record, can't RSVP free.
    assert!(e.guests[1].call(e.showup.id(), "rsvp_waived").args_json(json!({ "event_id": second, "referrer": null })).max_gas().transact().await?.is_failure());

    advance_to(&e.worker, now_ms(&e.worker).await? + 11 * MIN).await?;
    check_in(&e, alice, second, &t).await?.into_result()?;
    let r = report(&e, second).await?;
    assert_eq!(r["proven"], 1);
    Ok(())
}

#[tokio::test]
async fn the_host_sets_event_details_and_pays_only_for_their_storage() -> anyhow::Result<()> {
    let e = setup().await?;
    let (id, _) = create_event(&e, "SplitAmongAttendees", false).await?;
    let none: Option<Value> = e.showup.view("get_details").args_json(json!({ "event_id": id })).await?.json()?;
    assert!(none.is_none(), "an event starts without details");

    let details = json!({ "details": {
        "host_name": "Lagos Builders", "description": "Demos, then food.",
        "cover_url": "https://example.com/cover.jpg",
        "agenda": [{ "at": "18:00", "what": "Doors" }, { "at": "18:30", "what": "Demos" }]
    }, "event_id": id });

    // Without NEAR for the storage, the details are refused.
    let unpaid = e.host.call(e.showup.id(), "set_details").args_json(&details).transact().await?;
    assert!(unpaid.is_failure(), "storage must be paid for");

    // Only the host may set them.
    let stranger = e.guests[0].call(e.showup.id(), "set_details")
        .args_json(&details).deposit(NearToken::from_millinear(50)).transact().await?;
    assert!(stranger.is_failure(), "only the host edits details");

    let before = e.host.view_account().await?.balance;
    e.host.call(e.showup.id(), "set_details")
        .args_json(&details).deposit(NearToken::from_millinear(500)).transact().await?.into_result()?;
    let spent = before.as_yoctonear() - e.host.view_account().await?.balance.as_yoctonear();
    assert!(spent < NearToken::from_millinear(20).as_yoctonear(), "the unused deposit comes back, spent {spent}");

    let got: Value = e.showup.view("get_details").args_json(json!({ "event_id": id })).await?.json()?;
    assert_eq!(got["host_name"], "Lagos Builders");
    assert_eq!(got["agenda"][1]["what"], "Demos");

    // A cover must be an https link.
    let bad = e.host.call(e.showup.id(), "set_details")
        .args_json(json!({ "event_id": id, "details": { "host_name": "x", "description": "", "cover_url": "javascript:alert(1)", "agenda": [] } }))
        .deposit(NearToken::from_millinear(50)).transact().await?;
    assert!(bad.is_failure(), "non-https covers are refused");

    // Create and describe in one call.
    let now = now_ms(&e.worker).await?;
    let id2: u64 = e.host.call(e.showup.id(), "create_event_with_details")
        .args_json(json!({ "params": {
            "title": "Rust night", "venue": "Yaba", "starts_at_ms": now + 10 * MIN, "ends_at_ms": now + 20 * MIN,
            "capacity": 20, "deposit": USDC.to_string(), "cancel_cutoff_ms": now + 5 * MIN,
            "no_show_rule": "ToHost", "waive_after": null, "flag_pct": 20, "flag_abs": 0, "require_headcount": false
        }, "details": { "host_name": "Rustaceans", "description": "Bring a laptop.", "cover_url": null, "agenda": [] } }))
        .deposit(NearToken::from_millinear(50)).transact().await?.json()?;
    let got2: Value = e.showup.view("get_details").args_json(json!({ "event_id": id2 })).await?.json()?;
    assert_eq!(got2["description"], "Bring a laptop.");
    let last_program: u64 = e.showup.view("last_program_id").await?.json()?;
    assert_eq!(last_program, 0);
    Ok(())
}

#[tokio::test]
async fn a_friend_pays_the_deposit_and_the_ticket_and_refund_are_the_guests() -> anyhow::Result<()> {
    let e = setup().await?;
    let (event_id, _) = create_event(&e, "SplitAmongAttendees", false).await?;
    let alice = &e.guests[0];
    let (bob, carol) = (&e.guests[1], &e.guests[2]);

    // Alice pays for Bob and for Carol: two tickets, neither of them hers.
    for friend in [bob, carol] {
        alice.call(e.usdc.id(), "ft_transfer_call")
            .args_json(json!({ "receiver_id": e.showup.id(), "amount": USDC.to_string(),
                "msg": json!({ "Rsvp": { "event_id": event_id, "referrer": null, "for_account": friend.id() } }).to_string() }))
            .deposit(NearToken::from_yoctonear(1)).max_gas()
            .transact().await?.into_result()?;
    }
    assert_eq!(balance(&e, alice).await?, 8 * USDC);
    let bobs: Option<String> = e.showup.view("ticket_for").args_json(json!({ "event_id": event_id, "account_id": bob.id() })).await?.json()?;
    let alices: Option<String> = e.showup.view("ticket_for").args_json(json!({ "event_id": event_id, "account_id": alice.id() })).await?.json()?;
    let bobs = bobs.expect("Bob holds a ticket");
    assert!(alices.is_none(), "paying for friends doesn't give Alice a ticket");

    // A second gift to Bob is refused; Alice can't check in Bob's ticket; Bob can, and the deposit is his.
    let again = alice.call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": e.showup.id(), "amount": USDC.to_string(),
            "msg": json!({ "Rsvp": { "event_id": event_id, "referrer": null, "for_account": bob.id() } }).to_string() }))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?;
    assert!(again.into_result().is_ok(), "ft_transfer_call itself succeeds");
    assert_eq!(balance(&e, alice).await?, 8 * USDC, "the refused RSVP's USDC comes back to Alice");

    advance_to(&e.worker, now_ms(&e.worker).await? + 11 * MIN).await?;
    assert!(check_in(&e, alice, event_id, &bobs).await?.is_failure());
    check_in(&e, bob, event_id, &bobs).await?.into_result()?;
    assert_eq!(balance(&e, bob).await?, 11 * USDC, "Bob gets the deposit Alice paid");
    assert_eq!(balance(&e, alice).await?, 8 * USDC);
    Ok(())
}
