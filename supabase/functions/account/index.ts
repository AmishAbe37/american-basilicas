// Supabase Edge Function "account" — server-side jobs for a signed-in member.
//
//   POST { action: "orders" }  -> the member's Shopify orders, matched by their verified email
//   POST { action: "delete" }  -> deletes the member's photos, files, visits, profile and login
//
// Deploy:  supabase functions deploy account
// Secrets (supabase secrets set NAME=value):
//   SHOPIFY_STORE            americanbasilicas.myshopify.com
//   SHOPIFY_CLIENT_ID        } from the Dev Dashboard app installed on the store (scopes: read_orders,
//   SHOPIFY_CLIENT_SECRET    }   plus read_all_orders to show orders older than 60 days)
//   ALLOWED_ORIGINS          optional, comma-separated; default https://americanbasilicas.org
//   SHOPIFY_API_VERSION      optional; default 2026-10
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const ORIGINS = env("ALLOWED_ORIGINS", "https://americanbasilicas.org,https://www.americanbasilicas.org")
  .split(",").map((s) => s.trim()).filter(Boolean);
const BUCKET = "member-photos";

function cors(req: Request) {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });

// ---------- Shopify ----------
let token: { value: string; until: number } | null = null;
async function shopifyToken(): Promise<string> {
  if (env("SHOPIFY_ADMIN_TOKEN")) return env("SHOPIFY_ADMIN_TOKEN");          // older admin-created app, if you have one
  if (token && Date.now() < token.until) return token.value;
  const r = await fetch(`https://${env("SHOPIFY_STORE")}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env("SHOPIFY_CLIENT_ID"),
      client_secret: env("SHOPIFY_CLIENT_SECRET"),
    }),
  });
  if (!r.ok) throw new Error(`Shopify token request failed (${r.status})`);
  const j = await r.json();
  token = { value: j.access_token, until: Date.now() + (Number(j.expires_in || 86399) - 300) * 1000 };
  return token.value;
}

const ORDERS = `query MemberOrders($q: String!) {
  orders(first: 50, query: $q, sortKey: PROCESSED_AT, reverse: true) {
    nodes {
      name processedAt cancelledAt test
      displayFinancialStatus displayFulfillmentStatus statusPageUrl
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 20) { nodes { title quantity variantTitle image { url(transform: { maxWidth: 120 }) } } }
    }
  }
}`;

const SHIP: Record<string, string> = {
  FULFILLED: "Shipped", UNFULFILLED: "Being made", PARTIALLY_FULFILLED: "Partly shipped", IN_PROGRESS: "Being made",
  ON_HOLD: "On hold", SCHEDULED: "Scheduled", PENDING_FULFILLMENT: "Being made", RESTOCKED: "Returned",
  PARTIALLY_RETURNED: "Partly returned", RETURNED: "Returned",
};

async function orders(email: string) {
  const q = `email:"${email.replace(/["\\]/g, "")}"`;
  const r = await fetch(`https://${env("SHOPIFY_STORE")}/admin/api/${env("SHOPIFY_API_VERSION", "2026-10")}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await shopifyToken() },
    body: JSON.stringify({ query: ORDERS, variables: { q } }),
  });
  if (!r.ok) throw new Error(`Shopify request failed (${r.status})`);
  const j = await r.json();
  if (j.errors?.length) throw new Error(j.errors[0].message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (j.data.orders.nodes as any[]).filter((o) => !o.test).map((o) => ({
    name: o.name,
    date: o.processedAt,
    status: o.cancelledAt ? "Cancelled"
      : o.displayFinancialStatus === "REFUNDED" ? "Refunded"
      : SHIP[o.displayFulfillmentStatus] ?? String(o.displayFulfillmentStatus || "").toLowerCase().replace(/_/g, " "),
    statusUrl: o.statusPageUrl,
    total: o.totalPriceSet?.shopMoney ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: o.lineItems.nodes.map((li: any) => ({
      title: li.title, quantity: li.quantity,
      variant: li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : "",
      image: li.image?.url ?? "",
    })),
  }));
}

// ---------- account deletion ----------
async function deleteAccount(uid: string) {
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const paths = new Set<string>();
  const { data: rows } = await admin.from("photos").select("storage_path,thumb_path").eq("user_id", uid);
  (rows ?? []).forEach((r) => { paths.add(r.storage_path); paths.add(r.thumb_path); });
  // also sweep the member's folder for any files without a database row (e.g. an interrupted upload)
  const { data: dirs } = await admin.storage.from(BUCKET).list(uid, { limit: 1000 });
  for (const d of dirs ?? []) {
    const { data: files } = await admin.storage.from(BUCKET).list(`${uid}/${d.name}`, { limit: 1000 });
    (files ?? []).forEach((f) => paths.add(`${uid}/${d.name}/${f.name}`));
  }
  const all = [...paths];
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await admin.storage.from(BUCKET).remove(all.slice(i, i + 500));
    if (error) throw error;
  }
  const { error } = await admin.auth.admin.deleteUser(uid);   // cascades to profile, visits and photo rows
  if (error) throw error;
  return { deleted: true, files: all.length };
}

// ---------- entry point ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await sb.auth.getUser(jwt);
  if (error || !user) return json(req, { error: "Please sign in again." }, 401);

  let action = "";
  try { action = (await req.json()).action; } catch { /* empty body */ }

  try {
    if (action === "orders") {
      if (!user.email || !user.email_confirmed_at) return json(req, { orders: [], note: "Email not verified" });
      if (!env("SHOPIFY_STORE")) return json(req, { error: "Order history isn't set up yet." }, 503);
      return json(req, { email: user.email, orders: await orders(user.email) });
    }
    if (action === "delete") return json(req, await deleteAccount(user.id));
    return json(req, { error: "Unknown action" }, 400);
  } catch (e) {
    console.error(action, e);
    return json(req, { error: action === "orders" ? "Couldn't reach the shop right now." : "Something went wrong. Please try again." }, 502);
  }
});
