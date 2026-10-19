import requests, json, os
S = requests.Session(); S.headers["User-Agent"] = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"
os.makedirs("printful/pages", exist_ok=True)
for name, u in [("postcard", "https://www.printful.com/custom/stationery/postcards/standard-postcard"),
                ("academy", "https://www.printful.com/academy/lessons/how-to-sell-postcards"),
                ("tee5082", "https://www.printful.com/custom/collections/style-trends/oversized-faded-t-shirt-ascolour-5082")]:
    r = S.get(u, timeout=60); open(f"printful/pages/{name}.html", "w").write(r.text); print(name, r.status_code, len(r.text))
for q in ("postcard", "postcard back", "5082"):
    r = S.get("https://help.printful.com/api/v2/help_center/articles/search.json", params={"query": q, "per_page": 15}, timeout=60)
    open(f"printful/pages/help-{q.replace(' ', '_')}.json", "w").write(r.text); print(q, r.status_code)
