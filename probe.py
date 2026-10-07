import requests, json, os, re, time
S=requests.Session(); S.headers["User-Agent"]="AmericanBasilicasMap/1.0 (https://americanbasilicas.org)"
API="https://commons.wikimedia.org/w/api.php"
def q(**p):
    p.update(format="json",formatversion="2"); r=S.get(API,params=p,timeout=30); r.raise_for_status(); time.sleep(.3); return r.json()
titles=[]
for cat in ["Category:St. James Basilica (Jamestown, North Dakota)","Category:Basilica of St. James (Jamestown, North Dakota)"]:
    try: titles+= [m["title"] for m in q(action="query",list="categorymembers",cmtitle=cat,cmtype="file|subcat",cmlimit=200)["query"]["categorymembers"]]
    except Exception as e: print(cat,e)
for s in ["St. James Basilica Jamestown","Basilica of St. James Jamestown North Dakota","St. James Jamestown ND church"]:
    titles+= [h["title"] for h in q(action="query",list="search",srsearch=s,srnamespace="6|14",srlimit=50)["query"]["search"]]
subs=[t for t in titles if t.startswith("Category:")]
for c in subs:
    titles+= [m["title"] for m in q(action="query",list="categorymembers",cmtitle=c,cmtype="file",cmlimit=200)["query"]["categorymembers"]]
files=[t for t in dict.fromkeys(titles) if t.startswith("File:") and re.search(r"\.(jpe?g|png)$",t,re.I)]
os.makedirs("thumbs",exist_ok=True); out=[]
for i,f in enumerate(files[:60]):
    j=q(action="query",prop="imageinfo",titles=f,iiprop="url|extmetadata",iiurlwidth=480)
    ii=j["query"]["pages"][0].get("imageinfo",[{}])[0]; md=ii.get("extmetadata",{})
    lic=(md.get("LicenseShortName") or {}).get("value",""); nonfree=(md.get("NonFree") or {}).get("value","")
    fn=f"thumbs/{i:02d}.jpg"
    try:
        r=S.get(ii["thumburl"],timeout=60); open(fn,"wb").write(r.content); time.sleep(.5)
    except Exception as e: fn=str(e)
    out.append({"i":i,"file":f,"license":lic,"nonfree":nonfree,"thumb":fn})
json.dump({"subcats":subs,"files":out},open("result.json","w"),indent=1)
print(len(files))
