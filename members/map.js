/* Map page: member features layered onto index.html.
   - a sign-in / "My pilgrimage" link in the header band
   - the member's own edition of the map: visited basilicas in full colour, the rest faded, ticks in the index
   - "Your visit" (check-off, date, note, photos) inside each basilica's popup
   - index.html#b=<basilica> opens that basilica directly
   Relies on the map page's globals: MARKERS, mk (d3 selection of markers), openDetail, CUR. */
(function () {
  "use strict";
  const AB = window.AB, E = AB.esc;
  if (!AB.enabled || typeof MARKERS === "undefined") return;
  const BYID = {}; MARKERS.forEach((d) => (BYID[d.ph] = d));

  // ---------- header link ----------
  const bandIn = document.querySelector("header.band .band-in");
  const acct = document.createElement("a");
  acct.className = "mb-acct"; acct.href = AB.page("account.html"); acct.textContent = "Sign in";
  bandIn.appendChild(acct);

  // ---------- legend: my-visits toggle ----------
  const legend = document.querySelector(".legend");
  const leg = document.createElement("span");
  leg.className = "legrow mb-leg"; leg.hidden = true;
  leg.innerHTML = '<span class="mb-key"><svg viewBox="0 0 100 100" width="13" height="15" aria-hidden="true"><use href="#omb" width="100" height="100"/></svg>' +
    '<svg class="faded" viewBox="0 0 100 100" width="13" height="15" aria-hidden="true"><use href="#omb" width="100" height="100"/></svg></span>' +
    '<span>Visited <em>/ not yet</em></span><button type="button" class="mb-tog" aria-pressed="true">My visits on</button>';
  legend.insertBefore(leg, legend.querySelector(".zoombtns"));
  const svgEl = document.getElementById("map");
  let mine = true;
  leg.querySelector(".mb-tog").onclick = (e) => {
    mine = !mine; e.target.setAttribute("aria-pressed", mine); e.target.textContent = mine ? "My visits on" : "My visits off";
    svgEl.classList.toggle("mine", mine && !!AB.user);
  };

  // ---------- paint visited state ----------
  async function paint() {
    const u = AB.user;
    let vs = new Map();
    if (u) { try { vs = await AB.visits(); } catch (e) { console.warn(e); } }
    mk.classed("visited", (d) => vs.has(d.ph));
    mk.filter((d) => vs.has(d.ph)).raise();                 // visited canopies sit on top of nearby faded ones
    svgEl.classList.toggle("mine", !!u && mine);
    leg.hidden = !u;
    document.querySelectorAll(".st li").forEach((li) => {
      const city = li.querySelector(".city"), nm = li.querySelector(".bname"), st = li.closest(".st").getAttribute("data-state");
      const d = MARKERS.find((m) => m.s === st && m.c === (city && city.textContent.trim()) && m.n === (nm && nm.textContent.trim()));
      li.classList.toggle("mb-done", !!(d && vs.has(d.ph)));
    });
    if (u) {
      acct.textContent = "My pilgrimage · " + vs.size + "/" + MARKERS.length;
      acct.title = "Your visits, photos and orders";
    } else { acct.textContent = "Sign in"; acct.title = "Check off the basilicas you’ve visited"; }
  }

  // ---------- "Your visit" inside the basilica popup ----------
  const body = document.querySelector("#detail .detail-body");
  const box = document.createElement("section");
  box.className = "mb-mine"; box.setAttribute("aria-label", "Your visit");
  body.appendChild(box);
  async function fill(d) {
    if (!AB.user) {
      box.innerHTML = '<h3>Been here?</h3><p>Sign in to check off ' + E(d.n) + ', keep your photos from the visit, and see members’ photos and reviews.</p>' +
        '<p class="perk">New accounts get the members’ gallery free for three months.</p>' +
        '<a class="btn solid" href="' + AB.page("account.html#b=" + d.ph) + '">Sign in or create an account</a>';
      return;
    }
    box.innerHTML = '<h3>Your visit</h3><div class="mb-vb"></div><p class="mb-gal"><a href="' + AB.page("gallery.html#b=" + d.ph) + '">Members’ photos &amp; reviews of this basilica</a>' +
      ' · <a href="' + AB.page("account.html#b=" + d.ph) + '">My pilgrimage</a></p>';
    AB.visitBlock(box.querySelector(".mb-vb"), { id: d.ph, name: d.n }, { onChange: paint });
  }
  const baseOpen = openDetail;
  openDetail = function (d) { baseOpen(d); if (AB.ready) fill(d); else box.innerHTML = ""; };   // eslint-disable-line no-global-assign

  // ---------- deep link: index.html#b=<basilica> ----------
  function fromHash() {
    const id = (location.hash.match(/[#&]b=([a-z0-9-]+)/) || [])[1];
    if (id && BYID[id]) openDetail(BYID[id]);
  }
  window.addEventListener("hashchange", fromHash);

  let first = true;
  AB.onAuth(() => {
    paint();
    if (typeof CUR !== "undefined" && CUR && !document.getElementById("detail").hidden) fill(CUR);
    if (first) { first = false; fromHash(); }
  });
})();
