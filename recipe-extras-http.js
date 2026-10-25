const catalog=require('./catalog');
const {validateRecipe,validateNote,checkedRecipe,inputError}=require('./recipe');
const {readRecipeBody}=require('./recipe-http');
const {createRecipePreview}=require('./recipe-preview');

function recipeExtraRoutes(store,sendJson,{preview=createRecipePreview()}={}) {
  return async(request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname,method=request.method;
    const match=path.match(/^\/api\/recipes\/(\d+)\/(photo|favorite|notes)$/);
    const photo=match?.[2]==='photo'&&method==='GET';
    const edit=match&&['favorite','notes'].includes(match[2])&&method==='PUT';
    const exporting=path==='/api/recipes/export'&&method==='GET';
    const importing=path==='/api/recipes/import-preview'&&method==='POST';
    const importingCatalog=path==='/api/catalog/import'&&method==='POST';
    if(!photo&&!edit&&!exporting&&!importing&&!importingCatalog)return false;
    try {
      const id=match?Number(match[1]):undefined;
      if(id!==undefined&&!Number.isSafeInteger(id))throw inputError('Identifiant invalide');
      if(photo){
        const data=await store.readPhoto(id);
        if(data===undefined)sendJson(response,404,{error:'Photo absente'});
        else {response.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(data);}
      } else if(edit){
        const input=await readRecipeBody(request,32768);
        if(match[2]==='favorite'){
          if(!input||typeof input.favorite!=='boolean')throw inputError('Favori invalide');
          checkedRecipe(await store.setFavorite(id,input.favorite));sendJson(response,200,{favorite:input.favorite});
        } else {
          const note=validateNote(input);checkedRecipe(await store.setNote(id,note.rating,note.note));sendJson(response,200,note);
        }
      } else if(exporting){
        const recipes=(await store.read()).map(({id,favorite,hasPhoto,rating,note,...recipe})=>recipe);
        response.setHeader('Content-Disposition','attachment; filename="manger-recettes.json"');sendJson(response,200,{format:'manger-recipes',version:1,recipes});
      } else if(importing)sendJson(response,200,await preview(await readRecipeBody(request,1048576)));
      else sendJson(response,200,{added:checkedRecipe(await store.importCatalog(catalog.map(validateRecipe)))});
    } catch(error){
      const input=error?.code==='MANGER_RECIPE_INPUT';
      sendJson(response,input?400:503,{error:input?error.message:'Les recettes sont temporairement indisponibles. Aucune réussite n’a pu être confirmée.'});
    }
    return true;
  };
}
module.exports={recipeExtraRoutes};
