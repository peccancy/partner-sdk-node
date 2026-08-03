/**
 * Connect-your-game example: the full dispute lifecycle for one match.
 *
 * Run:  PECCANCY_PARTNER_ID=... PECCANCY_PARTNER_SECRET=... npx ts-node examples/connect-your-game.ts
 */
import { PartnerClient, PartnerApiError } from "../src"

async function main() {
    const client = new PartnerClient({
        baseUrl: process.env.PECCANCY_BASE_URL ?? "https://disputes.online",
        partnerId: required("PECCANCY_PARTNER_ID"),
        secret: required("PECCANCY_PARTNER_SECRET"),
    })

    // 1) A new match starts in your game -> open a dispute.
    const dispute = await client.createDispute({
        description: "Who wins the Alias round?",
        variants: [{ description: "Red Team" }, { description: "Blue Team" }],
        stopDate: new Date(Date.now() + 2 * 60_000), // betting closes in 2 min
        finishDate: new Date(Date.now() + 20 * 60_000),
        minBet: 1,
    })
    console.log("created dispute:", dispute.id)

    // 2) The round actually begins -> close betting and mark in-progress.
    await client.stopBets(dispute.id)
    await client.startGame(dispute.id)
    console.log("betting closed, game in progress")

    // 3) The round ends in your game -> declare the winner by its name.
    await client.setWinner(dispute.id, "Red Team")
    console.log("winner set: Red Team")

    // 4) Payouts + result webhooks are handled by the platform. If you set a callback_url,
    //    you'll receive a signed callback (see examples/webhook-receiver.ts).
}

function required(name: string): string {
    const v = process.env[name]
    if (!v) throw new Error(`missing env ${name}`)
    return v
}

main().catch((e) => {
    if (e instanceof PartnerApiError) console.error("API error", e.status, e.body)
    else console.error(e)
    process.exit(1)
})
