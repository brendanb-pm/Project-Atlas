const fs=require('fs'),path=require('path'),http=require('http');
const file=path.join(__dirname,'..','..','docs','prototypes','MOS-129A-Unified-Atlas-UX.html');
const port=Number(process.argv[2]||4291);
http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(fs.readFileSync(file,'utf8'));}).listen(port,'127.0.0.1',()=>console.log('Atlas unified UX prototype: http://127.0.0.1:'+port));
