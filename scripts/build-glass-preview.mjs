// Stage the approved-design trial separately from the live app and Preview33.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const destination=process.argv[2];
if(!destination||fs.existsSync(destination))throw Error('Provide a new, empty output path.');
fs.cpSync('preview33',destination,{recursive:true});
const page=path.join(destination,'index.html');
let html=fs.readFileSync(page,'utf8');
html=html.replace("const PREVIEW33_PREFIX='planner-preview-33:';","const PREVIEW33_PREFIX='planner-glass-33-170:';");
html=html.replace('Pełny Planer generowany automatycznie z kanonicznego frontendu gałęzi integration/conversation33.','Osobny podgląd szklanych baniek 33.179, przygotowany z gałęzi work/glass-bubbles-33-170.');
fs.writeFileSync(page,html);
const release=JSON.parse(fs.readFileSync(path.join(destination,'release.json'),'utf8'));
release.source='work/glass-bubbles-33-170/index.html';
release.frontendBuildId=createHash('sha256').update(html).digest('hex').slice(0,16);
fs.writeFileSync(path.join(destination,'release.json'),JSON.stringify(release,null,2)+'\n');
console.log(`Staged isolated ${release.version}: ${destination}`);

