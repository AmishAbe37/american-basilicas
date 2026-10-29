/* The "my visit" block: check-off, date, private note, photos and the member's review for one basilica.
   Used in the map's basilica popup and on the account page; the review part is also used in the gallery. */
(function () {
  "use strict";
  const AB = window.AB, E = AB.esc;
  const STATUS = {
    pending: ["pending", "Awaiting review"],
    approved: ["approved", "In members’ gallery"],
    rejected: ["rejected", "Only in your visit"]
  };

  AB.visitBlock = async function (el, b, opts) {
    opts = opts || {};
    const changed = () => { if (opts.onChange) opts.onChange(b.id); };
    el.classList.add("visitblk");
    el.innerHTML = '<p class="vb-load"><span class="spin"></span> Loading your visit…</p>';
    let v;
    try { v = (await AB.visits()).get(b.id); } catch (e) { el.innerHTML = '<p class="msg err">Couldn’t load your visit. ' + E(e.message) + "</p>"; return; }

    if (!v) {
      el.innerHTML = '<div class="btnrow"><button class="btn solid" type="button" data-add>✓ I’ve visited</button>' +
        '<span class="hint" style="margin:0">Check it off, then add your date and photos.</span></div><p class="msg" role="status"></p>';
      el.querySelector("[data-add]").onclick = async (e) => {
        e.target.disabled = true;
        try { await AB.saveVisit(b.id, { visited_on: AB.today() }); changed(); AB.visitBlock(el, b, opts); }
        catch (err) { e.target.disabled = false; el.querySelector(".msg").className = "msg err"; el.querySelector(".msg").textContent = err.message; }
      };
      return;
    }

    const uid = "v" + Math.random().toString(36).slice(2, 8);
    el.innerHTML =
      '<div class="vb-head"><span class="vb-done">✓ Visited</span>' +
      '<label class="fld vb-dl" for="' + uid + 'd">Date</label><input id="' + uid + 'd" type="date" max="' + AB.today() + '" value="' + E(v.visited_on || "") + '">' +
      '<button class="btn small" type="button" data-rm>Remove</button></div>' +
      '<label class="fld" for="' + uid + 'n" style="margin-top:12px">Private note</label>' +
      '<textarea id="' + uid + 'n" maxlength="2000" placeholder="Who you went with, Mass times, what to see next time… only you can see this.">' + E(v.note || "") + "</textarea>" +
      '<div class="vb-ph"><div class="vb-phh"><b>Your photos</b>' +
      '<label class="btn small solid vb-up">Add photos<input type="file" accept="image/*" multiple hidden></label></div>' +
      '<p class="hint">Photos are resized and their location data is removed before upload. They appear here right away, and in the members’ gallery once approved.</p>' +
      '<div class="grid-ph" data-grid></div></div><div class="vb-rv" data-rv></div><p class="msg" role="status"></p>';
    const msg = el.querySelector(".msg"), say = (t, c) => { msg.className = "msg " + (c || ""); msg.textContent = t || ""; };
    const date = el.querySelector('input[type=date]'), note = el.querySelector("textarea"), grid = el.querySelector("[data-grid]"), rv = el.querySelector("[data-rv]");

    date.onchange = async () => {
      try { await AB.saveVisit(b.id, { visited_on: date.value || null }); say("Date saved.", "ok"); changed(); }
      catch (e) { say(e.message, "err"); }
    };
    let last = note.value;
    note.onblur = async () => {
      if (note.value === last) return;
      try { await AB.saveVisit(b.id, { note: note.value.trim() || null }); last = note.value; say("Note saved.", "ok"); }
      catch (e) { say(e.message, "err"); }
    };
    el.querySelector("[data-rm]").onclick = async () => {
      const n = (await AB.myPhotos(b.id)).length;
      if (!confirm("Remove " + b.name + " from your visited list?" + (n ? "\n\nThis also deletes your " + n + " photo" + (n > 1 ? "s" : "") + " from this visit." : ""))) return;
      try { await AB.removeVisit(b.id); changed(); AB.visitBlock(el, b, opts); } catch (e) { say(e.message, "err"); }
    };

    let shownFor = null;
    async function drawPhotos() {
      let ps;
      try { ps = await AB.myPhotos(b.id); } catch (e) { grid.innerHTML = '<p class="msg err">' + E(e.message) + "</p>"; return; }
      if (shownFor !== (ps.length > 0)) { shownFor = ps.length > 0; AB.reviewBlock(rv, b, { photos: ps.length }); }   // keep a half-written review
      if (!ps.length) { grid.innerHTML = '<p class="empty" style="margin:0">No photos yet.</p>'; return; }
      const urls = await AB.urls(ps.map((p) => p.thumb_path));
      grid.innerHTML = ps.map((p, i) => {
        const s = STATUS[p.status] || STATUS.pending;
        return '<figure class="ph"><span class="chip ' + s[0] + '">' + s[1] + '</span><button class="open" type="button" data-i="' + i + '" aria-label="Open photo">' +
          '<img loading="lazy" src="' + E(urls[p.thumb_path] || "") + '" alt="' + E(p.caption || "Your photo of " + b.name) + '"></button>' +
          '<figcaption><input type="text" maxlength="300" data-cap="' + i + '" value="' + E(p.caption || "") + '" placeholder="Add a caption" aria-label="Caption" style="font-size:13px;padding:6px 8px;max-width:none">' +
          '<button class="btn small" type="button" data-del="' + i + '" style="margin-top:6px;width:100%">Delete</button></figcaption></figure>';
      }).join("");
      grid.querySelectorAll("[data-i]").forEach((btn) => btn.onclick = () => AB.lightbox(ps.map((p) => ({
        thumb: urls[p.thumb_path], alt: p.caption || b.name,
        full: async () => (await AB.urls([p.storage_path]))[p.storage_path],
        caption: "<b>" + E(b.name) + "</b>" + (p.caption ? " — " + E(p.caption) : "")
      })), +btn.dataset.i));
      grid.querySelectorAll("[data-cap]").forEach((inp) => inp.onchange = async () => {
        const p = ps[+inp.dataset.cap];
        try {
          const np = await AB.setCaption(p.id, inp.value.trim());
          say(p.status === "approved" && np.status === "pending" ? "Caption saved — the photo goes back for a quick review before it shows in the gallery again." : "Caption saved.", "ok");
          drawPhotos();
        } catch (e) { say(e.message, "err"); }
      });
      grid.querySelectorAll("[data-del]").forEach((btn) => btn.onclick = async () => {
        if (!confirm("Delete this photo? This can’t be undone.")) return;
        btn.disabled = true;
        try { await AB.deletePhoto(ps[+btn.dataset.del]); drawPhotos(); changed(); } catch (e) { btn.disabled = false; say(e.message, "err"); }
      });
    }

    const input = el.querySelector('input[type=file]');
    input.onchange = async () => {
      const files = [...input.files]; input.value = "";
      if (!files.length) return;
      let ok = 0, bad = [];
      for (let k = 0; k < files.length; k++) {
        say("Uploading " + (k + 1) + " of " + files.length + "…");
        try { await AB.upload(b.id, files[k]); ok++; } catch (e) { bad.push(e.message); if (/30 photos/.test(e.message)) break; }
      }
      say(bad.length ? (ok ? ok + " added. " : "") + bad[0] : ok + " photo" + (ok > 1 ? "s" : "") + " added — they’ll appear in the members’ gallery once approved.", bad.length ? "err" : "ok");
      drawPhotos(); changed();
    };
    drawPhotos();
  };

  /* The member's review of a basilica. Members are asked for one only once they've logged the visit and added
     at least one photo (the database enforces the same rule). Reviews are checked before other members see them. */
  const later = new Set();                      // "Not now" — don't ask again on this page
  AB.reviewBlock = async function (el, b, opts) {
    opts = opts || {};
    let r = null;
    try { r = await AB.myReview(b.id); } catch (e) { el.innerHTML = ""; return; }
    const changed = (x) => { if (opts.onChange) opts.onChange(x); };
    const say = (t, c) => { const m = el.querySelector(".msg"); if (m) { m.className = "msg " + (c || ""); m.textContent = t || ""; } };

    if (r) {
      const s = STATUS[r.status] || STATUS.pending;
      el.innerHTML = '<div class="rv-mine"><div class="rv-h"><b>Your review</b><span class="chip ' + s[0] + '">' + s[1] + "</span>" +
        (r.status === "approved" ? '<span class="rv-likes" title="Likes from other members">♥ ' + r.like_count + "</span>" : "") + "</div>" +
        '<p class="rv-body">' + E(r.body) + "</p>" +
        '<div class="btnrow"><button class="btn small" type="button" data-edit>Edit</button><button class="btn small danger" type="button" data-del>Delete</button></div>' +
        '<p class="msg" role="status"></p></div>';
      el.querySelector("[data-edit]").onclick = () => form(r);
      el.querySelector("[data-del]").onclick = async () => {
        if (!confirm("Delete your review of " + b.name + "?")) return;
        try { await AB.deleteReview(r.id); changed(null); AB.reviewBlock(el, b, opts); } catch (e) { say(e.message, "err"); }
      };
      return;
    }
    if (!(opts.photos > 0)) { el.innerHTML = opts.ineligible || ""; return; }
    if (later.has(b.id)) {
      el.innerHTML = '<p class="hint" style="margin:0"><a href="#" data-w>Write a review</a> to tell other members what you enjoyed.</p>';
      el.querySelector("[data-w]").onclick = (e) => { e.preventDefault(); later.delete(b.id); AB.reviewBlock(el, b, opts); };
      return;
    }
    form(null);

    function form(existing) {
      const id = "rv" + Math.random().toString(36).slice(2, 8);
      el.innerHTML = '<form class="rv-prompt">' +
        (existing ? "<h4>Edit your review</h4>" : "<h4>How was your visit?</h4><p>Leave a review to tell other members what you enjoyed at " + E(b.name) +
          " — the art, the music, a Mass worth catching, something not to miss nearby.</p>") +
        '<label class="fld" for="' + id + '">Your review</label><textarea id="' + id + '" maxlength="2000" rows="4" placeholder="What did you enjoy most?">' + E(existing ? existing.body : "") + "</textarea>" +
        '<p class="hint rv-count"></p>' +
        '<div class="btnrow" style="margin-top:8px"><button class="btn solid small" type="submit">' + (existing ? "Save changes" : "Post review") + "</button>" +
        '<button class="btn small" type="button" data-later>' + (existing ? "Cancel" : "Not now") + "</button></div>" +
        '<p class="hint">Shown with your display name in the members’ gallery once approved.' + (existing && existing.status === "approved" ? " Edits go back for a quick review." : "") + "</p>" +
        '<p class="msg" role="status"></p></form>';
      const f = el.querySelector("form"), ta = f.querySelector("textarea"), cnt = f.querySelector(".rv-count"), go = f.querySelector("[type=submit]");
      const count = () => { const n = ta.value.trim().length; cnt.textContent = n < 20 ? n + " / 2,000 characters · at least 20" : n.toLocaleString() + " / 2,000 characters"; go.disabled = n < 20; };
      ta.oninput = count; count();
      f.querySelector("[data-later]").onclick = () => { if (!existing) later.add(b.id); AB.reviewBlock(el, b, opts); };
      f.onsubmit = async (e) => {
        e.preventDefault(); go.disabled = true; say("");
        try {
          const saved = await AB.saveReview(b.id, ta.value, existing && existing.id);
          changed(saved);
          await AB.reviewBlock(el, b, opts);
          say(existing ? "Saved. Your review shows in the gallery again once it’s been checked." : "Thank you! Your review will appear in the members’ gallery once it’s been checked.", "ok");
        } catch (err) { go.disabled = false; say(err.message, "err"); }
      };
    }
  };
})();
