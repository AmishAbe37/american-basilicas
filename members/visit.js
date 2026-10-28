/* The "my visit" block: check-off, date, private note and photos for one basilica.
   Used in the map's basilica popup and on the account page. */
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
      '<div class="grid-ph" data-grid></div></div><p class="msg" role="status"></p>';
    const msg = el.querySelector(".msg"), say = (t, c) => { msg.className = "msg " + (c || ""); msg.textContent = t || ""; };
    const date = el.querySelector('input[type=date]'), note = el.querySelector("textarea"), grid = el.querySelector("[data-grid]");

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

    async function drawPhotos() {
      let ps;
      try { ps = await AB.myPhotos(b.id); } catch (e) { grid.innerHTML = '<p class="msg err">' + E(e.message) + "</p>"; return; }
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
})();
