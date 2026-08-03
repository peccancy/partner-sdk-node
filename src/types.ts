export interface PartnerClientOptions {
    /** Partner API base URL, e.g. "https://disputes.online/partner". No trailing slash needed. */
    baseUrl: string
    /** Your partner UUID. */
    partnerId: string
    /** Your partner secret (base64 string issued by the platform). */
    secret: string
    /** Request timeout in milliseconds (default 15000). */
    timeoutMs?: number
    /** Custom fetch implementation (defaults to global fetch, Node 18+). */
    fetch?: typeof fetch
}

export interface Variant {
    description: string
}

export interface CreateDisputeInput {
    /** The dispute question / title (max 2046 chars). */
    description: string
    /** 2–100 outcome options. */
    variants: Variant[]
    /** When the event ends. Date or ISO-8601 string. */
    finishDate: Date | string
    /** When betting closes (must be before finishDate). Date or ISO-8601 string. */
    stopDate: Date | string
    /** Optional minimum bet. */
    minBet?: number
    /** Optional maximum bet. */
    maxBet?: number
    /** Optional language code (max 7 chars, default "en"). */
    lang?: string
    /** If true, only you (the partner) can resolve the winner. */
    isClosed?: boolean
}

export interface DisputeVariant {
    id: string
    description: string
    countOfBets: number
    amount: number
}

export interface Dispute {
    id: string
    description: string
    variants: DisputeVariant[]
    teamId: string
    status: string
    totalAmount: number
    finishDate: string
    stopDate: string
    createdAt: number
}

export type UserIdentifierType = "email" | "phone" | "id"

export interface UserIdentifier {
    type: UserIdentifierType
    value: string
}

export interface InitPaymentResult {
    transactionId: string
    status: string
    amount: number
}

export interface InvoiceResult {
    invoiceId: string
    invoiceUrl: string
    status: string
    amount: number
}

/**
 * Payload the platform POSTs to your callback_url for transaction/invoice outcomes.
 * The signature is HMAC-SHA256 over `${transaction_id}:${status}:${amount.toFixed(2)}:${timestamp}`.
 */
export interface Callback {
    transaction_id: string
    status: string
    amount: number
    timestamp: number
    signature: string
}
