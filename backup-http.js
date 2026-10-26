const {Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {dateKey}=require('./dates');
function backupRoutes(backup,sendJson){
  let busy=false;
  return async(request,response)=>{
    if(request.method!=='GET'||new URL(request.url,'http://localhost').pathname!=='/api/backup')return false;
    if(request.headers['x-manger-backup']!=='1'){sendJson(response,403,{error:'Utilise le bouton Sauvegarde dans Mon foyer.'});return true;}
    if(busy){sendJson(response,409,{error:'Une sauvegarde est déjà en cours. Réessaie dans un instant.'});return true;}
    busy=true;
    try{
      const bytes=await backup();
      response.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Content-Length':bytes.length,'Content-Disposition':`attachment; filename="manger-${dateKey(new Date())}.json"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      await pipeline(Readable.from([bytes]),response);
    }catch(error){
      if(!response.headersSent&&!response.destroyed)sendJson(response,error.code==='MANGER_BACKUP_TOO_LARGE'?413:503,{error:error.code==='MANGER_BACKUP_TOO_LARGE'?error.message:'Sauvegarde indisponible. Réessaie dans un instant.'});
      else response.destroy();
    }finally{busy=false;}
    return true;
  };
}
module.exports={backupRoutes};
