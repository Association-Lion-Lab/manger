const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const INDEX_HTML=Buffer.from(readFileSync(join(__dirname,'public','index.html'),'utf8')
  .replace('<!-- MANGER_INFORMATION -->',readFileSync(join(__dirname,'public','information.html'),'utf8')));
const offlineAssets={'/sw.js':'text/javascript','/offline.html':'text/html','/manifest.webmanifest':'application/manifest+json','/icon.svg':'image/svg+xml','/apple-touch-icon.png':'image/png','/icon-180.png':'image/png','/icon-192.png':'image/png','/icon-512.png':'image/png'};
const scripts=['/ui-icons.js','/tastes.js','/food-names.js','/seasons.js','/offline-recipes.js','/offline-shopping.js'];
function publicRoutes(request,response){
  if(request.method!=='GET')return false;
  const path=new URL(request.url,'http://localhost').pathname;
  if(Object.hasOwn(offlineAssets,path)||scripts.includes(path)){
    response.writeHead(200,{'Content-Type':(offlineAssets[path]||'text/javascript')+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    response.end(readFileSync(join(__dirname,'public',path==='/apple-touch-icon.png'?'icon-180.png':path.slice(1))));return true;
  }
  if(path!=='/')return false;
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':INDEX_HTML.length,
    'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  response.end(INDEX_HTML);return true;
}
module.exports={publicRoutes};
