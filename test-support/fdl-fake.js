const {createServer}=require('node:http');
function projection(patch={}){
  return {id:12,version:1,visibility:'public',title:'Soupe FDL',minutes:25,servings:2,diet:'vegan',tags:['Soupes'],seasons:['hiver'],
    ingredients:[{name:'carotte',amount:300,unit:'g',preparation:'raw'}],steps:[{kind:'cook',instruction:'Cuire puis mixer.',minutes:20}],
    author:'Auteur de test',provenance:'original',licence:'CC-BY-SA-4.0',url:'https://fdl.example/recette?id=12',...patch};
}
async function startFakeFdl(){
  const fake={mode:'normal',calls:[],recipes:new Map(),states:{},token:'test-token'};
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');fake.calls.push({path:url.pathname,query:url.search});
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(url.pathname==='/oauth/autoriser'){
      const target=new URL(url.searchParams.get('redirect_uri'));target.search=new URLSearchParams({state:url.searchParams.get('state'),code:'fake-authorization-code'});
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<html lang="fr"><title>FDL de test</title><a href="${target.href.replaceAll('&','&amp;')}">Autoriser le foyer de test</a></html>`);
    }
    if(fake.mode==='redirect'){res.writeHead(302,{location:'http://127.0.0.1:1/no-token'});return res.end();}
    if(fake.mode==='secret-error')return send(500,{error:{message:fake.token}});
    if(fake.mode==='unauthorized')return send(401,{error:{code:'unauthorized'}});
    if(url.pathname==='/oauth/jeton'){
      let body='';for await(const chunk of req)body+=chunk;
      const params=new URLSearchParams(body);fake.lastExchange=Object.fromEntries(params);
      return send(200,{access_token:fake.token,token_type:'Bearer'});
    }
    if(req.headers.authorization!=='Bearer '+fake.token)return send(401,{error:{code:'unauthorized'}});
    if(url.pathname==='/api/v1/recette'){
      const id=url.searchParams.get('id');if(fake.states[id]?.state==='removed')return send(410,{error:{code:'removed'}});
      const value=fake.recipes.get(id);return value?send(200,value):send(404,{error:{code:'not_found'}});
    }
    if(url.pathname==='/api/v1/etat')return send(200,Object.fromEntries((url.searchParams.get('ids')||'').split(',').map(id=>[id,fake.states[id]||{state:'published',version:fake.recipes.get(id)?.version||1}])));
    if(url.pathname==='/api/v1/mes-recettes')return send(200,{items:[...fake.recipes.values()].map(r=>({id:r.id,title:r.title,state:'published',version:r.version}))});
    if(url.pathname==='/api/v1/recettes')return send(200,{items:[...fake.recipes.values()].map(r=>({id:r.id,title:r.title,minutes:r.minutes,diet:r.diet,author:r.author})),next:null});
    send(404,{error:{code:'not_found'}});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));fake.url=`http://127.0.0.1:${server.address().port}`;
  fake.recipes.set('12',projection({url:fake.url+'/recette?id=12'}));
  fake.close=()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});return fake;
}
module.exports={startFakeFdl,projection};
