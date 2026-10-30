/* Shared page furniture for the member pages: header band, nav, sign-in card, welcome message,
   gallery-membership wording, like buttons, lightbox. Also loaded on the map page. */
(function () {
  "use strict";
  const AB = window.AB, E = AB.esc;
  const OMB = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="omb" viewBox="18 2 64 96"><rect x="48.4" y="48" width="3.2" height="44" fill="#9c7b2e" stroke="#3a2f10" stroke-width="0.8"/><circle cx="50" cy="93" r="3" fill="#e7c866" stroke="#3a2f10" stroke-width="0.8"/><path d="M22 52H31.33V56A4.67 3.5 0 0 1 22 56Z" fill="#d9a521" stroke="#3a2f10" stroke-width=".7"/><path d="M31.33 52H40.67V56A4.67 3.5 0 0 1 31.33 56Z" fill="#8f1d1d" stroke="#3a2f10" stroke-width=".7"/><path d="M40.67 52H50V56A4.67 3.5 0 0 1 40.67 56Z" fill="#d9a521" stroke="#3a2f10" stroke-width=".7"/><path d="M50 52H59.33V56A4.67 3.5 0 0 1 50 56Z" fill="#8f1d1d" stroke="#3a2f10" stroke-width=".7"/><path d="M59.33 52H68.67V56A4.67 3.5 0 0 1 59.33 56Z" fill="#d9a521" stroke="#3a2f10" stroke-width=".7"/><path d="M68.67 52H78V56A4.67 3.5 0 0 1 68.67 56Z" fill="#8f1d1d" stroke="#3a2f10" stroke-width=".7"/><path d="M50 8Q39.92 32 22 52H31.33Q43.28 32 50 8Z" fill="#8f1d1d" stroke="#3a2f10" stroke-width=".6"/><path d="M50 8Q43.28 32 31.33 52H40.67Q46.64 32 50 8Z" fill="#d9a521" stroke="#3a2f10" stroke-width=".6"/><path d="M50 8Q46.64 32 40.67 52H50Q50 32 50 8Z" fill="#8f1d1d" stroke="#3a2f10" stroke-width=".6"/><path d="M50 8Q50 32 50 52H59.33Q53.36 32 50 8Z" fill="#d9a521" stroke="#3a2f10" stroke-width=".6"/><path d="M50 8Q53.36 32 59.33 52H68.67Q56.72 32 50 8Z" fill="#8f1d1d" stroke="#3a2f10" stroke-width=".6"/><path d="M50 8Q56.72 32 68.67 52H78Q60.08 32 50 8Z" fill="#d9a521" stroke="#3a2f10" stroke-width=".6"/><path d="M50 8Q39.92 32 22 52H78Q60.08 32 50 8Z" fill="none" stroke="#3a2f10" stroke-width="1.3"/><circle cx="50" cy="6.5" r="3.2" fill="#e7c866" stroke="#3a2f10" stroke-width=".8"/></symbol></svg>';

  AB.shell = function ({ active, kicker, title }) {
    const top = document.createElement("div");
    top.innerHTML = OMB +
      '<header class="band"><div class="band-in"><svg class="badge" viewBox="0 0 100 100" aria-hidden="true"><use href="#omb" width="100" height="100"/></svg>' +
      '<div class="titles"><p class="kicker">' + E(kicker || "American Basilicas · Members") + "</p><h1>" + title + "</h1></div></div></header>" +
      '<div class="rule"></div><nav class="mnav" aria-label="Member pages"><div class="in">' +
      '<a href="' + AB.page("") + '">&larr; The map</a>' +
      '<a href="' + AB.page("account.html") + '" data-k="account">My pilgrimage</a>' +
      '<a href="' + AB.page("gallery.html") + '" data-k="gallery">Members&rsquo; gallery</a>' +
      '<a href="' + AB.page("review.html") + '" data-k="review" hidden>Review queue</a>' +
      '<span class="who" hidden></span></div></nav>';
    document.body.prepend(top);
    const cur = top.querySelector('[data-k="' + active + '"]'); if (cur) cur.setAttribute("aria-current", "page");
    if (!AB.enabled) return;
    const who = top.querySelector(".who"), rv = top.querySelector('[data-k="review"]');
    AB.onAuth(async (u) => {
      who.hidden = !u; rv.hidden = true;
      if (!u) return;
      let name = u.email;
      try { name = (await AB.profile()).display_name; } catch (e) {}
      who.innerHTML = "Signed in as <b>" + E(name) + '</b> · <a href="#" data-out>Sign out</a>';
      who.querySelector("[data-out]").onclick = async (e) => { e.preventDefault(); await AB.signOut(); };
      try { rv.hidden = !(await AB.isAdmin()); } catch (e) {}
    });
  };

  AB.notConfigured = (el) => {
    el.innerHTML = '<div class="panel-body"><p class="empty">Member accounts aren’t switched on yet. Check back soon.</p></div>';
  };

  const GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.8c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-7.8-6C1 16.5 0 20.1 0 24s1 7.5 2.7 10.8l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z"/></svg>';

  /* Sign-in card: email link (with a 6-digit code as a fallback) or Google. */
  AB.signinForm = function (el, { lead } = {}) {
    el.innerHTML =
      '<div class="signin"><h3>Sign in or create your account</h3>' +
      '<p class="hint" style="margin:0 0 12px">' + (lead || "Check off the basilicas you’ve visited, keep your photos with each visit, and see photos and reviews from other members.") + "</p>" +
      '<p class="perk"><b>New accounts get the members’ gallery free for three months.</b> After that, the gallery is for subscribers. ' +
      "Your own map, visits and photos are always free.</p>" +
      '<button class="btn gbtn" data-g type="button">' + GOOGLE + "Continue with Google</button>" +
      '<div class="or">or</div>' +
      '<form data-f1><label class="fld" for="sie">Email</label><input id="sie" type="email" autocomplete="email" required placeholder="you@example.com">' +
      '<div class="btnrow" style="margin-top:12px"><button class="btn solid" type="submit">Email me a sign-in link</button></div>' +
      '<p class="hint">No password needed. New here? The same link creates your account.</p></form>' +
      '<form data-f2 hidden><p style="margin:0 0 10px">We sent a sign-in link to <b data-to></b>. Open it on this device, or type the 6-digit code from the email:</p>' +
      '<label class="fld" for="sic">Code</label><input id="sic" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" style="max-width:180px;letter-spacing:.3em">' +
      '<div class="btnrow" style="margin-top:12px"><button class="btn solid" type="submit">Sign in</button><button class="btn small" type="button" data-back>Use a different email</button></div></form>' +
      '<p class="msg" role="status"></p></div>';
    const f1 = el.querySelector("[data-f1]"), f2 = el.querySelector("[data-f2]"), msg = el.querySelector(".msg"), email = el.querySelector("#sie");
    const say = (t, cls) => { msg.className = "msg " + (cls || ""); msg.textContent = t || ""; };
    const busy = (form, on) => form.querySelectorAll("button").forEach((b) => (b.disabled = on));
    el.querySelector("[data-g]").onclick = async () => { say(""); const { error } = await AB.google(); if (error) say(error.message, "err"); };
    f1.onsubmit = async (e) => {
      e.preventDefault(); say(""); busy(f1, true);
      const { error } = await AB.sendLink(email.value);
      busy(f1, false);
      if (error) return say(/rate|seconds/i.test(error.message) ? "Please wait a minute before asking for another link." : error.message, "err");
      f2.querySelector("[data-to]").textContent = email.value.trim(); f1.hidden = true; f2.hidden = false; f2.querySelector("input").focus();
    };
    f2.querySelector("[data-back]").onclick = () => { f2.hidden = true; f1.hidden = false; say(""); };
    f2.onsubmit = async (e) => {
      e.preventDefault(); say(""); busy(f2, true);
      const { error } = await AB.verifyCode(email.value, f2.querySelector("input").value);
      busy(f2, false);
      if (error) say("That code didn’t work. Check it, or ask for a new link.", "err");
    };
  };

  /* ---------- gallery membership: one wording everywhere ---------- */
  // returns { tag, html } describing where the member stands; m comes from AB.membership()
  AB.memberLine = function (m) {
    const until = (t) => "<b>" + E(AB.fmtDate(t)) + "</b>";
    if (m.kind === "admin") return { tag: "Administrator", html: "You have full access to the members’ gallery as a site administrator." };
    if (m.kind === "subscriber") return { tag: "Subscriber", html: "Thank you for subscribing. Your gallery access runs through " + until(m.paid_through) + " and renews with your membership." };
    if (m.kind === "trial") {
      const d = AB.daysLeft(m.free_until);
      return { tag: "Free for " + d + " more day" + (d === 1 ? "" : "s"), html: "The members’ gallery is included free until " + until(m.free_until) +
        " — your first three months. After that, it’s for subscribers. Your own map, visits and photos stay free." };
    }
    return { tag: "Subscribers only", html: "Your free three months of the members’ gallery ended on " + until(m.free_until) +
      ". Subscribe to see members’ photos and reviews again. Your own map, visits and photos stay free." };
  };
  AB.subscribeButtons = (m) =>
    '<a class="btn solid" href="' + E(AB.SUBSCRIBE_URL) + '" target="_blank" rel="noopener">Become a subscriber</a>' +
    '<button class="btn" type="button" data-recheck>Already subscribed? Check again</button>';
  AB.subscribeNote = (m) => '<p class="hint">Subscribe with the same email you sign in with' + (m && m.email ? " (<b>" + E(m.email) + "</b>)" : "") +
    " so we can match your membership. It can take a minute to show up here.</p>";
  AB.wireRecheck = (el, after) => {
    const b = el.querySelector("[data-recheck]"); if (!b) return;
    b.onclick = async () => {
      b.disabled = true; b.textContent = "Checking…";
      try {
        const m = await AB.membership(true);
        if (m.access) { after(m); return; }
        b.textContent = "Not found yet — try again in a minute";
      } catch (e) { b.textContent = "Couldn’t check: " + e.message; }
      setTimeout(() => { b.disabled = false; b.textContent = "Already subscribed? Check again"; }, 4000);
    };
  };

  /* ---------- welcome message, once, the first time a member signs in ---------- */
  async function welcome() {
    let m, p;
    try { [m, p] = await Promise.all([AB.membership(), AB.profile()]); } catch (e) { return; }
    if (!m || m.welcomed_at || document.querySelector(".mb-welcome")) return;
    const first = p && p.display_name && p.display_name !== "Pilgrim" ? ", " + E(p.display_name) : "";
    const gal = m.kind === "trial"
      ? "<h3>The members’ gallery — free until " + E(AB.fmtDate(m.free_until)) + "</h3><p>Browse every member’s photos and reviews basilica by basilica on the gallery map, " +
        "like your favourites, and sort by most liked or latest. <b>It’s included free for your first three months.</b> After " + E(AB.fmtDate(m.free_until)) +
        ", the gallery is for paid subscribers.</p>"
      : "<h3>The members’ gallery</h3><p>" + AB.memberLine(m).html + "</p>";
    const el = document.createElement("div");
    el.className = "mb-modal mb-welcome"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "mbwT");
    el.innerHTML = '<div class="mb-card"><div class="mb-cardbar"><p class="kicker">American Basilicas · Members</p><h2 id="mbwT">Welcome' + first + "!</h2></div>" +
      '<div class="mb-cardbody"><p style="margin-top:0">Your account is ready. Here’s what it includes:</p>' +
      "<h3>Always free</h3><p>Your own edition of the map: check off the basilicas you’ve visited, record the date and a private note, and keep your photos with each visit.</p>" +
      gal +
      (m.kind === "trial" ? '<p class="hint">If you subscribe later, use the same email you sign in with' + (m.email ? " (<b>" + E(m.email) + "</b>)" : "") + ".</p>" : "") +
      '<div class="btnrow" style="margin-top:18px"><a class="btn solid" href="' + AB.page("account.html") + '" data-go>Start my pilgrimage</a>' +
      '<a class="btn" href="' + AB.page("gallery.html") + '" data-go>Open the gallery map</a></div></div>' +
      '<button class="x" type="button" aria-label="Close">&times;</button></div>';
    const done = () => { el.remove(); document.removeEventListener("keydown", key, true); AB.markWelcomed().catch(() => {}); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(); } };
    el.querySelector(".x").onclick = done;
    el.addEventListener("click", (e) => { if (e.target === el) done(); });
    el.querySelectorAll("[data-go]").forEach((a) => (a.onclick = (e) => {
      const here = location.pathname.split("/").pop() === a.getAttribute("href").split("/").pop();
      done(); if (here) e.preventDefault();
    }));
    document.addEventListener("keydown", key, true);
    document.body.appendChild(el); el.querySelector(".btn").focus();
  }
  if (AB.enabled) AB.onAuth((u) => { if (u) welcome(); });

  /* ---------- like button (photos and reviews) ---------- */
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 4.4 2.4h1.6c.8-1.3 2.3-2.4 4.4-2.4 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>';
  AB.likeButton = function ({ kind, id, count, liked, own, locked, onChange }) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "like";
    const draw = () => {
      b.setAttribute("aria-pressed", String(!!liked));
      b.innerHTML = HEART + "<span>" + count + "</span>";
      b.title = own ? "Likes on your " + kind : locked ? "Subscribe to like" : liked ? "Unlike" : "Like";
      b.setAttribute("aria-label", (own ? "Likes on your " + kind : (liked ? "Unlike" : "Like") + " this " + kind) + ": " + count);
    };
    if (own || locked) b.disabled = true;
    b.onclick = async (e) => {
      e.stopPropagation();
      if (b.dataset.busy) return; b.dataset.busy = "1";
      liked = !liked; count += liked ? 1 : -1; draw();
      try { await (liked ? AB.like(kind, id) : AB.unlike(kind, id)); if (onChange) onChange(liked, count); }
      catch (err) { liked = !liked; count += liked ? 1 : -1; draw(); AB.toast("Couldn’t save your like: " + err.message); }
      delete b.dataset.busy;
    };
    draw(); return b;
  };
  AB.toast = function (text) {
    const t = document.createElement("div"); t.className = "mb-toast"; t.setAttribute("role", "status"); t.textContent = text;
    document.body.appendChild(t); setTimeout(() => t.remove(), 4500);
  };

  /* Lightbox over a list of {thumb, full(path), caption(html), render(captionEl)}; full-size links are fetched on demand. */
  AB.lightbox = function (items, start) {
    let i = start, el = document.createElement("div");
    el.className = "lb"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = '<button class="x" aria-label="Close">&times;</button>' + (items.length > 1 ? '<button class="nav prev" aria-label="Previous">&lsaquo;</button><button class="nav next" aria-label="Next">&rsaquo;</button>' : "") +
      '<figure><img alt=""><figcaption></figcaption></figure>';
    const img = el.querySelector("img"), cap = el.querySelector("figcaption");
    const show = async () => {
      const it = items[i]; img.src = it.thumb || ""; img.alt = it.alt || ""; cap.innerHTML = it.caption || "";
      if (it.render) it.render(cap);
      if (it.full) { try { const u = await it.full(); if (items[i] === it && u) img.src = u; } catch (e) {} }
    };
    const close = () => { el.remove(); window.removeEventListener("keydown", key, true); document.body.style.overflow = prevOverflow; };
    const go = (d) => { i = (i + d + items.length) % items.length; show(); };
    const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); };
    el.querySelector(".x").onclick = close;
    el.addEventListener("click", (e) => { if (e.target === el) close(); });
    if (items.length > 1) { el.querySelector(".prev").onclick = () => go(-1); el.querySelector(".next").onclick = () => go(1); }
    window.addEventListener("keydown", key, true); const prevOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    document.body.appendChild(el); show(); el.querySelector(".x").focus();
  };
})();
