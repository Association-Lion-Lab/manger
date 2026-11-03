const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {readRecipeBody}=require('./recipe-http');
const {fdlId,checkedProjection,unavailable}=require('./fdl');
const {origin,remoteId,version}=require('./fdl-format');
const fail=(status,message)=>Object.assign(new Error(message),{status,code:'MANGER_FDL_INPUT'});
const random=()=>randomBytes(32).toString('base64url');
const hash=value=>createHash('sha256').update(value).digest();
function fdlRoutes({store,auth,base,client,sendJson,secure=false,now=Date.now,onLinked=()=>{}}){
  const pending=new Map();let generation=0,closed=false,management=Promise.resolve();
  const manage=work=>{const task=management.then(work);management=task.catch(()=>{});return task;};
  const authorize=user=>tx=>auth.authorizeRestore(tx,user);
  const flowCookie=(res,value,age)=>res.setHeader('Set-Cookie',`manger_fdl_flow=${value}; Path=/api/fdl/retour; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);
  const currentLink=async()=>{const link=await store.link();if(!link||link.origin!==base)throw fail(409,'Relie un compte FDL depuis Compte pour continuer.');return link;};
  async function start(req,res,user){
    const clientOrigin=origin(`${secure?'https':'http'}://${req.headers.host}`);
    if(!clientOrigin)throw fail(400,'Adresse de cette instance invalide.');
    for(const [state,flow] of pending)if(flow.expires<=now())pending.delete(state);
    if(pending.size>=20)pending.delete(pending.keys().next().value);
    const state=random(),verifier=random(),nonce=random();
    pending.set(state,{verifier,nonceHash:hash(nonce),clientOrigin,user,expires:now()+600000,generation});
    const url=new URL(base+'/oauth/autoriser');
    url.search=new URLSearchParams({response_type:'code',client_id:clientOrigin,redirect_uri:clientOrigin+'/api/fdl/retour',state,code_challenge:hash(verifier).toString('base64url'),code_challenge_method:'S256'});
    flowCookie(res,nonce,600);sendJson(res,200,{url:url.href});
  }
  function callbackPage(res,status){
    res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    const message=status===200?'Compte FDL relié.':status===502?'FDL ne répond pas. Réessaie plus tard depuis Compte.':'La liaison avec FDL n’a pas abouti. Recommence depuis Compte.';
    res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${status===200?'<meta http-equiv="refresh" content="0;url=/">':''}<title>Liaison FDL</title><p>${message}</p><a href="/">Revenir à Manger!</a></html>`);
  }
  async function callback(req,res){
    try{
      const query=new URL(req.url,'http://localhost').searchParams,state=query.get('state'),flow=pending.get(state);
      const nonce=/(?:^|;\s*)manger_fdl_flow=([A-Za-z0-9_-]{43})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
      if(!flow||flow.expires<=now()||query.getAll('state').length!==1||!nonce||!timingSafeEqual(hash(nonce),flow.nonceHash)){
        if(flow?.expires<=now())pending.delete(state);return callbackPage(res,400);
      }
      pending.delete(state);flowCookie(res,'',0);
      if(query.has('error')||query.getAll('code').length!==1||!query.get('code')||query.get('code').length>500||flow.generation!==generation||closed)return callbackPage(res,400);
      const owner=await auth.session(flow.user.token);
      if(!owner?.admin||owner.id!==flow.user.id)return callbackPage(res,400);
      const token=await client.token(query.get('code'),flow.clientOrigin,flow.clientOrigin+'/api/fdl/retour',flow.verifier);
      if(flow.generation!==generation||closed)return callbackPage(res,400);
      const linked=await manage(async()=>{
        if(flow.generation!==generation||closed)return false;
        await store.setLink({origin:base,clientOrigin:flow.clientOrigin,token},{authorize:authorize(flow.user)});
        generation++;pending.clear();return true;
      });
      if(!linked)return callbackPage(res,400);
      callbackPage(res,200);
      Promise.resolve().then(onLinked).catch(()=>{});
    }catch(error){callbackPage(res,error.status===502?502:400);}
  }
  async function state(res){
    const link=await store.link(),copies=await store.copies();
    sendJson(res,200,{linked:Boolean(link&&link.origin===base),
      updates:copies.filter(c=>c.origin===base&&!c.removed&&c.availableVersion).map(({recipeId,title,version,availableVersion,modified})=>({recipeId,title,version,availableVersion,modified})),notices:await store.notices()});
  }
  async function search(url,res,link){
    const mine=url.pathname.endsWith('/mes-recettes'),params=new URLSearchParams();
    for(const key of ['q','duree','regime','univers','saison','apres','limite'])if(url.searchParams.has(key)){
      const value=url.searchParams.get(key);if(value.length>1000)throw fail(400,'Filtre FDL trop long.');params.set(key,value);
    }
    const value=await client.get('/api/v1/'+(mine?'mes-recettes':'recettes')+'?'+params,link.token);
    if(!value||!Array.isArray(value.items)||value.items.length>10000)throw unavailable();
    const copies=await store.copies();
    const items=value.items.map(item=>{
      if(!item||!remoteId(String(item.id))||typeof item.title!=='string'||item.title.length>120)throw unavailable();
      const clean={id:item.id,title:item.title,imported:copies.find(c=>c.origin===base&&c.fdlId===String(item.id))?.recipeId??null};
      if(mine){
        if(!['published','private'].includes(item.state)||!version(item.version))throw unavailable();
        Object.assign(clean,{state:item.state,version:item.version});
      }else{
        if(!Number.isInteger(item.minutes)||item.minutes<1||item.minutes>1440||!['vegan','vegetarian','pescetarian','omnivore'].includes(item.diet)||(item.author!==null&&typeof item.author!=='string'))throw unavailable();
        Object.assign(clean,{minutes:item.minutes,diet:item.diet,author:item.author});
      }
      return clean;
    });
    sendJson(res,200,{items,...(!mine?{next:typeof value.next==='string'?value.next:null}:{})});
  }
  async function importRecipe(req,res,link){
    const input=await readRecipeBody(req),id=fdlId(input?.lien,base);if(!id)throw fail(400,'Lien ou identifiant FDL invalide.');
    const projection=await client.get('/api/v1/recette?'+new URLSearchParams({id}),link.token);
    const value=checkedProjection(projection,base,id),result=await store.importCopy(value.recipe,value.source,link);
    if(result==='already-imported'){
      const copy=(await store.copies()).find(c=>c.origin===base&&c.fdlId===id);
      return sendJson(res,409,{error:'Recette déjà importée.',recipeId:copy?.recipeId});
    }
    sendJson(res,201,result);
  }
  async function update(req,res,link){
    const input=await readRecipeBody(req),id=input?.recipeId;
    if(!Number.isSafeInteger(id))throw fail(400,'Identifiant de recette invalide.');
    const copy=(await store.copies()).find(c=>c.recipeId===id&&c.origin===base&&!c.removed);
    if(!copy?.availableVersion)throw fail(404,'Aucune mise à jour proposée.');
    let projection;
    try{projection=await client.get('/api/v1/recette?'+new URLSearchParams({id:copy.fdlId}),link.token);}
    catch(error){if(error.status===410)await store.applyStates(link,[{recipeId:id,state:'removed'}]);throw error;}
    const value=checkedProjection(projection,base,copy.fdlId),saved=await store.applyUpdate(id,value.recipe,value.source.version,value.source.metadata,link);
    if(typeof saved==='string')throw fail(409,'Cette copie a changé. Recharge les recettes.');
    sendJson(res,200,saved);
  }
  async function handle(req,res,context){
    const url=new URL(req.url,'http://localhost'),path=url.pathname;if(!path.startsWith('/api/fdl/'))return false;
    let link;
    try{
      if(path==='/api/fdl/relier'&&req.method==='POST'){
        if(!context?.user?.admin)throw fail(403,'Cette action est réservée à l’administrateur.');await start(req,res,context.user);
      }else if(path==='/api/fdl/lien'&&req.method==='DELETE'){
        if(!context?.user?.admin)throw fail(403,'Cette action est réservée à l’administrateur.');
        await manage(async()=>{await store.clearLink(null,{authorize:authorize(context.user)});generation++;pending.clear();});sendJson(res,200,{});
      }else if(path==='/api/fdl/etat'&&req.method==='GET')await state(res);
      else if(['/api/fdl/recettes','/api/fdl/mes-recettes'].includes(path)&&req.method==='GET'){link=await currentLink();await search(url,res,link);}
      else if(path==='/api/fdl/import'&&req.method==='POST'){link=await currentLink();await importRecipe(req,res,link);}
      else if(path==='/api/fdl/mettre-a-jour'&&req.method==='POST'){link=await currentLink();await update(req,res,link);}
      else if(path==='/api/fdl/ignorer'&&req.method==='POST'){
        await currentLink();const input=await readRecipeBody(req);if(!Number.isSafeInteger(input?.recipeId))throw fail(400,'Identifiant invalide.');await store.skipUpdate(input.recipeId);sendJson(res,200,{});
      }else if(path==='/api/fdl/avis/vu'&&req.method==='POST'){await store.clearNotices();sendJson(res,200,{});}
      else sendJson(res,404,{error:'Route FDL inconnue.'});
    }catch(error){
      if(error.status===401){if(link)await store.clearLink(link.token);sendJson(res,409,{error:'La liaison FDL a été retirée. Relie à nouveau le compte depuis Compte.'});}
      else{
        const status=error.code==='MANGER_RECIPE_INPUT'?400:([400,403,404,409,410,429,502].includes(error.status)?error.status:503);
        const known={404:'Recette introuvable sur FDL.',410:'Recette retirée de FDL par la modération.',429:'Limite de requêtes FDL atteinte. Réessaie plus tard.',502:'FDL ne répond pas. Réessaie plus tard.',503:'L’intégration FDL est temporairement indisponible.'};
        sendJson(res,status,{error:known[status]||((error.code==='MANGER_RECIPE_INPUT'||error.code==='MANGER_FDL_INPUT'||error.code==='MANGER_FDL_LINK')?error.message:'Requête FDL refusée.')});
      }
    }
    return true;
  }
  return {handle,callback,invalidate:()=>manage(async()=>{generation++;pending.clear();}),close:()=>{closed=true;generation++;pending.clear();}};
}
module.exports={fdlRoutes};
