// Supabase Edge Function "bmc-webhook" — records Buy Me a Coffee memberships so the members' gallery
// stays open for paying supporters after their free three months.
//
// Buy Me a Coffee → Integrations → Webhooks → New webhook: https://<project>.supabase.co/functions/v1/bmc-webhook,
// with the membership events ticked (started, updated, cancelled, paused).
// Deploy with JWT verification OFF (Buy Me a Coffee can't send a Supabase login); every request is
// checked against the webhook's signing secret instead.
//
// Secrets (Edge Functions → Secrets):
//   BMC_WEBHOOK_SECRET   the signing secret shown for the webhook in Buy Me a Coffee
//   BMC_GALLERY_LEVELS   optional: comma-separated membership level names that include the gallery
//                        (leave unset if every level includes it)
//   BMC_ACCEPT_TEST      optional: "true" to let the dashboard's test events through while you set up
//
// Supporters are matched to accounts by email address, so members should use the same email for both.
// Access runs to the end of the period they've paid for plus a few days' grace for renewals; a later
// cancellation never cuts short what was already paid for (see record_membership in schema.sql).

import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const GRACE_DAYS = 3;
const enc = new TextEncoder();

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sameText(a: string, b: string) {                 // constant-time comparison
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Buy Me a Coffee timestamps may arrive as Unix seconds, milliseconds or "YYYY-MM-DD HH:MM:SS" (UTC)
export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return new Date(n > 1e12 ? n : n * 1000);
  }
  const s = String(v).trim().replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z");
  return isNaN(d.getTime()) ? null : d;
}

// deno-lint-ignore no-explicit-any
export function paidThrough(data: any, now = new Date()): Date | null {
  const end = toDate(data.current_period_end);
  if (end) return new Date(end.getTime() + GRACE_DAYS * 86400000);
  const kind = String(data.duration_type || "").toLowerCase();    // no period end given: assume one period from now
  if (!kind) return null;
  const d = new Date(now);
  if (kind.startsWith("year")) d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1);
  return new Date(d.getTime() + GRACE_DAYS * 86400000);
}

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok({ error: "POST only" }, 405);
  const raw = await req.text();
  const secret = env("BMC_WEBHOOK_SECRET");
  const given = (req.headers.get("x-signature-sha256") ?? req.headers.get("x-bmc-signature") ?? "")   // current / older header name
    .trim().toLowerCase().replace(/^sha256=/, "");
  if (!secret || !given || !sameText(given, await hmacHex(secret, raw))) return ok({ error: "bad signature" }, 401);

  // deno-lint-ignore no-explicit-any
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return ok({ error: "bad json" }, 400); }
  const type: string = evt.type ?? req.headers.get("x-bmc-event") ?? "";
  if (!type.startsWith("membership.")) return ok({ ignored: type || "unknown event" });
  if (evt.live_mode === false && env("BMC_ACCEPT_TEST") !== "true") return ok({ ignored: "test event" });

  const data = evt.data ?? evt.response ?? {};
  const email = String(data.supporter_email ?? data.email ?? "").trim().toLowerCase();
  if (!email.includes("@")) return ok({ ignored: "no supporter email" });

  const levels = env("BMC_GALLERY_LEVELS").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const level = data.membership_level_name ?? null;
  if (levels.length && !levels.includes(String(level ?? "").toLowerCase())) return ok({ ignored: "level without gallery" });

  const until = paidThrough(data);
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.rpc("record_membership", {
    member_email: email, event: type, level_name: level, period_end: until ? until.toISOString() : null,
    body: { event_id: evt.event_id, type, created: evt.created, status: data.status ?? null, canceled: data.canceled ?? null,
            cancel_at_period_end: data.cancel_at_period_end ?? null, current_period_end: data.current_period_end ?? null,
            duration_type: data.duration_type ?? null, level },
  });
  if (error) { console.error(error); return ok({ error: "could not record" }, 500); }   // Buy Me a Coffee retries
  return ok({ recorded: email, paid_through: until });
});
