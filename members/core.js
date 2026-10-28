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
  const subs = [];
  AB.onAuth = (fn) => { subs.push(fn); if (AB.ready) fn(AB.user); };
  sb.auth.onAuthStateChange((event, session) => {
    const u = session ? session.user : null, changed = !AB.ready || (u && u.id) !== (AB.user && AB.user.id);
    AB.user = u;
    if (!changed) return;
    AB.ready = true; cache = {};
    // a sign-in link lands on the page with tokens in the address; tidy the address bar
    if (u && /access_token|refresh_token|[?&]code=/.test(location.hash + location.search))
      history.replaceState(null, "", location.pathname + location.search.replace(/[?&]code=[^&]*/, "").replace(/^&/, "?"));
    setTimeout(() => subs.forEach((f) => { try { f(u); } catch (e) { console.error(e); } }));
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
  AB.profile = async () => cache.prof || (cache.prof = must(await sb.from("profiles").select("id,display_name,created_at").eq("id", AB.user.id).single()));
  AB.rename = async (name) => { must(await sb.from("profiles").update({ display_name: name.trim() }).eq("id", AB.user.id)); cache.prof = null; };
  AB.isAdmin = async () => (cache.admin != null ? cache.admin : (cache.admin = !!must(await sb.rpc("is_admin"))));

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
  const PHOTO_COLS = "id,user_id,basilica_id,storage_path,thumb_path,caption,width,height,status,created_at";
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

  // ---------- members' gallery ----------
  AB.gallery = async ({ basilica, before, limit } = {}) => {
    let q = sb.from("photos").select(PHOTO_COLS + ",profiles(display_name)").eq("status", "approved")
      .order("created_at", { ascending: false }).limit(limit || 24);
    if (basilica) q = q.eq("basilica_id", basilica);
    if (before) q = q.lt("created_at", before);
    return must(await q);
  };
  AB.galleryCounts = async () => { const m = {}; must(await sb.rpc("gallery_counts")).forEach((r) => (m[r.basilica_id] = Number(r.n))); return m; };

  // ---------- review queue (admins) ----------
  AB.pending = async () => must(await sb.from("photos").select(PHOTO_COLS + ",profiles(display_name)").eq("status", "pending").order("created_at").limit(200));
  AB.review = async (id, decision) => must(await sb.rpc("review_photo", { photo_id: id, decision }));

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
