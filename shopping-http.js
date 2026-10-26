const {readRecipeBody}=require('./recipe-http');
function shoppingRoutes(store,sendJson){
  return async(request,response)=>{
    const url=new URL(request.url,'http://localhost'),path=url.pathname,method=request.method,match=path.match(/^\/api\/shopping-manual\/(\d+)$/);
    const read=method==='GET'&&['/api/shopping','/api/week'].includes(path);
    const post=method==='POST'&&['/api/shopping-manual','/api/shopping-checks','/api/shopping-checks/sync','/api/shopping-aisles'].includes(path);
    if(!read&&!post&&!(match&&['PUT','DELETE'].includes(method)))return false;
    try{
      if(read)sendJson(response,200,await store[path==='/api/week'?'week':'read'](url.searchParams.get('start')));
      else if(method==='DELETE'){await store.removeManual(Number(match[1]));sendJson(response,200,{});}
      else {
        const input=await readRecipeBody(request,32768);
        if(match||path==='/api/shopping-manual')sendJson(response,match?200:201,{id:await store.saveManual(input,match?Number(match[1]):null)});
        else if(path.endsWith('/sync'))sendJson(response,200,await store.sync(input));
        else {await store[path==='/api/shopping-aisles'?'aisle':'check'](input);sendJson(response,200,{});}
      }
    }catch(error){const input=['MANGER_SHOPPING_INPUT','MANGER_RECIPE_INPUT'].includes(error.code);sendJson(response,input?(error.status||400):503,{error:input?error.message:'Les courses sont temporairement indisponibles. Aucune réussite n’a pu être confirmée.'});}
    return true;
  };
}
module.exports={shoppingRoutes};
