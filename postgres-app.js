const {createServer}=require('node:http');
const {createServer:createHttpsServer}=require('node:https');
const {join,resolve}=require('node:path');
const {mkdir,lstat,access}=require('node:fs/promises');
const {constants}=require('node:fs');
const {openPostgres}=require('./db/postgres');
const {postgresConfig}=require('./db/config');
const {requirePostgresCandidate,checkApplicationStorage}=require('./db/readiness');
const {postgresRepositories}=require('./db/repositories');
const {createPostgresRestore}=require('./postgres-restore');
const {tlsOptions,localCertificate}=require('./tls');
const {protectAccounts}=require('./accounts');
const {createInvitationMailer}=require('./invitation-mail');
const {publicRoutes}=require('./public-http');
const {syncDirectory}=require('./db/instance-tools');
async function runtimeDirectory(path){
  try{await mkdir(path,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const info=await lstat(path);
  if(!info.isDirectory()||info.isSymbolicLink()||(process.platform!=='win32'&&(info.mode&0o022)))throw new Error('Répertoire de récupération refusé.');
  await access(path,constants.W_OK);await syncDirectory(path);await syncDirectory(require('node:path').dirname(path));return path;
}
function json(response,status,data){const body=Buffer.from(JSON.stringify(data));response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store'});response.end(body);}
async function createPostgresRuntime(env=process.env){
  requirePostgresCandidate(env);
  const tls=tlsOptions(env),mailer=createInvitationMailer(env),db=await openPostgres(postgresConfig(env));
  try{
    await checkApplicationStorage(db);
    const directory=await runtimeDirectory(resolve(env.MANGER_DATA_DIR||join(__dirname,'data')));
    const stores=postgresRepositories(db);
    stores.restoration=createPostgresRestore(db,{recoveryDirectory:join(directory,'recovery')});
    const business=require('./server').createBusinessHandler(stores);
    const handler=async(request,response,context)=>{
      if(request.method==='GET'&&new URL(request.url,'http://localhost').pathname==='/api/health'){
        try{await checkApplicationStorage(db);return json(response,200,{status:'ok',version:require('./package.json').version});}
        catch{return json(response,503,{error:'Stockage temporairement indisponible.'});}
      }
      if(publicRoutes(request,response))return;
      return business(request,response,context);
    };
    const protectedHandler=protectAccounts(null,handler,{auth:stores.auth,backupReady:true,restoreReady:true,secure:Boolean(tls)||env.MANGER_SECURE_COOKIE==='1',mailer,certificate:localCertificate(tls)});
    const server=tls?createHttpsServer(tls,protectedHandler):createServer(protectedHandler);
    const sockets=new Set();server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
    let closing;
    const close=()=>closing||=(async()=>{
      stores.restoration.clear();let timer;
      try{if(server.listening)await new Promise((resolveClose,reject)=>{timer=setTimeout(()=>{server.closeAllConnections();for(const socket of sockets)socket.destroy();},5000);server.close(error=>error?reject(error):resolveClose());server.closeIdleConnections();});}
      finally{clearTimeout(timer);await db.close();}
    })();
    return {server,close};
  }catch(error){await db.close();throw error;}
}
module.exports={createPostgresRuntime};
