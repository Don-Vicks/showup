/**
 * The testnet run of 10–11 Nov 2026 (event 4 on showup-app.testnet), step by step. Each hash is a real
 * transaction; the /proof page reads the event's current state from the contract next to them.
 */
export const PROOF_EVENT_ID = 4;

export interface ProofStep {
  title: string;
  body: string;
  txs: { label: string; hash: string; failed?: boolean }[];
}

export const PROOF_STEPS: ProofStep[] = [
  {
    title: "A host creates the event",
    body: "demo-host sets a 1 USDC deposit, 10 places, and the rule that no-show deposits are split among the guests who come.",
    txs: [{ label: "create_event", hash: "J82bNQpVygVwBqfdUkvUVPQk5wHDbMF1T7DkuHpordyP" }],
  },
  {
    title: "A sponsor pledges per guest",
    body: "sponsor puts 4 USDC in the contract: 1 USDC for each guest who checks in with their own phone, up to 4. It stays in the contract, not with the host.",
    txs: [{ label: "pledge 4 USDC", hash: "B4tbi15WQ1V9KinYDjJNzKKf4cR86frzB2WG65HMB7u7" }],
  },
  {
    title: "Four guests commit 1 USDC each",
    body: "Each RSVP mints a ticket NFT and holds the deposit. guest3 came through guest1's share link, so guest1 gets credit for bringing a friend.",
    txs: [
      { label: "guest1", hash: "3oksdm6UCD1rKgsJWAb1ZeSUR2pqWELiWG5KZBJASSaG" },
      { label: "guest2", hash: "ENM1gDRSZ5ASDGW77Vas3T1tfAPBq5ympd94sSDrxiFp" },
      { label: "guest3 (via guest1)", hash: "6JUcMExw1TjApwk2uVPy3mzME8V5pR7pwVfV9NWgoiwU" },
      { label: "guest4", hash: "3AHN7EKY5A1Frw7ygYL36eppH5dbq7iKxuPcZGetaesK" },
    ],
  },
  {
    title: "The host opens the door screen",
    body: "The door screen makes a key, and the host registers it on the contract. From then on the screen signs a fresh QR code every 20 seconds.",
    txs: [{ label: "add_door_key", hash: "EUhcvBic3o14YcsiHz4y1UYVpCpeciScc36UjX7j5KYV" }],
  },
  {
    title: "Guests check in, and get their deposit back",
    body: "guest1 and guest3 scan the door code and sign from their own accounts: that's a verified check-in, and 1 USDC goes straight back. guest2 has no phone, so the host checks them in at the desk: deposit back, but it doesn't count for the sponsor. guest4 never comes.",
    txs: [
      { label: "guest1 scans", hash: "DhiTbhkw9aeSU1SjGhzX9EaStHMUJgYmv3QrZ2pQwXAS" },
      { label: "guest3 scans", hash: "3L7RTzcQtxL6ThhxSk8ZT5bRVVW6jACVLPEVbXJSX2Sc" },
      { label: "guest2 at the desk", hash: "GkqNen7uEHYn1NiGguKAnoph7CD7pRUQXT3RtjX1rYQt" },
    ],
  },
  {
    title: "Cheating is refused",
    body: "guest1 tries to check in guest3's ticket from their own account. The contract refuses: \"Check in from the account that holds the ticket\". A door code alone isn't enough, and neither is a ticket alone.",
    txs: [{ label: "refused check_in", hash: "5FXLqaPnG1jZneGQwSvRYQGa3YRSQ173vESPqFvyjzyX", failed: true }],
  },
  {
    title: "The no-show's deposit is split",
    body: "An hour after the end, anyone can settle. guest4's 1 USDC goes to the guests who came, weighted 2 each plus 1 per friend they brought: guest1 3/7 (0.428571), guest2 and guest3 2/7 each (0.285714). The leftover millionth goes to the host. The payouts are pushed to everyone's wallet.",
    txs: [
      { label: "settle", hash: "6Fdzh11Pp5PeY8Ax7rDQS3vxNQNhL2NTdtiSULeF3nzs" },
      { label: "withdraw_for", hash: "2cphnXKt7bMgDXp3RZKs7VUqqfWJYRprror73oPah6YS" },
    ],
  },
];
