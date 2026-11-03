const {validateRecipe,inputError}=require('./recipe');
const {origin,remoteId,version,metadata}=require('./fdl-format');
const unavailable=()=>Object.assign(new Error('FDL ne répond pas. Réessaie plus tard.'),{code:'MANGER_FDL_UNAVAILABLE',status:502});
function fdlUrl(env=process.env){
  if(!env.MANGER_FDL_URL)return null;
  if(!origin(env.MANGER_FDL_URL))throw new Error('MANGER_FDL_URL : origine HTTP ou HTTPS sans chemin ni identifiants requise.');
  return env.MANGER_FDL_URL;
}
function fdlId(value,base){
  const id=String(value??'');if(remoteId(id))return id;
  try{const url=new URL(id);return url.origin===base&&!url.username&&!url.password&&url.pathname==='/recette'&&url.searchParams.getAll('id').length===1?remoteId(url.searchParams.get('id')):null;}catch{return null;}
}
function fdlRecipe(projection){
  if(!projection||!Array.isArray(projection.ingredients))throw inputError('Recette FDL invalide.');
  const {title,minutes,servings,diet,tags,steps}=projection;
  return {title,minutes,servings,diet,tags,steps,sourceUrl:projection.url,
    ingredients:projection.ingredients.map(i=>i&&({...i,unit:i.unit===''?'pièce':i.unit}))};
}
function checkedProjection(projection,base,expectedId){
  if(!projection||remoteId(String(projection.id))!==expectedId||!version(projection.version)||fdlId(projection.url,base)!==expectedId)throw unavailable();
  let source;try{source=metadata(projection);}catch{throw unavailable();}
  return {recipe:validateRecipe(fdlRecipe(projection)),source:{origin:base,fdlId:expectedId,version:projection.version,metadata:source}};
}
function fdlClient(base,fetchImpl=fetch){
  async function request(path,token,body,signal){
    if(!path.startsWith('/api/v1/')&&path!=='/oauth/jeton')throw unavailable();
    let response,value;
    try{
      response=await fetchImpl(base+path,{method:body?'POST':'GET',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),
        headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body});
      if(!response.ok){await response.body?.cancel();throw Object.assign(unavailable(),{status:[400,401,403,404,410,429].includes(response.status)?response.status:502});}
      if(!response.headers.get('content-type')?.includes('application/json'))throw unavailable();
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>2*1024*1024)throw unavailable();chunks.push(chunk);}
      value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    }catch(error){if(error?.code==='MANGER_FDL_UNAVAILABLE')throw error;throw unavailable();}
    return value;
  }
  return {
    get:(path,token,signal)=>request(path,token,undefined,signal),
    token:async(code,clientId,redirectUri,verifier)=>{
      const value=await request('/oauth/jeton',null,new URLSearchParams({grant_type:'authorization_code',code,client_id:clientId,redirect_uri:redirectUri,code_verifier:verifier}));
      if(value?.token_type?.toLowerCase()!=='bearer'||typeof value.access_token!=='string'||value.access_token.length>2048||! /^[\x21-\x7e]+$/.test(value.access_token))throw unavailable();
      return value.access_token;
    }
  };
}
async function checkCopies({store,client,signal}){
  const link=await store.link();if(!link)return;
  const copies=(await store.copies()).filter(copy=>!copy.removed&&copy.origin===link.origin),changes=[];
  try{
    for(let offset=0;offset<copies.length;offset+=100){
      signal?.throwIfAborted();
      const batch=copies.slice(offset,offset+100),states=await client.get('/api/v1/etat?'+new URLSearchParams({ids:batch.map(c=>c.fdlId).join(',')}),link.token,signal);
      if(!states||typeof states!=='object'||Array.isArray(states))throw unavailable();
      for(const copy of batch){const state=states[copy.fdlId];if(state&&typeof state.state==='string')changes.push({recipeId:copy.recipeId,state:state.state,version:state.version});}
    }
    signal?.throwIfAborted();if(changes.length)await store.applyStates(link,changes);
  }catch(error){if(error.status===401)await store.clearLink(link.token);throw error;}
}
function startFdlChecks({store,client,report=()=>{}}){
  let timer,running=null,stopped=false;const controller=new AbortController();
  const run=()=>{
    if(stopped)return Promise.resolve();
    if(running)return running;
    running=checkCopies({store,client,signal:controller.signal}).catch(()=>{if(!stopped)report('Vérification FDL non confirmée.');}).finally(()=>{running=null;});return running;
  };
  const schedule=delay=>{timer=setTimeout(async()=>{await run();if(!stopped)schedule(86400000);},delay);timer.unref();};
  schedule(60000);
  return {run,stop:async()=>{stopped=true;clearTimeout(timer);controller.abort();await running;}};
}
module.exports={fdlUrl,fdlId,fdlRecipe,checkedProjection,fdlClient,checkCopies,startFdlChecks,unavailable};
