/* Map page: load the member features only once accounts are switched on in members/config.js,
   so visitors to the plain map never download them. */
(function () {
  var C = window.AB_CONFIG || {};
  if (!C.supabaseUrl || !C.supabaseAnonKey) return;
  var base = document.currentScript.src.replace(/loader\.js.*$/, "");
  ["blocks.css", "map.css"].forEach(function (f) {
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = base + f; document.head.appendChild(l);
  });
  var js = ["vendor/supabase-2.117.3.js", "core.js", "shell.js", "visit.js", "map.js"], i = 0;
  (function next() {
    if (i >= js.length) return;
    var s = document.createElement("script"); s.src = base + js[i++]; s.onload = next;
    s.onerror = function () { console.warn("member features unavailable:", s.src); };
    document.body.appendChild(s);
  })();
})();
