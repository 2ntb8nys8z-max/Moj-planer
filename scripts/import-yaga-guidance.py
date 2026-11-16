"""Read-only XLSX provenance import. Never writes to the workbook or existing texts."""
import datetime as dt
import hashlib
import json
from pathlib import Path
import posixpath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1])
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(source) as archive:
    strings = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        strings = [''.join(n.itertext()) for n in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    wb = ET.fromstring(archive.read('xl/workbook.xml'))
    rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
    sheets = {}
    for sheet in wb.findall('m:sheets/m:sheet', ns):
        target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        target = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        rows = []
        for row in ET.fromstring(archive.read(target)).findall('m:sheetData/m:row', ns):
            cells = {}
            for c in row.findall('m:c', ns):
                col = re.match('[A-Z]+', c.attrib['r'])[0]
                node = c.find('m:v', ns)
                value = node.text if node is not None else ''
                if c.attrib.get('t') == 's':
                    value = strings[int(value)]
                elif c.attrib.get('t') == 'inlineStr':
                    inline = c.find('m:is', ns)
                    value = ''.join(inline.itertext()) if inline is not None else ''
                cells[col] = value
            rows.append({'row': int(row.attrib['r']), 'cells': cells})
        sheets[sheet.attrib['name']] = rows
    pr = wb.find('m:workbookPr', ns)
    base = dt.date(1904, 1, 1) if pr is not None and pr.attrib.get('date1904') == '1' else dt.date(1899, 12, 30)
date = lambda c: (base + dt.timedelta(days=int(float(c['A'])))).isoformat()
calendar, chapters = {}, {}
for item in sheets['Kalendarz'][1:]:
    c = item['cells']
    if not c.get('A'):
        continue
    key = date(c)
    if key in calendar:
        raise ValueError('Duplicate calendar date: ' + key)
    calendar[key] = {'row': item['row'], 'category': c.get('M', ''), 'illustration': c.get('W', ''), 'sunrise': c.get('D', ''), 'sunset': c.get('E', ''), 'observance': c.get('C', '')}
for item in sheets['Księga Jagi'][1:]:
    if item['cells'].get('A'):
        key = date(item['cells'])
        if key in chapters:
            raise ValueError('Duplicate chapter date: ' + key)
        chapters[key] = {'row': item['row']}
if len(calendar) != 426 or sorted(calendar)[0] != '2026-11-01' or sorted(calendar)[-1] != '2027-12-31':
    raise ValueError('Unexpected calendar coverage')
seed = json.loads((root / 'data/yaga-editorial-selections.json').read_text())
cells = {(name, col + str(r['row'])): text for name, rows in sheets.items() for r in rows for col, text in r['cells'].items()}
for item in seed['excerpts']:
    if item['quote'] not in cells[(item['sheet'], item['cell'])]:
        raise ValueError('Audit excerpt differs from source: ' + item['id'])
for item in seed['storyReviewCandidates']:
    if item['text'] not in cells[('Kalendarz', item['cell'])]:
        raise ValueError('Review candidate differs from source: ' + item['cell'])
payload = {'schemaVersion': 1, 'fileName': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'author': 'Zofia Rende', 'timeZone': 'Europe/Warsaw', 'calendar': calendar, 'chapters': chapters, 'legend': {r['cells'].get('A', ''): r['cells'].get('B', '') for r in sheets['Legenda'][1:]}, **seed}
content = '// Read-only provenance import. See scripts/import-yaga-guidance.py.\n(function(root){const data=' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ";if(typeof module==='object'&&module.exports)module.exports=data;else root.OktiYagaGuidanceData=data;})(globalThis);\n"
(root / 'brief-guidance-data.js').write_text(content)
print(json.dumps({'dates': len(calendar), 'chapters': len(chapters), 'auditExcerpts': len(seed['excerpts']), 'sha256': payload['sha256']}))
