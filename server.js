'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const port=Number(process.env.PORT||4008);
const started=Date.now();
const html=fs.readFileSync(path.join(__dirname,'dashboard.html'));
const jobs=[];
const allowedOrigin=process.env.DASHBOARD_ORIGIN||'';
function send(res,code,obj,origin){const h={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(allowedOrigin&&origin===allowedOrigin){h['Access-Control-Allow-Origin']=allowedOrigin;h.Vary='Origin'}res.writeHead(code,h);res.end(JSON.stringify(obj))}
http.createServer(async(req,res)=>{
const origin=req.headers.origin||'';
const url=new URL(req.url,'http://localhost');
if(req.method==='OPTIONS'){if(allowedOrigin&&origin===allowedOrigin){res.writeHead(204,{'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Vary':'Origin'});return res.end()}res.writeHead(403);return res.end()}
if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'});return res.end(html)}
if(url.pathname.startsWith('/api/')){
if(process.env.DASHBOARD_TOKEN&&req.headers.authorization!=='Bearer '+process.env.DASHBOARD_TOKEN)return send(res,401,{error:'Unauthorized'},origin);
if(req.method==='GET'&&url.pathname==='/api/health')return send(res,200,{ok:true,uptime:Math.floor((Date.now()-started)/1000),memoryMB:Math.round(process.memoryUsage().rss/1048576),node:process.version},origin);
if(req.method==='GET'&&url.pathname==='/api/jobs')return send(res,200,{jobs:jobs.slice(-50).reverse()},origin);
if(req.method==='POST'&&url.pathname==='/api/jobs'){
let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return send(res,413,{error:'Too large'},origin)}
let input;try{input=JSON.parse(body)}catch{return send(res,400,{error:'Invalid JSON'},origin)}
let target;try{target=new URL(input.url)}catch{return send(res,400,{error:'Invalid URL'},origin)}
if(target.protocol!=='https:'||target.username||target.password||!['www.tiktok.com','tiktok.com','vm.tiktok.com','vt.tiktok.com'].includes(target.hostname.toLowerCase()))return send(res,400,{error:'Only public TikTok HTTPS links are accepted'},origin);
const job={id:require('node:crypto').randomUUID(),url:target.href,status:'validated',createdAt:new Date().toISOString(),message:'Link saved for review. No engagement automation is performed.'};jobs.push(job);if(jobs.length>200)jobs.shift();return send(res,201,{job},origin)
}
return send(res,404,{error:'Not found'},origin)
}
res.writeHead(404);res.end('Not found')
}).listen(port,'0.0.0.0',()=>console.log('Dashboard listening on '+port));
