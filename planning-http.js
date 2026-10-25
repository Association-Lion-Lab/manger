const {validateId}=require('./planning');
const {readRecipeBody}=require('./recipe-http');
function planningRoutes(store,sendJson){
  return async(request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname,method=request.method;
    const root=path==='/api/week-templates',template=path.match(/^\/api\/week-templates\/(\d+)(\/apply)?$/),placement=path.match(/^\/api\/meals\/(\d+)\/placement$/);
    const listing=root&&method==='GET',deleting=template&&!template[2]&&method==='DELETE';
    const posting=method==='POST'&&(root||(template&&template[2])||placement||['/api/week/plan','/api/week/copy','/api/meals/leftovers'].includes(path));
    if(!listing&&!deleting&&!posting)return false;
    try {
      const id=template?Number(template[1]):placement?Number(placement[1]):undefined;if(id!==undefined)validateId(id);
      if(listing)sendJson(response,200,await store.templates());
      else if(deleting){await store.removeTemplate(id);sendJson(response,200,{ok:true});}
      else {
        const input=await readRecipeBody(request,32768);
        if(root)sendJson(response,201,await store.saveTemplate(input));
        else if(template)sendJson(response,200,{added:await store.applyTemplate(id,input)});
        else if(placement){await store.place(id,input);sendJson(response,200,{});}
        else if(path==='/api/meals/leftovers'){await store.leftovers(input);sendJson(response,201,{});}
        else if(path==='/api/week/plan')sendJson(response,200,{added:await store.planWeek(input)});
        else sendJson(response,200,{added:await store.copyWeek(input)});
      }
    }catch(error){
      const input=['MANGER_MEAL_INPUT','MANGER_RECIPE_INPUT'].includes(error?.code);
      sendJson(response,input?(error.status||400):503,{error:input?error.message:'Le planning est temporairement indisponible. Aucune réussite n’a pu être confirmée.'});
    }
    return true;
  };
}
module.exports={planningRoutes};
