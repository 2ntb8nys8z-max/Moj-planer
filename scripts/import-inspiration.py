"""Read an authorised Kalendarz XLSX and export only daily inspiration inputs.

Usage: python3 scripts/import-inspiration.py source.xlsx [output.js]
No workbook is modified. No herbal, medical, financial or contractual advice is copied.
"""
import datetime as dt
import hashlib
import json
import posixpath
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

source = Path(sys.argv[1])
output = Path(sys.argv[2] if len(sys.argv) > 2 else "brief-inspiration-data.js")
ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
themes = {
    "dobry dzień na twórczość": "creative", "dobry dzień na porządki": "organize",
    "dobry dzień na rozmowy o związku": "relationships", "dobry dzień na szczere rozmowy": "honesty",
    "dobry dzień na podróże": "travel", "dobry dzień na pracę": "work",
    "dobry dzień na spotkania z przyjaciółmi": "social", "dobry dzień na odpoczynek": "rest",
    "dobry dzień na nowe początki": "start", "dobry dzień na finanse": "finances",
    "dobry dzień na rozmowy": "conversation", "dobry dzień na dom": "home",
}
with zipfile.ZipFile(source) as archive:
    strings = []
    if "xl/sharedStrings.xml" in archive.namelist():
        strings = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", ns)]
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheet = next(s for s in workbook.findall("m:sheets/m:sheet", ns) if s.attrib["name"] == "Kalendarz")
    rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    target = next(r.attrib["Target"] for r in relationships if r.attrib["Id"] == rel_id)
    target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
    raw = []
    for row in ET.fromstring(archive.read(target)).findall("m:sheetData/m:row", ns):
        record = {}
        for cell in row.findall("m:c", ns):
            col = "".join(c for c in cell.attrib["r"] if c.isalpha())
            node = cell.find("m:v", ns)
            value = node.text if node is not None else None
            if cell.attrib.get("t") == "s" and value is not None:
                value = strings[int(value)]
            elif cell.attrib.get("t") == "inlineStr":
                inline = cell.find("m:is", ns)
                value = "".join(inline.itertext()) if inline is not None else None
            record[col] = value
        raw.append(record)
    header = raw[0]
    expected = {"A": "Data", "F": "Księżyc (faza)", "X": "Księżyc w znaku i dzień biodynamiczny", "Y": "Dobry dzień na…", "Z": "Energia dnia (niebo dnia)"}
    if any(header.get(col) != label for col, label in expected.items()):
        raise ValueError("Nieznany układ kolumn inspiracji.")
    calendar = workbook.find("m:workbookPr", ns)
    base = dt.date(1904, 1, 1) if calendar is not None and calendar.attrib.get("date1904") == "1" else dt.date(1899, 12, 30)
    days = []
    for record in raw[1:]:
        if not record.get("A"):
            continue
        date = base + dt.timedelta(days=int(float(record["A"])))
        theme = themes[record["Y"]]
        positive = (record.get("Z") or "").split("Dobry dzień na ")[-1].split(". Unikaj")[0]
        relax = theme == "rest" or any(word in positive for word in ["masaż", "medytacj", "kąpiel"])
        # Keep the Moon statement; omit all-day retrograde flags and bodily correspondences.
        moon = (record.get("X") or "").split(" · ")[0]
        phase = (record.get("F") or "").split(" o ")[0]
        days.append([date.isoformat(), theme, moon, phase, relax])
if len({row[0] for row in days}) != len(days) or any((dt.date.fromisoformat(b[0])-dt.date.fromisoformat(a[0])).days != 1 for a,b in zip(days,days[1:])):
    raise ValueError("Nieciągłe lub powtórzone daty inspiracji.")
payload = {"schemaVersion": 1, "source": "Kalendarz Jagi — Czaromarownik", "author": "Zofia Rende", "interpretation": "astrology", "sourceTimeZone": "Europe/Warsaw", "sourceFileSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "from": days[0][0], "to": days[-1][0], "days": days}
content = "// Imported symbolic inspiration inputs. See scripts/import-inspiration.py.\n(function(root){const data=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";if(typeof module==='object'&&module.exports)module.exports=data;else root.OktiInspirationData=data;})(globalThis);\n"
output.write_text(content, encoding="utf-8")
print(f"Imported {len(days)} days: {days[0][0]}–{days[-1][0]}")
