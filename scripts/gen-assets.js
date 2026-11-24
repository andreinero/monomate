const fs=require('fs');const [css,sf,outDir]=process.argv.slice(2);
const c=fs.readFileSync(css,'utf8');const map={pawn:'p',knight:'n',bishop:'b',rook:'r',queen:'q',king:'k'};
const re=/piece\.(\w+)\.(white|black)\s*\{\s*background-image:\s*url\('data:image\/svg\+xml;base64,([^']+)'\)/g;let m,out={};
while((m=re.exec(c))){out[(m[2]==='white'?'w':'b')+map[m[1]]]=Buffer.from(m[3],'base64').toString('utf8').replace('width="45" height="45"','viewBox="0 0 45 45"');}
if(Object.keys(out).length!==12)throw new Error('got '+Object.keys(out).length);
fs.mkdirSync(outDir+'/src/assets',{recursive:true});fs.mkdirSync(outDir+'/src/engine',{recursive:true});
fs.writeFileSync(outDir+'/src/assets/pieces.ts','// cburnett piece set by Colin M.L. Burnett — licensed GPLv2+/BSD/GFDL.\n// https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces\nexport const PIECE_SVG: Record<string, string> = '+JSON.stringify(out,null,1)+';\n');
console.log('ok',Object.keys(out));
