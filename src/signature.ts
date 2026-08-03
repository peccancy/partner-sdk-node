import { createHmac, timingSafeEqual } from "crypto"

/**
 * sign computes the lowercase hex HMAC-SHA256 of `payload` keyed by `secret`.
 * This is the exact scheme the Peccancy platform validates against.
 */
export function sign(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload, "utf8").digest("hex")
}

/** Constant-time comparison of two hex signature strings. */
export function safeEqualHex(a: string, b: string): boolean {
    const ba = Buffer.from(a, "utf8")
    const bb = Buffer.from(b, "utf8")
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
}

/** Current unix time in seconds. */
export function nowSec(): number {
    return Math.floor(Date.now() / 1000)
}
