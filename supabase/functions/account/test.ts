// Offline test for the "account" function: stubs Deno.serve and fetch, then drives the handler.
// Run: deno test --allow-env supabase/functions/account/test.ts   (needs nodeModulesDir "auto" or deno install)
import { deepStrictEqual as assertEquals } from "node:assert";

const SUPA = "https://proj.supabase.co", STORE = "test-store.myshopify.com", UID = "11111111-1111-1111-1111-111111111111";
Deno.env.set("SUPABASE_URL", SUPA); Deno.env.set("SUPABASE_ANON_KEY", "anon"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
Deno.env.set("SHOPIFY_STORE", STORE); Deno.env.set("SHOPIFY_CLIENT_ID", "cid"); Deno.env.set("SHOPIFY_CLIENT_SECRET", "secret");

const calls: string[] = [];
let tokenRequests = 0, removed: string[] = [], deletedUser = "";
const user = { id: UID, email: "pilgrim@example.com", email_confirmed_at: "2026-10-01T00:00:00Z", aud: "authenticated" };
const reply = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init), u = new URL(req.url), body = req.method === "GET" ? "" : await req.text();
  calls.push(req.method + " " + u.host + u.pathname);
  if (u.pathname === "/auth/v1/user")
    return req.headers.get("authorization") === "Bearer good" ? reply(user) : reply({ msg: "bad jwt" }, 401);
  if (u.host === STORE && u.pathname === "/admin/oauth/access_token") {
    tokenRequests++; assertEquals(new URLSearchParams(body).get("grant_type"), "client_credentials");
    return reply({ access_token: "shp_tok", expires_in: 86399 });
  }
  if (u.host === STORE && u.pathname === "/admin/api/2026-10/graphql.json") {
    assertEquals(req.headers.get("x-shopify-access-token"), "shp_tok");
    assertEquals(JSON.parse(body).variables.q, 'email:"pilgrim@example.com"');
    return reply({ data: { orders: { nodes: [
      { name: "#1001", processedAt: "2026-10-10T15:00:00Z", cancelledAt: null, test: false, displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED",
        statusPageUrl: "https://shop/1001", totalPriceSet: { shopMoney: { amount: "21.99", currencyCode: "USD" } },
        lineItems: { nodes: [{ title: "Pilgrim's Map poster", quantity: 1, variantTitle: "24×36", image: { url: "https://cdn/x.jpg" } }] } },
      { name: "#1000", processedAt: "2026-09-01T15:00:00Z", cancelledAt: null, test: true, displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED",
        statusPageUrl: "https://shop/1000", totalPriceSet: { shopMoney: { amount: "1.00", currencyCode: "USD" } }, lineItems: { nodes: [] } },
    ] } } });
  }
  if (u.pathname === "/rest/v1/photos") return reply([{ storage_path: `${UID}/b1/p1.jpg`, thumb_path: `${UID}/b1/p1.t.jpg` }]);
  if (u.pathname === `/storage/v1/object/list/member-photos`) {
    const prefix = JSON.parse(body).prefix;
    return reply(prefix === UID ? [{ name: "b1", id: null }] : [{ name: "p1.jpg", id: "x" }, { name: "orphan.jpg", id: "y" }]);
  }
  if (u.pathname === "/storage/v1/object/member-photos" && req.method === "DELETE") { removed = JSON.parse(body).prefixes; return reply([]); }
  if (u.pathname.startsWith("/auth/v1/admin/users/") && req.method === "DELETE") { deletedUser = u.pathname.split("/").pop()!; return reply({}); }
  return reply({ error: "unexpected " + req.method + " " + u.pathname }, 500);
};

// deno-lint-ignore no-explicit-any
let handler: any;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: unknown) => { handler = h; return {}; };
await import("./index.ts");

const post = (body: unknown, auth = "good", origin = "https://americanbasilicas.org") =>
  handler(new Request("https://fn/account", { method: "POST", headers: { authorization: "Bearer " + auth, origin, "content-type": "application/json" }, body: JSON.stringify(body) }));

Deno.test("preflight allows the site", async () => {
  const r = await handler(new Request("https://fn/account", { method: "OPTIONS", headers: { origin: "https://americanbasilicas.org" } }));
  assertEquals(r.headers.get("access-control-allow-origin"), "https://americanbasilicas.org");
});
Deno.test("other origins are not echoed", async () => {
  const r = await post({ action: "orders" }, "good", "https://evil.example");
  assertEquals(r.headers.get("access-control-allow-origin"), "https://americanbasilicas.org");
});
Deno.test("rejects a bad session", async () => {
  const r = await post({ action: "orders" }, "bad");
  assertEquals(r.status, 401);
});
Deno.test("orders: matched by email, test orders hidden, token cached", async () => {
  const a = await (await post({ action: "orders" })).json();
  const b = await (await post({ action: "orders" })).json();
  assertEquals(a.orders.length, 1);
  assertEquals(a.orders[0], { name: "#1001", date: "2026-10-10T15:00:00Z", status: "Shipped", statusUrl: "https://shop/1001",
    total: { amount: "21.99", currencyCode: "USD" }, items: [{ title: "Pilgrim's Map poster", quantity: 1, variant: "24×36", image: "https://cdn/x.jpg" }] });
  assertEquals(b.orders.length, 1);
  assertEquals(tokenRequests, 1);
});
Deno.test("delete: removes rows' files and orphans, then the user", async () => {
  const r = await (await post({ action: "delete" })).json();
  assertEquals(r.deleted, true);
  assertEquals(new Set(removed), new Set([`${UID}/b1/p1.jpg`, `${UID}/b1/p1.t.jpg`, `${UID}/b1/orphan.jpg`]));
  assertEquals(deletedUser, UID);
});
Deno.test("unknown action", async () => {
  assertEquals((await post({ action: "x" })).status, 400);
});
