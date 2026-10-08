#!/usr/bin/env python3
"""Refresh shop-products.json from the Shopify store's public product feed.

Run by .github/workflows/update-shop.yml. The website reads shop-products.json to list
everything in the store, so new products appear on americanbasilicas.org on their own.
"""
import json, os, re, sys, urllib.request

STORE = "https://americanbasilicas.myshopify.com"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "shop-products.json")

def fetch(page):
    req = urllib.request.Request(f"{STORE}/products.json?limit=250&page={page}",
                                 headers={"User-Agent": "AmericanBasilicasSite/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["products"]

def main():
    items, page = [], 1
    while True:
        batch = fetch(page)
        if not batch: break
        items += batch; page += 1
    out = []
    for p in items:
        prices = sorted(float(v["price"]) for v in p.get("variants", []) if v.get("available", True)) or \
                 sorted(float(v["price"]) for v in p.get("variants", []))
        img = (p.get("images") or [{}])[0].get("src", "")
        kind = "poster" if "poster" in (p["handle"] + p["title"]).lower() else \
               "tumbler" if "tumbler" in (p["handle"] + p["title"]).lower() else \
               "mug" if "mug" in (p["handle"] + p["title"]).lower() else "other"
        m = re.search(r"standing over (Washington, D\.C\.|[^.]+)", re.sub(r"<[^>]+>", " ", p.get("body_html") or ""))
        out.append({"title": p["title"], "place": m.group(1).strip() if m else "", "url": f"{STORE}/products/{p['handle']}", "image": img,
                    "min": prices[0] if prices else None, "max": prices[-1] if prices else None, "kind": kind,
                    "created": p.get("created_at", "")})
    out.sort(key=lambda x: ({"poster": 0, "tumbler": 1, "mug": 2}.get(x["kind"], 3), x["title"].lower()))
    new = json.dumps(out, ensure_ascii=False, indent=1) + "\n"
    old = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    if new != old:
        open(OUT, "w", encoding="utf-8").write(new); print(f"updated: {len(out)} products")
    else:
        print("no change")

if __name__ == "__main__":
    try: main()
    except Exception as e:
        print("shop feed unavailable:", e); sys.exit(0)     # keep the last good list
