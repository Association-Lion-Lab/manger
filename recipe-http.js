const {validateRecipe,checkedRecipe,inputError}=require('./recipe');

async function body(request) {
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>600000)throw inputError('Requête trop volumineuse');chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw inputError('JSON invalide');}
}
function recipeRoutes(store,sendJson) {
  return async(request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname,method=request.method;
    const match=path.match(/^\/api\/recipes(?:\/(\d+))?$/);
    if(!match||(match[1]===undefined?method!=='POST':!['PUT','DELETE'].includes(method)))return false;
    try {
      const id=match[1]===undefined?undefined:Number(match[1]);
      if(id!==undefined&&!Number.isSafeInteger(id))throw inputError('Identifiant invalide');
      if(method==='DELETE'){checkedRecipe(await store.remove(id));sendJson(response,200,{});}
      else {const value=validateRecipe(await body(request));sendJson(response,method==='POST'?201:200,checkedRecipe(await store.save(value,id)));}
    } catch(error) {
      const input=error?.code==='MANGER_RECIPE_INPUT';
      sendJson(response,input?400:503,{error:input?error.message:'Les recettes sont temporairement indisponibles. Aucune réussite n’a pu être confirmée.'});
    }
    return true;
  };
}
module.exports={recipeRoutes};
