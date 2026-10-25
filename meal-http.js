const {inputError,validateExpectedId,calendarMeals}=require('./meal');
const {isDateKey}=require('./dates');
const {readRecipeBody}=require('./recipe-http');
function queryExpectedId(url) {
  if(!url.searchParams.has('expectedId'))return undefined;
  const value=url.searchParams.get('expectedId');
  if(value==='null')return null;
  if(!/^-?\d+$/.test(value))throw inputError('Identifiant de repas invalide');
  const id=Number(value);validateExpectedId(id);return id;
}
function mealRoutes(store,sendJson) {
  return async(request,response)=>{
    const url=new URL(request.url,'http://localhost'),method=request.method;
    const editing=url.pathname==='/api/meals'&&['POST','DELETE'].includes(method);
    const exporting=url.pathname==='/api/calendar.ics'&&method==='GET';
    if(!editing&&!exporting)return false;
    try {
      if(exporting){
        const start=url.searchParams.get('start');if(!isDateKey(start))throw inputError('Début de semaine invalide');
        const body=Buffer.from(calendarMeals(await store.read(start)));
        const contentType=url.searchParams.get('download')==='1'?'application/octet-stream':'text/calendar; charset=utf-8';
        response.writeHead(200,{'Content-Type':contentType,'Content-Disposition':`attachment; filename="manger-${start}.ics"`,'Content-Length':body.length,'Cache-Control':'no-store'});response.end(body);
      } else if(method==='POST'){
        const input=await readRecipeBody(request,32768);
        const expectedId=input?.expectedId;validateExpectedId(expectedId);
        sendJson(response,200,await store.save(input,expectedId));
      } else {
        await store.remove(url.searchParams.get('date'),url.searchParams.get('slot'),queryExpectedId(url));sendJson(response,200,{});
      }
    } catch(error){
      const input=['MANGER_MEAL_INPUT','MANGER_RECIPE_INPUT'].includes(error?.code);
      sendJson(response,input?(error.status||400):503,{error:input?error.message:'Les repas sont temporairement indisponibles. Aucune réussite n’a pu être confirmée.'});
    }
    return true;
  };
}
module.exports={mealRoutes};
