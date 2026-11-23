// Read-only Daki runtime compatibility probe. Prints metadata ONLY: never source or secrets.
const key = process.env.DAKI_API_KEY;
const base = 'https://portal.daki.cc';
const id = 'ffe0e9f7';
if (!key || key.length < 20) throw Error('DAKI_API_KEY secret missing.');
const auth = {
  Authorization:'Bearer '+key,
  Accept:'text/plain',
  'User-Agent':'Formline-Read-Only-Bot-Probe/1.0',
};
async function readFile(name) {
  const url = base+'/api/client/servers/'+id+'/files/contents?file='+encodeURIComponent('/'+name);
  const r = await fetch(url, {headers:auth,redirect:'error',signal:AbortSignal.timeout(15000)});
  if (!r.ok) throw Error('Cannot read '+name+': HTTP '+r.status);
  const s = await r.text();
  if (s.length > 200000) throw Error('Unexpectedly large bot file: '+name);
  return s;
}
const pkg = JSON.parse(await readFile('package.json'));
const code = await readFile('index.js');
const deps = {...pkg.dependencies,...pkg.devDependencies};
const isCjs = /\brequire\s*\(\s*['"]discord\.js['"]\s*\)/.test(code);
const isEsm = /\bfrom\s*['"]discord\.js['"]/.test(code);
const discord = Object.prototype.hasOwnProperty.call(deps,'discord.js');
const clientSymbols=[...code.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(?:discord\.)?Client\s*\(/g)].map(m=>m[1]);
const loginSymbols=[...code.matchAll(/\b([A-Za-z_$][\w$]*)\.login\s*\(/g)].map(m=>m[1]);
const clientSymbol=clientSymbols.find(x=>loginSymbols.includes(x))||null;
const meta={
  type:pkg.type||'commonjs',
  discordJsDependency:discord,
  discordJsVersion:discord?String(deps['discord.js']).replace(/[^.0-9^~v=<>* -]/g,'').slice(0,40):null,
  indexFormat:isCjs?'commonjs':isEsm?'esm':'unrecognized',
  loginCallFound:loginSymbols.length>0,
  standardClientVariable:clientSymbol,
  alreadyHasGuard:code.includes('pip-nickname-guard'),
};
console.log('DAKI READ-ONLY BOT COMPATIBILITY PROBE');
console.log(JSON.stringify(meta));
console.log('No source code, keys, files or server state were changed or printed.');
