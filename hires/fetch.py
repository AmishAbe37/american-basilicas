import json, os, time, requests
S=requests.Session(); S.headers["User-Agent"]="AmericanBasilicasMap/1.0 (https://americanbasilicas.org)"
c=json.load(open("hires/credits.json"))
for slug,v in sorted(c.items()):
    out=f"hires/{slug}.jpg"
    if os.path.exists(out): continue
    for attempt in range(4):
        r=S.get("https://en.wikipedia.org/w/api.php",params=dict(action="query",prop="imageinfo",titles=v["file"],iiprop="url|size",iiurlwidth=2400,format="json",formatversion="2"),timeout=30)
        if r.status_code==200: break
        time.sleep(5*(attempt+1))
    ii=r.json()["query"]["pages"][0]["imageinfo"][0]
    url=ii.get("thumburl") if ii.get("width",0)>2400 else ii["url"]
    for attempt in range(5):
        d=S.get(url,timeout=120)
        if d.status_code==200: break
        time.sleep(8*(attempt+1))
    d.raise_for_status(); open(out,"wb").write(d.content); print(slug, ii.get("width"), len(d.content)//1024,"KB"); time.sleep(1)
