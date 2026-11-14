"""Build ordinary calendar data, independently of the optional astrology view.

Usage: python scripts/import-calendar-data.py SOURCE_DIRECTORY
The directory contains unesco.txt, onz.txt and pl2026.txt/pl2027.txt downloaded
from the URLs retained in the generated provenance. No runtime scraping occurs.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
urls = {
    "unesco": "https://www.unesco.pl/dni-tygodnie-unesco/",
    "onz": "https://www.unesco.pl/dni-tygodnie-onz/",
    "who": "https://www.who.int/campaigns/world-diabetes-day",
}
months = "stycznia lutego marca kwietnia maja czerwca lipca sierpnia września października listopada grudnia".split()

class Text(HTMLParser):
    def __init__(self, value):
        super().__init__(); self.parts = []; self.feed(value)
    def handle_data(self, value):
        self.parts.append(value)
    def text(self):
        return re.sub(r"\s+", " ", " ".join(self.parts)).strip()

fixed = []
moving_names = {"Międzynarodowy Dzień Dziewcząt w ICT", "Światowy Dzień Morski", "Międzynarodowy Dzień Spółdzielczości"}
for key in ["unesco", "onz"]:
    html = (source / (key + ".txt")).read_text()
    table = re.search(r"<table\b[^>]*>(.*?)</table>", html, re.S).group(1)
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", table, re.S):
        cells = [Text(c).text() for c in re.findall(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", row, re.S)]
        if len(cells) < 2: continue
        date, name = cells[:2]
        name = re.sub(r"\s*\((?:UNESCO|ONZ|WHO)\)$", "", name)
        match = re.fullmatch(r"(\d{1,2}) (" + "|".join(months) + r")", date)
        if not match or name in moving_names: continue
        fixed.append({"day": f"{months.index(match[2])+1:02d}-{int(match[1]):02d}", "name": name, "source": urls[key]})
fixed.append({"day": "11-14", "name": "Światowy Dzień Cukrzycy", "source": urls["who"]})
rules = [
    [11, 4, 1, "Międzynarodowy Dzień Przeciwdziałania Przemocy i Znęcaniu się w Szkole, w tym Cyberprzemocy", urls["unesco"]],
    [11, 4, 3, "Światowy Dzień Filozofii", urls["unesco"]],
    [10, 1, 1, "Światowy Dzień Ludzkich Siedlisk", urls["onz"]],
    [4, 4, 4, "Międzynarodowy Dzień Dziewcząt w ICT", "https://www.itu.int/women-and-girls/girls-in-ict/about-international-girls-in-ict-day/"],
    [9, 4, -1, "Światowy Dzień Morski", "https://www.imo.org/en/about/events/pages/world-maritime-theme-2026-2027.aspx"],
    [7, 6, 1, "Międzynarodowy Dzień Spółdzielczości", "https://www.un.org/en/node/95054"],
]
code = (root / "brief-inspiration-data.js").read_text()
original = json.loads(code.split("const data=", 1)[1].split(";if(typeof", 1)[0])
namedays = {row[0][5:]: row[5]["sourceText"]["namedays"] for row in original["days"] if row[0].startswith("2027-")}
dated = {}
for row in original["days"]:
    labels = [s.strip() for s in row[5]["sourceText"]["holiday"].split(" · ") if s.strip() and not re.search(r"przesilenie|równonoc|zaćmienie", s, re.I)]
    if labels: dated[row[0]] = labels
public = {}
for year in [2026, 2027]:
    for item in json.loads((source / f"pl{year}.txt").read_text()):
        if item["global"] and "Public" in item["types"]:
            public.setdefault(item["date"], []).append(item["localName"])
assert len(namedays) == 365
payload = {"asOf": "2026-11-14", "namedays": namedays, "dated": dated, "public": public, "fixed": fixed, "rules": rules, "sources": {**urls, "public": "https://date.nager.at/", "calendar": "Materiały kalendarzowe Zofii Rende", "calendarSha256": original["sourceFileSha256"]}}
out = "// Ordinary calendar data. Provenance: scripts/import-calendar-data.py.\n(function(root){const data=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";if(typeof module==='object'&&module.exports)module.exports=data;else root.OktiCalendarData=data;})(globalThis);\n"
(root / "brief-calendar-data.js").write_text(out)
print(f"Calendar: {len(namedays)} nameday dates, {len(dated)} dated calendar entries, {len(public)} public-holiday dates, {len(fixed)} fixed observances and {len(rules)} movable rules.")
