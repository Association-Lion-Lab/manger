const {readRecipeBody}=require('./recipe-http');
const {dateKey,addDays,isDateKey}=require('./dates');
const {pantryError}=require('./pantry');
function calculationRoutes(calc,pantry,sendJson){
  return async(request,response)=>{
    const url=new URL(request.url,'http://localhost'),path=url.pathname,method=request.method,match=path.match(/^\/api\/pantry\/(\d+)$/);
    if(!(method==='GET'&&['/api/pantry','/api/suggestions'].includes(path))&&!(method==='POST'&&['/api/pantry','/api/week/preview'].includes(path))&&!(method==='DELETE'&&match))return false;
    try{
      if(match){await pantry.remove(Number(match[1]));sendJson(response,200,await calc.pantry());}
      else if(path==='/api/pantry'){
        if(method==='POST')await pantry.save(await readRecipeBody(request,32768));
        sendJson(response,200,await calc.pantry());
      }else if(path==='/api/week/preview')sendJson(response,200,await calc.preview(await readRecipeBody(request,32768)));
      else {
        const start=url.searchParams.get('start'),value=url.searchParams.get('maxMinutes'),max=value==null?null:Number(value);
        if(start!=null&&!isDateKey(start))throw pantryError('Début de semaine invalide');
        const date=url.searchParams.get('date')||start||dateKey(new Date());
        if(!isDateKey(date)||(start&&(date<start||date>addDays(start,6))))throw pantryError('Date de suggestion invalide');
        if(max!=null&&(!Number.isInteger(max)||max<1||max>1440))throw pantryError('Temps disponible invalide');
        const members=url.searchParams.has('members')?url.searchParams.get('members').split(',').filter(Boolean).map(Number):null;
        sendJson(response,200,await calc.suggestions(start,max,members,date));
      }
    }catch(error){
      const input=['MANGER_PANTRY_INPUT','MANGER_CALCULATION_INPUT','MANGER_RECIPE_INPUT'].includes(error.code);
      sendJson(response,input?(error.status||400):503,{error:input?error.message:'Les calculs sont temporairement indisponibles. Aucune réussite n’a pu être confirmée.'});
    }
    return true;
  };
}
module.exports={calculationRoutes};
