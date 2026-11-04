// Offline test for "bmc-webhook": stubs Deno.serve and fetch, then drives the handler.
// Run: deno test --allow-env supabase/functions/bmc-webhook/test.ts
import { deepStrictEqual as eq, ok } from "node:assert";

Deno.env.set("SUPABASE_URL", "https://proj.supabase.co"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("BMC_WEBHOOK_SECRET", "whsec_test");

// deno-lint-ignore no-explicit-any
let recorded: any[] = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init), u = new URL(req.url);
  if (u.pathname === "/rest/v1/rpc/record_membership") { recorded.push(JSON.parse(await req.text())); return new Response(null, { status: 204 }); }
  return new Response("{}", { status: 500 });
};
// deno-lint-ignore no-explicit-any
let handler: any;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: unknown) => { handler = h; return {}; };
const mod = await import("./index.ts");

async function sign(body: string, secret = "whsec_test") {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// deno-lint-ignore no-explicit-any
async function send(evt: any, sig?: string) {
  const body = JSON.stringify(evt);
  return handler(new Request("https://fn/bmc-webhook", { method: "POST", body, headers: { "x-signature-sha256": sig ?? await sign(body) } }));
}
const started = (over = {}) => ({ event_id: 1, type: "membership.started", live_mode: true, created: 1793270000, attempt: 1,
  data: { supporter_email: "Carla@Example.com", membership_level_name: "Pilgrim Member", status: "active", duration_type: "month",
          current_period_start: 1793270000, current_period_end: 1795862000, canceled: false, ...over } });

Deno.test("rejects unsigned and wrongly signed requests", async () => {
  recorded = [];
  eq((await send(started(), "")).status, 401);
  eq((await send(started(), await sign("{}", "other"))).status, 401);
  eq(recorded.length, 0);
});
Deno.test("records a new membership through period end + 3 days, email lower-cased", async () => {
  recorded = [];
  const r = await send(started());
  eq(r.status, 200);
  eq(recorded.length, 1);
  eq(recorded[0].member_email, "carla@example.com");
  eq(recorded[0].event, "membership.started");
  eq(recorded[0].level_name, "Pilgrim Member");
  eq(recorded[0].period_end, new Date((1795862000 + 3 * 86400) * 1000).toISOString());
});
Deno.test("accepts the older X-Bmc-Signature header too", async () => {
  recorded = [];
  const body = JSON.stringify(started());
  const r = await handler(new Request("https://fn/bmc-webhook", { method: "POST", body, headers: { "X-Bmc-Signature": await sign(body) } }));
  eq(r.status, 200); eq(recorded.length, 1);
});
Deno.test("cancellation is recorded (the database keeps what was paid)", async () => {
  recorded = [];
  await send({ ...started({ canceled: true, cancel_at_period_end: true }), type: "membership.cancelled" });
  eq(recorded[0].event, "membership.cancelled");
});
Deno.test("ignores test events unless allowed, and non-membership events", async () => {
  recorded = [];
  eq((await (await send({ ...started(), live_mode: false })).json()).ignored, "test event");
  eq((await (await send({ ...started(), type: "donation.created" })).json()).ignored, "donation.created");
  eq(recorded.length, 0);
});
Deno.test("only listed levels count when BMC_GALLERY_LEVELS is set", async () => {
  recorded = [];
  Deno.env.set("BMC_GALLERY_LEVELS", "Gallery, Patron");
  eq((await (await send(started())).json()).ignored, "level without gallery");
  await send(started({ membership_level_name: "patron" }));
  eq(recorded.length, 1);
  Deno.env.delete("BMC_GALLERY_LEVELS");
});
Deno.test("date formats", () => {
  eq(mod.toDate(1795862000)!.toISOString(), "2026-11-28T10:33:20.000Z");
  eq(mod.toDate("1795862000000")!.toISOString(), "2026-11-28T10:33:20.000Z");
  eq(mod.toDate("2026-11-28 09:53:20")!.toISOString(), "2026-11-28T09:53:20.000Z");
  ok(mod.paidThrough({ duration_type: "year" }, new Date("2026-10-29T00:00:00Z"))!.toISOString().startsWith("2027-11-01"));
  eq(mod.paidThrough({}), null);
});
