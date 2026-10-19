"""Find larger Wikimedia Commons photos for basilicas whose current photo is too small for a 12 in shirt print.
Writes hires2/candidates.json and a 640 px preview of each candidate to hires2/cand/<slug>/NN.jpg for review."""
import json, os, re, time, requests
S = requests.Session(); S.headers["User-Agent"] = "AmericanBasilicasMap/1.0 (https://americanbasilicas.org)"
API = "https://commons.wikimedia.org/w/api.php"
OK_LIC = re.compile(r"^(CC0|CC BY(-SA)? [\d.]+|Public domain|PD.*)$", re.I)
ASPECT = 1.25            # back photo panel is 12 x 9.6 in

def get(params):
    params = dict(params, format="json", formatversion="2")
    for a in range(5):
        try:
            r = S.get(API, params=params, timeout=40)
            if r.status_code == 200: return r.json()
        except Exception: pass
        time.sleep(4 * (a + 1))
    return {}

def strip(h): return re.sub(r"<[^>]+>", "", h or "").strip()

def info(titles):
    out = []
    for i in range(0, len(titles), 40):
        j = get(dict(action="query", titles="|".join(titles[i:i + 40]), prop="imageinfo",
                     iiprop="url|size|mime|extmetadata", iiurlwidth=640))
        for p in j.get("query", {}).get("pages", []):
            ii = (p.get("imageinfo") or [None])[0]
            if not ii or ii.get("mime") != "image/jpeg": continue
            em = ii.get("extmetadata", {})
            lic = strip(em.get("LicenseShortName", {}).get("value"))
            w, h = ii["width"], ii["height"]
            out.append(dict(file=p["title"], w=w, h=h, eff=round(min(w, h * ASPECT)), license=lic,
                            license_ok=bool(OK_LIC.match(lic)), license_url=em.get("LicenseUrl", {}).get("value", ""),
                            author=strip(em.get("Artist", {}).get("value"))[:120], url=ii["url"], thumb=ii.get("thumburl"),
                            page=ii.get("descriptionurl")))
    return out

T = json.load(open("hires2/targets.json")); res = {}
for t in T:
    titles = set([t["current"]])
    for q in (f'{t["name"]} {t["city"]}', f'{t["name"]} {t["state"]}', f'{t["city"]} {t["name"].split("(")[0]}'):
        j = get(dict(action="query", list="search", srsearch=q, srnamespace=6, srlimit=50))
        titles |= {s["title"] for s in j.get("query", {}).get("search", [])}
    # every file in the categories of the current photo
    j = get(dict(action="query", titles=t["current"], prop="categories", clshow="!hidden", cllimit=50))
    for p in j.get("query", {}).get("pages", []):
        for c in p.get("categories", [])[:6]:
            k = get(dict(action="query", list="categorymembers", cmtitle=c["title"], cmtype="file", cmlimit=200))
            titles |= {m["title"] for m in k.get("query", {}).get("categorymembers", [])}
    c = [x for x in info(sorted(titles)) if x["license_ok"]]
    cur = next((x for x in c if x["file"] == t["current"]), None)
    c.sort(key=lambda x: -x["eff"])
    keep = [x for x in c if x["eff"] >= 2400][:12]
    os.makedirs(f"hires2/cand/{t['slug']}", exist_ok=True)
    for n, x in enumerate(keep):
        x["n"] = n
        for a in range(4):
            try:
                d = S.get(x["thumb"], timeout=60)
                if d.status_code == 200:
                    open(f"hires2/cand/{t['slug']}/{n:02d}.jpg", "wb").write(d.content); break
            except Exception: pass
            time.sleep(4 * (a + 1))
        time.sleep(0.5)
    res[t["slug"]] = dict(num=t["num"], name=t["name"], current=cur, candidates=keep, searched=len(titles))
    print(t["num"], t["slug"], len(titles), len(keep), keep[0]["eff"] if keep else "-", flush=True)
json.dump(res, open("hires2/candidates.json", "w"), indent=1)
