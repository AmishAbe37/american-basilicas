#!/usr/bin/env python3
"""Download one photo per basilica from Wikimedia Commons into images/.

Runs on GitHub Actions (see .github/workflows/fetch-photos.yml). For each entry in
photos/manifest.json it resolves a Commons file, keeps it only if freely licensed,
saves a compressed 960px JPEG as images/<slug>.jpg, and records the photographer,
licence and source page in images/credits.json so the map can credit each photo.
Re-runs skip photos already downloaded from the same source.
"""
import io, json, os, re, sys, time, html
import requests
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "photos", "manifest.json")
OUT = os.path.join(ROOT, "images")
CREDITS = os.path.join(OUT, "credits.json")
MISSING = os.path.join(OUT, "missing.json")
CANDIDATES = os.path.join(OUT, "candidates.json")
SOURCE_KEYS = ("file", "wiki", "category", "search", "must")
AVOID = re.compile(r"sign|logo|coat.of.arms|arms\b|map|plaque|seal|diagram|plan\b|\.svg$|\.pdf$|\.tiff?$", re.I)
PREFER = re.compile(r"exterior|front|fa[cç]ade|outside|view", re.I)
CAND_LOG = {}
WIKI_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
WIDTH = 960

S = requests.Session()
S.headers["User-Agent"] = ("AmericanBasilicasMap/1.0 (https://americanbasilicas.org; "
                           "https://github.com/AmishAbe37/american-basilicas)")


def api(url, **params):
    params.update(format="json", formatversion="2")
    for attempt in range(5):
        r = S.get(url, params=params, timeout=30)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(5 * (attempt + 1)); continue
        r.raise_for_status()
        time.sleep(0.4)
        return r.json()
    raise RuntimeError(f"API kept failing: {url} {params}")


def strip_html(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def resolve_file(entry):
    """Return a 'File:...' title for the entry, or None."""
    if "file" in entry:
        return "File:" + entry["file"].replace("_", " ")
    if "wiki" in entry:
        j = api(WIKI_API, action="query", prop="pageimages", piprop="name",
                titles=entry["wiki"], redirects=1)
        pages = j.get("query", {}).get("pages", [])
        if pages and pages[0].get("pageimage"):
            return "File:" + pages[0]["pageimage"].replace("_", " ")
        return None
    titles = []
    if "category" in entry:
        titles += category_files(entry["category"])
    if "search" in entry:
        must = [w.lower() for w in entry.get("must", [])]
        j = api(COMMONS_API, action="query", list="search", srsearch=entry["search"],
                srnamespace="6|14", srlimit=30)
        for hit in j.get("query", {}).get("search", []):
            t = hit["title"]
            if must and not all(w in t.lower() for w in must):
                continue
            titles += category_files(t) if t.startswith("Category:") else [t]
    return pick(entry["slug"], titles)


def category_files(cat):
    j = api(COMMONS_API, action="query", list="categorymembers", cmtitle=cat, cmtype="file", cmlimit=100)
    return [m["title"] for m in j.get("query", {}).get("categorymembers", [])]


def pick(slug, titles):
    """Choose the most likely exterior photo; log every candidate for review."""
    photos = [t for t in dict.fromkeys(titles) if re.search(r"\.(jpe?g|png)$", t, re.I)]
    CAND_LOG[slug] = photos
    good = [t for t in photos if not AVOID.search(t.split(":", 1)[1])]
    preferred = [t for t in good if PREFER.search(t)]
    choice = (preferred or good or [None])[0]
    print(f"      candidates={len(photos)} chose={choice}")
    return choice


def image_info(file_title):
    """Image URL + licence metadata. Uses en.wikipedia so Commons files and local files both resolve."""
    j = api(WIKI_API, action="query", prop="imageinfo", titles=file_title,
            iiprop="url|mime|extmetadata", iiurlwidth=WIDTH)
    pages = j.get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        return None
    ii = pages[0]["imageinfo"][0]
    md = ii.get("extmetadata", {})
    get = lambda k: (md.get(k) or {}).get("value", "")
    return {
        "thumb": ii.get("thumburl") or ii["url"],
        "page": ii.get("descriptionurl", ""),
        "mime": ii.get("mime", ""),
        "nonfree": str(get("NonFree")).lower() in ("true", "1", "yes"),
        "author": strip_html(get("Artist")) or strip_html(get("Credit")) or "Unknown",
        "license": strip_html(get("LicenseShortName")) or "See file page",
        "license_url": get("LicenseUrl"),
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    credits = json.load(open(CREDITS, encoding="utf-8")) if os.path.exists(CREDITS) else {}
    missing = {}
    for i, e in enumerate(manifest, 1):
        slug = e["slug"]
        source = {k: e[k] for k in SOURCE_KEYS if k in e}
        path = os.path.join(OUT, slug + ".jpg")
        if os.path.exists(path) and credits.get(slug, {}).get("source") == source:
            print(f"[{i:2}/{len(manifest)}] keep  {slug}"); continue
        try:
            ftitle = resolve_file(e)
            if not ftitle:
                missing[slug] = "no photo found for this source"; print(f"[{i:2}] MISS  {slug}"); continue
            info = image_info(ftitle)
            if not info:
                missing[slug] = f"no image info for {ftitle}"; print(f"[{i:2}] MISS  {slug}"); continue
            if info["nonfree"]:
                missing[slug] = f"{ftitle} is not freely licensed"; print(f"[{i:2}] SKIP  {slug} (non-free)"); continue
            r = S.get(info["thumb"], timeout=60)
            for attempt in range(4):
                if r.status_code != 429: break
                time.sleep(10 * (attempt + 1)); r = S.get(info["thumb"], timeout=60)
            r.raise_for_status()
            im = Image.open(io.BytesIO(r.content))
            im = im.convert("RGB")
            if im.width > WIDTH:
                im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
            im.save(path, "JPEG", quality=80, optimize=True, progressive=True)
            credits[slug] = {"source": source, "file": ftitle, "page": info["page"],
                             "author": info["author"][:200], "license": info["license"],
                             "license_url": info["license_url"], "w": im.width, "h": im.height}
            print(f"[{i:2}/{len(manifest)}] saved {slug}  ({os.path.getsize(path)//1024} KB, {info['license']})")
            time.sleep(1.0)
        except Exception as ex:
            missing[slug] = f"error: {ex}"[:300]; print(f"[{i:2}] ERROR {slug}: {ex}")
    json.dump(credits, open(CREDITS, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    json.dump(missing, open(MISSING, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    json.dump(CAND_LOG, open(CANDIDATES, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
    print(f"\nDone: {len(credits)} photos, {len(missing)} missing.")
    if len(credits) == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
