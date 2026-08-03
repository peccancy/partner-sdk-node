# @peccancy/partner-sdk (Node.js / TypeScript)

Official Node.js/TypeScript SDK for the **Peccancy** disputes/betting platform.

Connect your game or app once and let your users bet on outcomes: create disputes, control
their lifecycle, declare winners, take payments, and verify signed result webhooks. Every
request is authenticated for you with HMAC-SHA256 — you never build a signature by hand.

- Zero runtime dependencies (uses built-in `crypto` and global `fetch`, Node 18+)
- Fully typed
- Same surface as our PHP / Python / Go SDKs

## Install

```bash
npm install @peccancy/partner-sdk
```

## Get credentials

1. Register as a partner on the platform and open your partner in the dashboard.
2. Copy your **`partnerId`** (UUID) and **`secret`**.
3. Set a **`callback_url`** on your partner if you want to receive result/payment webhooks.

## Quickstart

```ts
import { PartnerClient } from "@peccancy/partner-sdk"

const client = new PartnerClient({
  baseUrl: "https://disputes.online/partner", // the partner API base
  partnerId: process.env.PECCANCY_PARTNER_ID!,
  secret: process.env.PECCANCY_PARTNER_SECRET!,
})

// Create a dispute when your match starts:
const dispute = await client.createDispute({
  description: "Who wins Round 5?",
  variants: [{ description: "Alice" }, { description: "Bob" }],
  stopDate: new Date(Date.now() + 5 * 60_000),   // betting closes in 5 min
  finishDate: new Date(Date.now() + 30 * 60_000), // event ends in 30 min
})

console.log("dispute id:", dispute.id)
```

## Disputes

```ts
// 1. Create it (betting opens immediately, until stopDate)
const dispute = await client.createDispute({
  description: "Who wins?",
  variants: [{ description: "Team A" }, { description: "Team B" }],
  stopDate: "2026-01-01T12:00:00Z",
  finishDate: "2026-01-01T13:00:00Z",
  minBet: 1,        // optional
  maxBet: 100,      // optional
  lang: "en",       // optional (default "en")
  isClosed: false,  // optional — if true, only you resolve the winner
})

// 2. Close betting (e.g. when the round actually starts)
await client.stopBets(dispute.id)

// 3. Mark the game in-progress (optional)
await client.startGame(dispute.id)

// 4. Declare the winner by the variant's description
await client.setWinner(dispute.id, "Team A")
```

## Payments

```ts
// Charge a known user by email / phone / id:
const tx = await client.initPayment(9.99, { type: "email", value: "user@example.com" }, "Coins pack")
console.log(tx.transactionId, tx.status)

// Or create a hosted payment link (invoice) to send to anyone:
const invoice = await client.createInvoice(19.99, "Tournament entry")
console.log(invoice.invoiceUrl)
```

## Webhooks (results & payments)

The platform POSTs a signed JSON callback to your `callback_url`. **Always verify it**
before acting on it:

```ts
import express from "express"
import { PartnerClient } from "@peccancy/partner-sdk"

const app = express()
app.use(express.json())

app.post("/peccancy/callback", (req, res) => {
  const ok = PartnerClient.verifyCallback(req.body, process.env.PECCANCY_PARTNER_SECRET!)
  if (!ok) return res.status(401).send("bad signature")

  const { transaction_id, status, amount } = req.body
  // ... credit the user / mark the order paid ...
  res.sendStatus(200)
})
```

The callback body is:

```json
{ "transaction_id": "…", "status": "…", "amount": 9.99, "timestamp": 1700000000, "signature": "…" }
```

`verifyCallback` checks the HMAC signature **and** that the timestamp is fresh (±120s).

## Authentication (how it works under the hood)

You never need this — the SDK does it — but for transparency:

- Each request carries `X-Partner-ID`, `X-Partner-Timestamp` (unix seconds) and
  `X-Partner-Signature` headers (payment endpoints put the signature/timestamp in the body).
- The signature is `HMAC-SHA256(payload, secret)` hex-encoded, where `payload` is a
  colon-joined string per endpoint:

  | Operation | Signed payload |
  |-----------|----------------|
  | createDispute | `partnerId:description:timestamp` |
  | stopBets / startGame | `partnerId:disputeId:timestamp` |
  | setWinner | `partnerId:disputeId:winnerTeamName:timestamp` |
  | initPayment | `partnerId:amount(2dp):userValue:timestamp` |
  | createInvoice | `partnerId:amount(2dp):description:timestamp` |
  | callback (inbound) | `transactionId:status:amount(2dp):timestamp` |

- The server rejects requests whose timestamp is more than **120 seconds** off — keep your
  server clock in sync (NTP).

You can access the raw primitives if you need them: `import { sign, safeEqualHex } from "@peccancy/partner-sdk"`.

## Errors

Non-2xx responses throw `PartnerApiError` with `.status` and `.body`:

```ts
import { PartnerApiError } from "@peccancy/partner-sdk"
try {
  await client.setWinner(id, "Nope")
} catch (e) {
  if (e instanceof PartnerApiError) console.error(e.status, e.body)
}
```

## Examples

- [`examples/connect-your-game.ts`](./examples/connect-your-game.ts) — full match lifecycle
- [`examples/webhook-receiver.ts`](./examples/webhook-receiver.ts) — verifying callbacks

## License

MIT
