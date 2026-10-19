"""Pull Printful catalog specs (public endpoints) for the postcard and the AS Colour 5082 tee."""
import json, os, re, requests
S = requests.Session(); S.headers["User-Agent"] = "AmericanBasilicasMap/1.0"
out = {}
def get(u):
    try:
        r = S.get(u, timeout=60); print(u, r.status_code, flush=True)
        return r.json() if r.headers.get("content-type", "").startswith("application/json") else {"_status": r.status_code, "_text": r.text[:500]}
    except Exception as e:
        return {"_error": str(e)}
prods = get("https://api.printful.com/products")
items = prods.get("result", []) if isinstance(prods, dict) else []
hits = [p for p in items if re.search(r"postcard|5082|faded", json.dumps({k: p.get(k) for k in ("title", "model", "type_name", "brand")}), re.I)]
out["matches"] = [{k: p.get(k) for k in ("id", "title", "model", "type_name", "brand", "techniques", "files")} for p in hits]
for p in hits:
    pid = p["id"]
    out[f"v1_{pid}"] = get(f"https://api.printful.com/products/{pid}")
    for path in (f"catalog-products/{pid}", f"catalog-products/{pid}/mockup-templates", f"catalog-products/{pid}/mockup-styles"):
        out[f"v2_{path}"] = get(f"https://api.printful.com/v2/{path}")
os.makedirs("printful", exist_ok=True)
json.dump(out, open("printful/specs.json", "w"), indent=1)
