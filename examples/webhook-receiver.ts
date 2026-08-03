/**
 * Webhook receiver example: verify signed callbacks from the platform.
 *
 * Point your partner's callback_url at http(s)://your-host/peccancy/callback
 *
 * Run:  PECCANCY_PARTNER_SECRET=... npx ts-node examples/webhook-receiver.ts
 * (requires `npm i express` in your project)
 */
import http from "http"
import { PartnerClient } from "../src"

const secret = process.env.PECCANCY_PARTNER_SECRET
if (!secret) throw new Error("missing env PECCANCY_PARTNER_SECRET")

// Minimal zero-dependency HTTP handler (in real apps use Express/Fastify).
const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/peccancy/callback") {
        res.writeHead(404).end()
        return
    }
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
        let body: any
        try {
            body = JSON.parse(raw)
        } catch {
            res.writeHead(400).end("bad json")
            return
        }

        if (!PartnerClient.verifyCallback(body, secret)) {
            res.writeHead(401).end("bad signature")
            return
        }

        // ✅ Verified & fresh — safe to act on.
        console.log("callback:", body.transaction_id, body.status, body.amount)
        // ... credit the user / mark the order paid ...

        res.writeHead(200).end("ok")
    })
})

server.listen(3000, () => console.log("listening on :3000/peccancy/callback"))
