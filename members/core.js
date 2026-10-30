/* American Basilicas — member accounts: shared client.
   Loaded after members/vendor/supabase-*.js and members/config.js. Exposes window.AB.
   Everything here runs in the visitor's browser with the public "anon" key; what each
   member can read or change is enforced by the database rules in supabase/schema.sql. */
(function () {
  "use strict";
  const C = window.AB_CONFIG || {};
  const AB = (window.AB = { enabled: !!(C.supabaseUrl && C.supabaseAnonKey && window.supabase) });
  const BUCKET = "member-photos", FULL_PX = 2000, THUMB_PX = 480;

  // ---------- small helpers (also used by the pages) ----------
  AB.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  AB.fmtDate = (d) => {
    if (!d) return "";
    const t = new Date(String(d).length === 10 ? d + "T12:00:00" : d);
    return t.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  AB.today = () => { const t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };
  AB.miles = (a, b, c, d) => {                       // great-circle distance in miles
    const r = Math.PI / 180, x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.sqrt(x));
  };
  AB.base = (() => { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/members\/core\.js.*$/, "") : "/"; })();
  AB.page = (p) => AB.base + p;

  if (!AB.enabled) { AB.onAuth = () => {}; return; }

  const sb = (AB.sb = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }));

  // ---------- session ----------
  let cache = {};
  AB.user = null; AB.ready = false;
  // each subscriber hears about each signed-in (or signed-out) state exactly once, even if it subscribes
  // while a notification is already on its way
  const subs = [];
  const notify = (s) => {
    const id = AB.user ? AB.user.id : null;
    if (s.heard && s.last === id) return;
    s.heard = true; s.last = id;
    try { s.fn(AB.user); } catch (e) { console.error(e); }
  };
  AB.onAuth = (fn) => { const s = { fn }; subs.push(s); if (AB.ready) notify(s); };
  sb.auth.onAuthStateChange((event, session) => {
    const u = session ? session.user : null, changed = !AB.ready || (u && u.id) !== (AB.user && AB.user.id);
    AB.user = u;
    if (!changed) return;
    AB.ready = true; cache = {};
    // a sign-in link lands on the page with tokens in the address; tidy the address bar
    if (u && /access_token|refresh_token|[?&]code=/.test(location.hash + location.search))
      history.replaceState(null, "", location.pathname + location.search.replace(/[?&]code=[^&]*/, "").replace(/^&/, "?"));
    setTimeout(() => subs.forEach(notify));
  });

  const here = () => location.origin + location.pathname;
  AB.sendLink = (email, redirect) =>
    sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect || here(), shouldCreateUser: true } });
  AB.verifyCode = (email, code) => sb.auth.verifyOtp({ email: email.trim(), token: code.replace(/\D/g, ""), type: "email" });
  AB.google = (redirect) => sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect || here() } });
  AB.signOut = () => sb.auth.signOut();

  const must = ({ data, error }) => { if (error) throw error; return data; };

  // ---------- reference data ----------
  AB.basilicas = async () => cache.bas || (cache.bas = must(await sb.from("basilicas").select("*").order("state").order("city").order("name")));
  AB.basilicaMap = async () => { const m = {}; (await AB.basilicas()).forEach((b) => (m[b.id] = b)); return m; };

  // ---------- profile ----------
  AB.profile = async () => cache.prof || (cache.prof = must(await sb.from("profiles").select("id,display_name").eq("id", AB.user.id).single()));
  AB.rename = async (name) => { must(await sb.from("profiles").update({ display_name: name.trim() }).eq("id", AB.user.id)); cache.prof = null; };
  AB.isAdmin = async () => (cache.admin != null ? cache.admin : (cache.admin = !!must(await sb.rpc("is_admin"))));

  // ---------- gallery membership ----------
  // { access, kind: "trial" | "subscriber" | "admin" | "expired", joined, free_until, paid_through, email, welcomed_at }
  // The members' gallery is free for 3 months from sign-up, then for subscribers. The database enforces it;
  // this is only so the pages can explain where a member stands.
  AB.SUBSCRIBE_URL = C.subscribeUrl || "https://buymeacoffee.com/americanbasilicas/membership";
  AB.membership = async (force) => {
    if (cache.mem && !force) return cache.mem;
    const rows = must(await sb.rpc("membership"));
    return (cache.mem = (rows && rows[0]) || { access: false, kind: "expired" });
  };
  AB.markWelcomed = async () => { must(await sb.rpc("mark_welcomed")); if (cache.mem) cache.mem.welcomed_at = new Date().toISOString(); };
  AB.daysLeft = (ts) => Math.max(0, Math.ceil((new Date(ts) - Date.now()) / 86400000));

  // ---------- visits ----------
  AB.visits = async (force) => {
    if (cache.visits && !force) return cache.visits;
    const m = new Map();
    must(await sb.from("visits").select("basilica_id,visited_on,note,created_at")).forEach((v) => m.set(v.basilica_id, v));
    return (cache.visits = m);
  };
  AB.saveVisit = async (bid, fields) => {
    const row = Object.assign({ basilica_id: bid }, fields || {});
    const v = must(await sb.from("visits").upsert(row, { onConflict: "user_id,basilica_id" }).select().single());
    (await AB.visits()).set(bid, v); return v;
  };
  const ensureVisit = async (bid) => { const vs = await AB.visits(); return vs.get(bid) || AB.saveVisit(bid, {}); };
  AB.removeVisit = async (bid) => {                 // also deletes that visit's photos and files
    const ps = await AB.myPhotos(bid);
    if (ps.length) must(await sb.storage.from(BUCKET).remove(ps.flatMap((p) => [p.storage_path, p.thumb_path])));
    must(await sb.from("visits").delete().eq("user_id", AB.user.id).eq("basilica_id", bid));
    (await AB.visits()).delete(bid);
  };

  // ---------- photos ----------
  const PHOTO_COLS = "id,user_id,basilica_id,storage_path,thumb_path,caption,width,height,status,like_count,created_at";
  // the uploader's display name; the likes tables also link photos/reviews to profiles, so name the foreign key
  const PHOTO_BY = ",profiles!photos_user_id_fkey(display_name)", REVIEW_BY = ",profiles!reviews_user_id_fkey(display_name)";
  AB.myPhotos = async (bid) => {
    let q = sb.from("photos").select(PHOTO_COLS).eq("user_id", AB.user.id).order("created_at");
    if (bid) q = q.eq("basilica_id", bid);
    return must(await q);
  };
  AB.urls = async (paths, seconds) => {           // private files -> short-lived links
    const out = {}; paths = [...new Set(paths.filter(Boolean))];
    for (let i = 0; i < paths.length; i += 100) {
      const rows = must(await sb.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), seconds || 3600));
      rows.forEach((r) => { if (r.signedUrl) out[r.path] = r.signedUrl; });
    }
    return out;
  };

  async function toJpeg(file, max, quality) {     // resize + re-encode; drops all metadata, including GPS
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) {
      src = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = URL.createObjectURL(file); })
        .catch(() => { throw new Error("“" + file.name + "” isn’t a photo this browser can read. Try a JPEG or PNG."); });
    }
    const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight, s = Math.min(1, max / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, w, h); cx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    const blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", quality));
    if (!blob) throw new Error("Couldn’t prepare “" + file.name + "”.");
    return { blob, w, h };
  }
  AB.upload = async (bid, file, caption) => {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)) throw new Error("“" + file.name + "” isn’t a photo.");
    if (file.size > 40 * 1024 * 1024) throw new Error("“" + file.name + "” is over 40 MB.");
    await ensureVisit(bid);
    const [full, thumb] = [await toJpeg(file, FULL_PX, 0.86), await toJpeg(file, THUMB_PX, 0.8)];
    const id = crypto.randomUUID(), path = `${AB.user.id}/${bid}/${id}.jpg`, tpath = path.replace(/\.jpg$/, ".t.jpg");
    const st = sb.storage.from(BUCKET), opt = { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" };
    must(await st.upload(path, full.blob, opt));
    try {
      must(await st.upload(tpath, thumb.blob, opt));
      return must(await sb.from("photos").insert({ basilica_id: bid, storage_path: path, caption: caption || null, width: full.w, height: full.h }).select(PHOTO_COLS).single());
    } catch (e) { await st.remove([path, tpath]); throw e; }
  };
  AB.setCaption = async (id, caption) => must(await sb.from("photos").update({ caption: caption || null }).eq("id", id).select(PHOTO_COLS).single());
  AB.deletePhoto = async (p) => {
    must(await sb.storage.from(BUCKET).remove([p.storage_path, p.thumb_path]));
    must(await sb.from("photos").delete().eq("id", p.id));
  };

  // ---------- members' gallery: photos and reviews by basilica, most liked or latest ----------
  const sorted = (q, sort) => sort === "latest"
    ? q.order("created_at", { ascending: false }).order("id")
    : q.order("like_count", { ascending: false }).order("created_at", { ascending: false }).order("id");
  AB.photosFor = async (bid, { sort, offset, limit } = {}) => {
    const from = offset || 0, n = limit || 24;
    return must(await sorted(sb.from("photos").select(PHOTO_COLS + PHOTO_BY)
      .eq("status", "approved").eq("basilica_id", bid), sort).range(from, from + n - 1));
  };
  const REVIEW_COLS = "id,user_id,basilica_id,body,status,like_count,created_at,updated_at";
  AB.reviewsFor = async (bid, { sort, offset, limit } = {}) => {
    const from = offset || 0, n = limit || 20;
    return must(await sorted(sb.from("reviews").select(REVIEW_COLS + REVIEW_BY)
      .eq("status", "approved").eq("basilica_id", bid), sort).range(from, from + n - 1));
  };
  // { basilica_id: { photos, reviews } } for every basilica; open to all members, so the map can show what's there
  AB.galleryCounts = async () => {
    const m = {};
    must(await sb.rpc("gallery_counts")).forEach((r) => (m[r.basilica_id] = { photos: Number(r.photos) || 0, reviews: Number(r.reviews) || 0 }));
    return m;
  };

  // likes: kind is "photo" or "review"
  const LIKES = { photo: ["photo_likes", "photo_id"], review: ["review_likes", "review_id"] };
  AB.myLikes = async (kind, ids) => {
    const [t, col] = LIKES[kind], out = new Set();
    for (let i = 0; i < ids.length; i += 100) must(await sb.from(t).select(col).eq("user_id", AB.user.id).in(col, ids.slice(i, i + 100))).forEach((r) => out.add(r[col]));
    return out;
  };
  AB.like = async (kind, id) => { const [t, col] = LIKES[kind]; must(await sb.from(t).insert({ [col]: id })); };
  AB.unlike = async (kind, id) => { const [t, col] = LIKES[kind]; must(await sb.from(t).delete().eq("user_id", AB.user.id).eq(col, id)); };

  // the member's own review of a basilica (one each); writing one needs a logged visit with at least one photo
  AB.myReview = async (bid) => must(await sb.from("reviews").select(REVIEW_COLS).eq("user_id", AB.user.id).eq("basilica_id", bid).maybeSingle());
  AB.myReviews = async () => must(await sb.from("reviews").select(REVIEW_COLS).eq("user_id", AB.user.id));
  AB.saveReview = async (bid, body, id) => {
    body = String(body || "").trim();
    if (body.length < 20) throw new Error("Write at least 20 characters.");
    if (body.length > 2000) throw new Error("Keep it under 2,000 characters.");
    const q = id ? sb.from("reviews").update({ body }).eq("id", id) : sb.from("reviews").insert({ basilica_id: bid, body });
    try { return must(await q.select(REVIEW_COLS).single()); }
    catch (e) { throw /row-level security|violates/.test(e.message) ? new Error("Add at least one photo from your visit first, then you can leave a review.") : e; }
  };
  AB.deleteReview = async (id) => must(await sb.from("reviews").delete().eq("id", id));

  // ---------- moderation and memberships (admins) ----------
  AB.pending = async () => must(await sb.from("photos").select(PHOTO_COLS + PHOTO_BY).eq("status", "pending").order("created_at").limit(200));
  AB.pendingReviews = async () => must(await sb.from("reviews").select(REVIEW_COLS + REVIEW_BY).eq("status", "pending").order("updated_at").limit(200));
  AB.moderate = async (kind, id, decision) => must(await sb.rpc("moderate", { kind, item_id: id, decision }));
  AB.review = (id, decision) => AB.moderate("photo", id, decision);
  AB.grantAccess = async (email, months, why) => must(await sb.rpc("admin_grant_access", { member_email: email, months: +months, why: why || null }));
  AB.subscriptions = async () => must(await sb.rpc("admin_subscriptions"));

  // ---------- server functions: purchase history, account deletion ----------
  async function fn(action) {
    const { data, error } = await sb.functions.invoke("account", { body: { action } });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    return data;
  }
  AB.orders = () => fn("orders");
  AB.deleteAccount = async () => { await fn("delete"); await sb.auth.signOut(); };
})();
