import { sign, safeEqualHex, nowSec } from "./signature"
import {
    PartnerClientOptions,
    CreateDisputeInput,
    Dispute,
    UserIdentifier,
    InitPaymentResult,
    InvoiceResult,
    Callback,
} from "./types"

/** Error thrown when the API responds with a non-2xx status. */
export class PartnerApiError extends Error {
    readonly status: number
    readonly body: string

    constructor(message: string, status: number, body: string) {
        super(message)
        this.name = "PartnerApiError"
        this.status = status
        this.body = body
    }
}

function toISO(d: Date | string): string {
    return typeof d === "string" ? d : d.toISOString()
}

function money(n: number): string {
    return n.toFixed(2)
}

/**
 * PartnerClient is the entry point of the SDK. Construct it once with your credentials and
 * reuse it. Every call is authenticated for you via HMAC-SHA256 + a fresh timestamp.
 *
 * ```ts
 * const client = new PartnerClient({ baseUrl: "https://disputes.online", partnerId, secret })
 * const dispute = await client.createDispute({ ... })
 * ```
 */
export class PartnerClient {
    private readonly baseUrl: string
    private readonly partnerId: string
    private readonly secret: string
    private readonly timeoutMs: number
    private readonly fetchImpl: typeof fetch

    constructor(opts: PartnerClientOptions) {
        if (!opts.baseUrl) throw new Error("baseUrl is required")
        if (!opts.partnerId) throw new Error("partnerId is required")
        if (!opts.secret) throw new Error("secret is required")
        this.baseUrl = opts.baseUrl.replace(/\/+$/, "")
        this.partnerId = opts.partnerId
        this.secret = opts.secret
        this.timeoutMs = opts.timeoutMs ?? 15000
        const f = opts.fetch ?? globalThis.fetch
        if (!f) throw new Error("global fetch is unavailable; use Node 18+ or pass opts.fetch")
        this.fetchImpl = f
    }

    // ---- Disputes ----

    /** Create a dispute (question + 2–100 outcomes). Returns the created dispute. */
    async createDispute(input: CreateDisputeInput): Promise<Dispute> {
        const ts = nowSec()
        const payload = `${this.partnerId}:${input.description}:${ts}`
        const body = {
            description: input.description,
            variants: input.variants,
            finish_date: toISO(input.finishDate),
            stop_date: toISO(input.stopDate),
            min_bet: input.minBet,
            max_bet: input.maxBet,
            lang: input.lang,
            is_closed: input.isClosed,
        }
        const data = await this.headerSigned("POST", "/api/v1/partner/disputes", payload, ts, body)
        return this.mapDispute(data.data)
    }

    /** Close betting on a dispute (no more bets accepted). */
    async stopBets(disputeId: string): Promise<void> {
        const ts = nowSec()
        const payload = `${this.partnerId}:${disputeId}:${ts}`
        await this.headerSigned("PUT", `/api/v1/partner/disputes/${disputeId}/stopbet`, payload, ts)
    }

    /** Mark a dispute as in-progress (the game/event has started). */
    async startGame(disputeId: string): Promise<void> {
        const ts = nowSec()
        const payload = `${this.partnerId}:${disputeId}:${ts}`
        await this.headerSigned("PUT", `/api/v1/partner/disputes/${disputeId}/startgame`, payload, ts)
    }

    /** Declare the winning outcome by its variant description (team name). */
    async setWinner(disputeId: string, winnerTeamName: string): Promise<void> {
        const ts = nowSec()
        const payload = `${this.partnerId}:${disputeId}:${winnerTeamName}:${ts}`
        await this.headerSigned("POST", `/api/v1/partner/disputes/${disputeId}/winner`, payload, ts, {
            winner_team_name: winnerTeamName,
        })
    }

    // ---- Payments ----

    /** Charge a known user (by email/phone/id). Returns the created transaction. */
    async initPayment(amount: number, user: UserIdentifier, description: string): Promise<InitPaymentResult> {
        const ts = nowSec()
        const payload = `${this.partnerId}:${money(amount)}:${user.value}:${ts}`
        const data = await this.bodySigned("/partner/api/v1/init", {
            id: this.partnerId,
            amount,
            user_identifier: { type: user.type, value: user.value },
            description,
            signature: sign(payload, this.secret),
            timestamp: ts,
        })
        return {
            transactionId: data.transaction_id,
            status: data.status,
            amount: data.amount,
        }
    }

    /** Create a hosted payment link (invoice) not tied to a specific user. */
    async createInvoice(amount: number, description: string): Promise<InvoiceResult> {
        const ts = nowSec()
        const payload = `${this.partnerId}:${money(amount)}:${description}:${ts}`
        const data = await this.bodySigned("/partner/api/v1/invoice", {
            amount,
            description,
            signature: sign(payload, this.secret),
            timestamp: ts,
        })
        return {
            invoiceId: data.invoice_id,
            invoiceUrl: data.invoice_url,
            status: data.status,
            amount: data.amount,
        }
    }

    // ---- Webhooks ----

    /**
     * Verify a callback the platform POSTed to your callback_url. Returns true if the
     * signature is valid and the timestamp is fresh (default ±120s). Always verify before
     * acting on a callback.
     */
    static verifyCallback(cb: Callback, secret: string, maxSkewSec = 120): boolean {
        if (!cb || typeof cb.signature !== "string") return false
        const payload = `${cb.transaction_id}:${cb.status}:${money(cb.amount)}:${cb.timestamp}`
        if (!safeEqualHex(sign(payload, secret), cb.signature)) return false
        const age = Math.abs(nowSec() - cb.timestamp)
        return age <= maxSkewSec
    }

    // ---- internals ----

    private async headerSigned(
        method: string,
        path: string,
        payload: string,
        ts: number,
        body?: unknown,
    ): Promise<any> {
        return this.request(method, path, {
            "X-Partner-ID": this.partnerId,
            "X-Partner-Timestamp": String(ts),
            "X-Partner-Signature": sign(payload, this.secret),
        }, body)
    }

    private async bodySigned(path: string, body: unknown): Promise<any> {
        return this.request("POST", path, { "X-Partner-ID": this.partnerId }, body)
    }

    private async request(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<any> {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.timeoutMs)
        try {
            const res = await this.fetchImpl(this.baseUrl + path, {
                method,
                headers: { "Content-Type": "application/json", ...headers },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal,
            })
            const text = await res.text()
            if (!res.ok) {
                throw new PartnerApiError(`Peccancy API ${method} ${path} -> ${res.status}`, res.status, text)
            }
            return text ? JSON.parse(text) : {}
        } finally {
            clearTimeout(timer)
        }
    }

    private mapDispute(d: any): Dispute {
        return {
            id: d.id,
            description: d.description,
            variants: (d.variants ?? []).map((v: any) => ({
                id: v.id,
                description: v.description,
                countOfBets: v.count_of_bets ?? 0,
                amount: v.amount ?? 0,
            })),
            teamId: d.team_id,
            status: d.status,
            totalAmount: d.total_amount ?? 0,
            finishDate: d.finish_date,
            stopDate: d.stop_date,
            createdAt: d.created_at,
        }
    }
}
