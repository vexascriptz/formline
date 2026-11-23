'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const port=Number(process.env.PORT||4008);
const started=Date.now();
const html=fs.readFileSync(path.join(__dirname,'dashboard.html'));
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(req.method!=='GET'){res.writeHead(405);return res.end('Method not allowed');}
 if(url.pathname==='/api/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true,service:'TikTok Pro Dashboard',uptime:Math.floor((Date.now()-started)/1000),memoryMB:Math.round(process.memoryUsage().rss/1048576),node:process.version}));}
 if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(html);}
 res.writeHead(404);res.end('Not found');
}).listen(port,'0.0.0.0',()=>console.log('Dashboard listening on '+port));
