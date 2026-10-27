// Test-only stdin program; requests stay on this container's loopback.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {decodeHousehold}=require('./household-backup');
const {verifyMigration}=require('./migration-verify');
let base='http://127.0.0.1:3000';
const mode=process.env.MANGER_PROBE_MODE;
let cookie;
async function request(path,method='GET',value,headers={}){
  return fetch(base+path,{method,signal:AbortSignal.timeout(12000),headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(value?{'Content-Type':'application/json'}:{}),...headers},body:value?JSON.stringify(value):undefined});
}
async function data(path,method,value,status=200){const response=await request(path,method,value);assert.equal(response.status,status,path);return response.json();}
async function backup(){const response=await request('/api/backup','GET',undefined,{'X-Manger-Backup':'1'});assert.equal(response.status,200);return Buffer.from(await response.arrayBuffer());}
async function sqliteReturn(){
  const {join}=require('node:path'),{tmpdir}=require('node:os'),{createHash}=require('node:crypto');
  const {mkdtemp,copyFile,readFile,writeFile,chmod,rm}=fs.promises;
  const folder=process.env.MANGER_PROBE_SOURCE_DIR||'/source';
  const source={home:join(folder,'manger.db'),accounts:join(folder,'accounts.db')};
  const hashes=()=>Promise.all([source.home,source.accounts].map(async file=>createHash('sha256').update(await readFile(file)).digest('hex')));
  const original=await hashes(),snapshot=await require('./migration-source').analyzeSource(source);
  const work=await mkdtemp(join(tmpdir(),'manger-sqlite-return-'));
  let database,accounts,server;
  try{
    await copyFile(source.home,join(work,'manger.db'));await copyFile(source.accounts,join(work,'accounts.db'));
    // copyFile retains read-only source permissions; only the private copies may become writable.
    for(const name of ['manger.db','accounts.db'])await chmod(join(work,name),0o600);
    const {createDatabase,createApp}=require('./server');
    database=createDatabase(join(work,'manger.db'),{seedData:false});accounts=require('./accounts').openAccounts(join(work,'accounts.db'));
    server=createApp(database,accounts,null,null);
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    base=`http://127.0.0.1:${server.address().port}`;
    assert.equal((await request('/api/health')).status,200);
    assert.equal((await request('/api/household')).status,401);
    // This session exists only in the disposable source created for this scenario.
    cookie='manger_session='+'c'.repeat(64);
    assert.equal((await data('/api/account')).username,'admin');
    const downloaded=join(work,'downloaded.db');await writeFile(downloaded,await backup(),{flag:'wx',mode:0o600});
    const saved=await require('./migration-source').analyzeSource({home:downloaded},{includeAuth:false});
    const expected=Object.fromEntries(Object.entries(snapshot.tables).filter(([name])=>name.startsWith('household.')));
    assert.equal(verifyMigration(expected,saved.tables,{includeAuth:false}).tables,18);
    for(const db of [database,accounts])assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
  }finally{
    try{if(server?.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
    finally{try{accounts?.close();database?.close();}finally{await rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:100});assert.deepEqual(await hashes(),original);}}
  }
  console.log('Retour SQLite vérifié : compte, 18 tables et sources inchangées.');
}
(async()=>{
  if(mode==='sqlite-return'){await sqliteReturn();return;}
  assert.ok(['write','verify','recovered'].includes(mode));assert.notEqual(process.getuid(),0);
  assert.deepEqual(fs.readdirSync('/run/secrets').sort(),['pg_app_password','pg_ca']);
  for(const name of ['scripts','docker','test-support','.test-tools','.forgejo'])assert.equal(fs.existsSync('/app/'+name),false,name);
  for(const file of ['/data/manger.db','/data/accounts.db'])assert.equal(fs.existsSync(file),false);
  assert.equal((await request('/api/household')).status,401);assert.equal((await request('/api/health')).status,200);
  if(mode==='recovered'){
    cookie='manger_session='+'c'.repeat(64);
    assert.equal((await data('/api/account')).username,'admin');
    const week=await data('/api/week?start=2026-10-19');
    assert.ok(week.recipes.some(recipe=>recipe.title==='Témoin de persistance Docker'));
    assert.ok(week.recipes.some(recipe=>recipe.title==='Après recréation Docker'));
    const next=await data('/api/recipes','POST',{title:'Après restauration complète Docker',minutes:1,servings:1,diet:'vegan',tags:[],ingredients:[{name:'riz',unit:'g',amount:1}],steps:[{kind:'prep',instruction:'Identité après restauration complète.',minutes:1}]},201);
    assert.ok(next.id>Math.max(...week.recipes.map(recipe=>recipe.id)));
    console.log('Secours restauré vérifié par HTTP : session et nouvelle identité.');return;
  }
  if(mode==='write'){
    const login=await request('/api/account/login','POST',{username:'admin',password:'manger-synthetic-image-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];await login.arrayBuffer();
    const page=await request('/');assert.equal(page.status,200);assert.match(await page.text(),/Manger/);
    const recipe=await data('/api/recipes','POST',{title:'Témoin de persistance Docker',minutes:12,servings:1,diet:'vegan',tags:['japon'],photo:'data:image/jpeg;base64,/9j/2Q==',ingredients:[{name:'carotte',unit:'g',amount:123.125,preparation:'cooked'}],steps:[{kind:'prep',instruction:'Donnée synthétique Docker.',minutes:1}]},201);
    await data(`/api/recipes/${recipe.id}/favorite`,'PUT',{favorite:true});
    await data(`/api/recipes/${recipe.id}/notes`,'PUT',{rating:4,note:'Avis synthétique conservé après recréation.'});
    await data('/api/pantry','POST',{name:'carotte',unit:'g',amount:50,newLot:true});
    await data('/api/shopping-manual','POST',{weekStart:'2026-10-19',name:'Article synthétique',amount:2.125,unit:'pièce',aisle:'Autres'},201);
    fs.writeFileSync('/data/docker-probe-backup.json',await backup(),{flag:'wx',mode:0o600});
    fs.writeFileSync('/data/docker-probe-session.json',JSON.stringify({cookie,id:recipe.id}),{flag:'wx',mode:0o600});
  }else{
    const state=JSON.parse(fs.readFileSync('/data/docker-probe-session.json'));cookie=state.cookie;
    assert.equal((await data('/api/account')).admin,true);
    verifyMigration(decodeHousehold(fs.readFileSync('/data/docker-probe-backup.json')).tables,decodeHousehold(await backup()).tables,{includeAuth:false});
    const next=await data('/api/recipes','POST',{title:'Après recréation Docker',minutes:1,servings:1,diet:'vegan',tags:[],ingredients:[{name:'riz',unit:'g',amount:1}],steps:[{kind:'prep',instruction:'Test de la prochaine identité.',minutes:1}]},201);
    assert.ok(next.id>state.id);
  }
  console.log(mode==='write'?'Données synthétiques, session et sauvegarde enregistrées.':'Recréation vérifiée : 18 tables, photos, session et prochaine identité.');
})().catch(error=>{console.error('Sonde Docker refusée :',error.code||error.message);process.exitCode=1;});
