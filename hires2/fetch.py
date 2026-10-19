"""Download the chosen full-size originals to hires2/full/<slug>.jpg and write hires2/credits2.json."""
import json, os, time, requests
S = requests.Session(); S.headers["User-Agent"] = "AmericanBasilicasMap/1.0 (https://americanbasilicas.org)"
C = json.load(open("hires2/choices.json")); cred = {}
os.makedirs("hires2/full", exist_ok=True)
for slug, x in C.items():
    out = f"hires2/full/{slug}.jpg"
    if not os.path.exists(out):
        for a in range(6):
            try:
                d = S.get(x["url"], timeout=180)
                if d.status_code == 200: open(out, "wb").write(d.content); break
            except Exception: pass
            time.sleep(8 * (a + 1))
        time.sleep(1)
    cred[slug] = dict(author=x["author"], file=x["file"], license=x["license"], license_url=x["license_url"],
                      page=x["page"], w=x["w"], h=x["h"])
    print(slug, os.path.getsize(out) // 1024 if os.path.exists(out) else "FAILED", flush=True)
json.dump(cred, open("hires2/credits2.json", "w"), indent=1)
