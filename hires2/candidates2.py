"""Second pass: search Commons categories for each basilica, collect files (and one level of subcategories)."""
import json, os, re, time, sys
sys.path.insert(0, "hires2")
from candidates import S, get, info
T = json.load(open("hires2/terms2.json")); res = {}
def members(cat, depth=1):
    out = set(); k = get(dict(action="query", list="categorymembers", cmtitle=cat, cmtype="file|subcat", cmlimit=500))
    for m in k.get("query", {}).get("categorymembers", []):
        if m["ns"] == 6: out.add(m["title"])
        elif depth: out |= members(m["title"], depth - 1)
    return out
for slug, terms in T.items():
    titles, cats = set(), []
    for q in terms:
        j = get(dict(action="query", list="search", srsearch=q, srnamespace=14, srlimit=8))
        cats += [s["title"] for s in j.get("query", {}).get("search", [])]
        j = get(dict(action="query", list="search", srsearch=q, srnamespace=6, srlimit=50))
        titles |= {s["title"] for s in j.get("query", {}).get("search", [])}
    for c in list(dict.fromkeys(cats))[:4]: titles |= members(c)
    c = sorted(info(sorted(titles)), key=lambda x: -x["eff"])
    keep = [x for x in c if x["license_ok"] and x["eff"] >= 1900][:20]
    os.makedirs(f"hires2/cand2/{slug}", exist_ok=True)
    for n, x in enumerate(keep):
        x["n"] = n
        for a in range(4):
            try:
                d = S.get(x["thumb"], timeout=60)
                if d.status_code == 200: open(f"hires2/cand2/{slug}/{n:02d}.jpg", "wb").write(d.content); break
            except Exception: pass
            time.sleep(4 * (a + 1))
        time.sleep(0.4)
    res[slug] = dict(cats=list(dict.fromkeys(cats))[:4], candidates=keep, searched=len(titles))
    print(slug, len(titles), len(keep), list(dict.fromkeys(cats))[:4], flush=True)
json.dump(res, open("hires2/candidates2.json", "w"), indent=1)
