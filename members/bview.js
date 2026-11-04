/* One basilica's members' content: photos, reviews, and questions & answers, each sortable.
   Used in the gallery's side panel (gallery.html) and on each basilica's own page (basilica.html).
   AB.basilicaView(el, basilica, { M, visits, counts, tab, sort, onState, onRecheck })
     M        the member's gallery membership (AB.membership())
     visits   Map of the member's visits (AB.visits())
     counts   { photos, reviews, questions } approved items for this basilica
     tab      "photos" | "reviews" | "questions";  sort  "popular" | "latest"
     onState  called with { tab, sort } when the member switches either (pages keep them in the address)
     onRecheck called with a fresh membership after "Already subscribed? Check again" finds access */
(function () {
  "use strict";
  const AB = window.AB, E = AB.esc;
  const plural = (n, w) => (n || 0).toLocaleString() + " " + w + (n === 1 ? "" : "s");
  AB.countLine = (c) => plural(c.photos, "photo") + " · " + plural(c.reviews, "review") + " · " + plural(c.questions || 0, "question");
  AB.countTotal = (c) => (c.photos || 0) + (c.reviews || 0) + (c.questions || 0);

  const TABS = { photos: "Photos", reviews: "Reviews", questions: "Questions" };
  const SORTS = { photos: ["Most liked", "Latest"], reviews: ["Most liked", "Latest"], questions: ["Most answered", "Latest"] };
  const PAGE = { photos: 24, reviews: 10, questions: 10 };

  AB.basilicaView = function (el, b, ctx) {
    const st = { tab: TABS[ctx.tab] ? ctx.tab : "photos", sort: ctx.sort === "latest" ? "latest" : "popular" };
    const c = Object.assign({ photos: 0, reviews: 0, questions: 0 }, ctx.counts || {});
    const M = ctx.M, VISITS = ctx.visits || new Map();
    let seq = 0;

    if (!M.access) {
      el.innerHTML = '<div class="paywall"><p class="pw-n">' + (AB.countTotal(c)
        ? "<b>" + AB.countLine(c) + "</b> about " + E(b.name) + " are waiting in the members’ gallery."
        : "No one has shared photos, reviews or questions about " + E(b.name) + " yet.") + "</p>" +
        "<p>" + AB.memberLine(M).html + "</p>" +
        '<div class="btnrow">' + AB.subscribeButtons(M) + "</div>" + AB.subscribeNote(M) + "</div>";
      AB.wireRecheck(el, (m) => { if (ctx.onRecheck) ctx.onRecheck(m); });
      return;
    }

    function render() {
      const [s1, s2] = SORTS[st.tab];
      el.innerHTML =
        '<div class="gtabs" role="tablist">' + Object.keys(TABS).map((t) =>
          '<button role="tab" type="button" data-tab="' + t + '" aria-selected="' + (st.tab === t) + '">' + TABS[t] + " <span>" + (c[t] || 0) + "</span></button>").join("") + "</div>" +
        '<div class="gsort" role="group" aria-label="Sort"><span>Sort</span><button type="button" data-sort="popular" aria-pressed="' + (st.sort === "popular") + '">' + s1 + "</button>" +
        '<button type="button" data-sort="latest" aria-pressed="' + (st.sort === "latest") + '">' + s2 + "</button></div>" +
        '<div data-mine></div><div data-items></div><div class="btnrow" style="margin-top:14px"><button class="btn small" type="button" data-more hidden>Load more</button></div><p class="msg" data-msg role="status"></p>';
      el.querySelectorAll("[data-tab]").forEach((t) => (t.onclick = () => { st.tab = t.dataset.tab; changed(); }));
      el.querySelectorAll("[data-sort]").forEach((t) => (t.onclick = () => { st.sort = t.dataset.sort; changed(); }));
      load(true);
    }
    function changed() { if (ctx.onState) ctx.onState({ tab: st.tab, sort: st.sort }); render(); }

    let items = [], urls = {}, liked = new Set(), offset = 0, busy = false;
    const $ = (sel) => el.querySelector(sel);
    async function load(reset) {
      if (busy && !reset) return;
      const my = reset ? ++seq : seq; busy = true;
      const box = $("[data-items]"), more = $("[data-more]"), msg = $("[data-msg]"), tab = st.tab;
      if (reset) {
        items = []; offset = 0; liked = new Set(); box.innerHTML = "";
        box.className = tab === "photos" ? "grid-ph gph" : tab === "reviews" ? "grv" : "gqa";
        more.onclick = () => load(false);
        if (tab === "reviews") mineReview();
        if (tab === "questions") askBox();
      }
      msg.className = "msg"; msg.innerHTML = '<span class="spin"></span> Loading…';
      try {
        let fresh, batchLen;
        if (tab === "questions") {
          const batch = await AB.questionsFor(b.id, { sort: st.sort, offset, limit: PAGE.questions });
          fresh = batch.filter((x) => !items.some((y) => y.id === x.id)); batchLen = batch.length;
          const answers = fresh.length ? await AB.answersFor(fresh.map((q) => q.id)) : [];
          if (my !== seq) return;
          fresh.forEach((q) => box.appendChild(questionCard(q, answers.filter((a) => a.question_id === q.id))));
        } else {
          const kind = tab === "photos" ? "photo" : "review";
          const batch = await (tab === "photos" ? AB.photosFor : AB.reviewsFor)(b.id, { sort: st.sort, offset, limit: PAGE[tab] });
          fresh = batch.filter((x) => !items.some((y) => y.id === x.id)); batchLen = batch.length;
          const [u, l] = await Promise.all([
            tab === "photos" ? AB.urls(fresh.map((p) => p.thumb_path)) : Promise.resolve({}),
            AB.myLikes(kind, fresh.map((x) => x.id))
          ]);
          if (my !== seq) return;
          Object.assign(urls, u); l.forEach((x) => liked.add(x));
          const start = items.length;
          fresh.forEach((x, k) => box.appendChild(tab === "photos" ? photoCard(x, start + k) : reviewCard(x)));
        }
        offset += batchLen; items = items.concat(fresh);
        more.hidden = batchLen < PAGE[tab];
        msg.className = items.length ? "msg" : "msg empty";
        msg.textContent = items.length ? "" : tab === "photos"
          ? "No member photos of this basilica yet." + (VISITS.has(b.id) ? " Add yours from your visit." : " Been here? Check it off and add yours.")
          : tab === "reviews" ? "No reviews of this basilica yet." : "No questions about this basilica yet. Ask the first one above.";
      } catch (e) { if (my === seq) { msg.className = "msg err"; msg.textContent = e.message; } }
      if (my === seq) busy = false;
    }

    const who = (x) => (x.profiles && x.profiles.display_name) || "A member";
    const own = (x) => x.user_id === AB.user.id;
    const when = (x) => AB.fmtDate(x.created_at) + (x.updated_at && new Date(x.updated_at) - new Date(x.created_at) > 60000 ? " · edited" : "");

    // ---------- photos ----------
    function heart(kind, x, after) {
      return AB.likeButton({ kind, id: x.id, count: x.like_count, liked: liked.has(x.id), own: own(x),
        onChange: (on, n) => { x.like_count = n; if (on) liked.add(x.id); else liked.delete(x.id); if (after) after(); } });
    }
    function photoCard(p, i) {
      const f = document.createElement("figure"); f.className = "ph"; f.dataset.id = p.id;
      f.innerHTML = '<button class="open" type="button" aria-label="Open photo by ' + E(who(p)) + '"><img loading="lazy" src="' + E(urls[p.thumb_path] || "") + '" alt="' + E(p.caption || b.name) + '"></button>' +
        '<figcaption><div class="gph-meta"><span>by <b>' + E(who(p)) + "</b><br>" + E(AB.fmtDate(p.created_at)) + "</span></div>" +
        (p.caption ? '<p class="gph-cap">' + E(p.caption) + "</p>" : "") + "</figcaption>";
      const slot = () => {                 // (re)draw this card's like button; likes made in the lightbox redraw it too
        const old = f.querySelector(".like");
        const nb = heart("photo", p, () => { const lb = document.querySelector(".lb .like"); if (lb && lb.dataset.id === p.id) lb.replaceWith(lbHeart(p)); });
        if (old) old.replaceWith(nb); else f.querySelector(".gph-meta").appendChild(nb);
      };
      slot();
      f._slot = slot;
      f.querySelector(".open").onclick = () => AB.lightbox(items.map((x) => ({
        thumb: urls[x.thumb_path], alt: x.caption || b.name,
        full: async () => (await AB.urls([x.storage_path]))[x.storage_path],
        caption: "<b>" + E(b.name) + "</b> — photo by " + E(who(x)) + (x.caption ? "<br>" + E(x.caption) : ""),
        render: (cap) => cap.appendChild(lbHeart(x))
      })), i);
      return f;
    }
    function lbHeart(x) {
      const btn = heart("photo", x, () => { const f = el.querySelector('.gph .ph[data-id="' + x.id + '"]'); if (f && f._slot) f._slot(); });
      btn.dataset.id = x.id; return btn;
    }

    // ---------- reviews ----------
    function reviewCard(r) {
      const a = document.createElement("article"); a.className = "rv";
      a.innerHTML = "<header><b>" + E(who(r)) + "</b><span>" + E(when(r)) + "</span></header>" +
        '<p class="rv-body">' + E(r.body) + "</p><footer></footer>";
      a.querySelector("footer").appendChild(heart("review", r));
      return a;
    }
    async function mineReview() {          // the member's own review: prompt only after a logged visit with photos
      const box = $("[data-mine]");
      if (!VISITS.has(b.id)) {
        box.innerHTML = '<p class="hint gmine-h">Reviews come from members who’ve logged a visit with photos. Been here? <a href="' + AB.page("account.html#b=" + b.id) + '">Add your visit</a>.</p>';
        return;
      }
      let n = 0; try { n = (await AB.myPhotos(b.id)).length; } catch (e) {}
      box.className = "gmine";
      AB.reviewBlock(box, b, { photos: n, ineligible: '<p class="hint gmine-h">Add a photo from your visit in <a href="' + AB.page("account.html#b=" + b.id) + '">My pilgrimage</a> to leave a review.</p>' });
    }

    // ---------- questions and answers ----------
    const visitedTag = (x) => (x.author_visited ? ' <span class="qa-v" title="Had checked off this basilica when posting">✓ Has visited</span>' : "");
    const statusTag = (x) => x.status === "pending" ? '<span class="chip pending">Waiting for approval</span>'
      : x.status === "rejected" ? '<span class="chip rejected">Not shared</span>' : "";
    async function myName() { try { return (await AB.profile()).display_name; } catch (e) { return "You"; } }

    function askBox() {
      const box = $("[data-mine]");
      box.className = "qa-ask";
      box.innerHTML = '<form><label class="fld" for="qaq-' + b.id + '">Ask members about this basilica</label>' +
        '<textarea id="qaq-' + b.id + '" maxlength="500" placeholder="Parking, Mass times, tours, the best time for photos, what not to miss…"></textarea>' +
        '<div class="btnrow" style="margin-top:10px"><button class="btn solid" type="submit">Post question</button>' +
        '<span class="hint" style="margin:0">Questions are checked before other members see them.</span></div><p class="msg" role="status"></p></form>';
      const f = box.querySelector("form"), ta = f.querySelector("textarea"), m = f.querySelector(".msg");
      f.onsubmit = async (e) => {
        e.preventDefault(); m.className = "msg"; m.textContent = "";
        f.querySelector("button").disabled = true;
        try {
          const q = await AB.ask(b.id, ta.value);
          q.profiles = { display_name: await myName() };
          ta.value = "";
          m.className = "msg ok"; m.textContent = "Thank you. Your question will appear for other members once it’s approved.";
          const list = $("[data-items]"); list.prepend(questionCard(q, [])); items.unshift(q);
          const empty = $("[data-msg]"); if (empty.classList.contains("empty")) { empty.className = "msg"; empty.textContent = ""; }
        } catch (err) { m.className = "msg err"; m.textContent = err.message; }
        f.querySelector("button").disabled = false;
      };
    }

    function answerRow(a) {
      const d = document.createElement("div"); d.className = "qa-a" + (a.status === "approved" ? "" : " mine");
      d.innerHTML = '<header><span class="qa-who"><b>' + E(who(a)) + "</b>" + visitedTag(a) + "</span><span>" + E(when(a)) + "</span></header>" +
        statusTag(a) + '<p class="qa-body">' + E(a.body) + "</p>" +
        (own(a) ? '<button class="lnk" type="button" data-dela>Delete my answer</button>' : "");
      const del = d.querySelector("[data-dela]");
      if (del) del.onclick = async () => {
        if (!confirm("Delete your answer?")) return;
        try { await AB.deleteAnswer(a.id); d.remove(); } catch (e) { alert(e.message); }
      };
      return d;
    }
    function questionCard(q, answers) {
      const art = document.createElement("article"); art.className = "qa"; art.dataset.id = q.id;
      const open = q.status === "approved";
      const n = q.answer_count || 0;
      art.innerHTML = '<header><span class="qa-who"><b>' + E(who(q)) + "</b>" + visitedTag(q) + "</span><span>" + E(when(q)) + "</span></header>" +
        statusTag(q) + '<p class="qa-q">' + E(q.body) + '</p><div class="qa-as"></div>' +
        '<div class="qa-f"><span class="qa-n">' + (open ? (n ? plural(n, "answer") : "No answers yet") : "Answers open once it’s approved") + "</span>" +
        (open ? '<button class="btn small" type="button" data-reply>Answer</button>' : "") +
        (own(q) ? '<button class="lnk" type="button" data-delq>Delete question</button>' : "") + "</div>" +
        '<form class="qa-reply" hidden><label class="fld" for="qar-' + q.id + '">Your answer</label>' +
        '<textarea id="qar-' + q.id + '" maxlength="1500" placeholder="Share what you know from your visit…"></textarea>' +
        '<div class="btnrow" style="margin-top:10px"><button class="btn solid" type="submit">Post answer</button><button class="btn small" type="button" data-cancel>Cancel</button></div>' +
        '<p class="hint">Answers are checked before other members see them.</p></form><p class="msg" role="status"></p>';
      const as = art.querySelector(".qa-as"), form = art.querySelector(".qa-reply"), m = art.querySelector(":scope > .msg");
      answers.forEach((a) => as.appendChild(answerRow(a)));
      const reply = art.querySelector("[data-reply]");
      if (reply) reply.onclick = () => { form.hidden = false; reply.hidden = true; form.querySelector("textarea").focus(); };
      form.querySelector("[data-cancel]").onclick = () => { form.hidden = true; if (reply) reply.hidden = false; };
      form.onsubmit = async (e) => {
        e.preventDefault(); m.className = "msg"; m.textContent = "";
        form.querySelector("button").disabled = true;
        try {
          const a = await AB.answer(q.id, form.querySelector("textarea").value);
          a.profiles = { display_name: await myName() };
          as.appendChild(answerRow(a));
          form.querySelector("textarea").value = ""; form.hidden = true; if (reply) reply.hidden = false;
          m.className = "msg ok"; m.textContent = "Thank you. Your answer will appear for other members once it’s approved.";
        } catch (err) { m.className = "msg err"; m.textContent = err.message; }
        form.querySelector("button").disabled = false;
      };
      const dq = art.querySelector("[data-delq]");
      if (dq) dq.onclick = async () => {
        if (!confirm("Delete your question" + (n ? " and its answers" : "") + "?")) return;
        try { await AB.deleteQuestion(q.id); art.remove(); } catch (err) { m.className = "msg err"; m.textContent = err.message; }
      };
      return art;
    }

    render();
  };
})();
