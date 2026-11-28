import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.resolve(process.argv[2] || path.join(root,'dist'));
const files=['index.html','bootstrap.js','app.js','preview-store.js','tasks-demo.js','agenda.js','budget.js','recettes.js','sketch-ui.css','sw.js','manifest.webmanifest','icon.svg','icon-180.png','icon-512.png'];
for (const name of files.filter(n=>/\.(html|js)$/.test(n))) {
  const source=fs.readFileSync(path.join(root,name),'utf8');
  if (/courses-famille-b9169|firebasejs|firebaseio\.com|firestore\.googleapis/.test(source)) throw new Error('Production reference in preview: '+name);
}
if (!fs.readFileSync(path.join(root,'index.html'),'utf8').includes("connect-src 'self'")) throw new Error('Missing preview network isolation');
fs.mkdirSync(target,{recursive:true});
for(const name of files) fs.copyFileSync(path.join(root,name),path.join(target,name));
console.log('Preview packaged: '+files.length+' static files. No Firebase connection.');
