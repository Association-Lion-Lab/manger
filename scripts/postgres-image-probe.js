// Test-only stdin program; requests stay on this container's loopback.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {decodeHousehold}=require('./household-backup');
const {verifyMigration}=require('./migration-verify');
const base='http://127.0.0.1:3000',mode=process.env.MANGER_PROBE_MODE;
let cookie;
async function request(path,method='GET',value,headers={}){
  return fetch(base+path,{method,signal:AbortSignal.timeout(12000),headers:{Origin:base,...(cookie?{Cookie:cookie}:{}),...(value?{'Content-Type':'application/json'}:{}),...headers},body:value?JSON.stringify(value):undefined});
}
async function data(path,method,value,status=200){const response=await request(path,method,value);assert.equal(response.status,status,path);return response.json();}
async function backup(){const response=await request('/api/backup','GET',undefined,{'X-Manger-Backup':'1'});assert.equal(response.status,200);return Buffer.from(await response.arrayBuffer());}
(async()=>{
  assert.ok(['write','verify'].includes(mode));assert.notEqual(process.getuid(),0);
  assert.deepEqual(fs.readdirSync('/run/secrets').sort(),['pg_app_password','pg_ca']);
  for(const name of ['scripts','docker','test-support','.test-tools','.forgejo'])assert.equal(fs.existsSync('/app/'+name),false,name);
  for(const file of ['/data/manger.db','/data/accounts.db'])assert.equal(fs.existsSync(file),false);
  assert.equal((await request('/api/household')).status,401);assert.equal((await request('/api/health')).status,200);
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
