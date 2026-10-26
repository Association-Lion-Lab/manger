const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {databaseFixture}=require('./database');
const {postgresRepositories}=require('../db/repositories');
const {openAccounts,createAccount,protectAccounts}=require('../accounts');
const {createBusinessHandler}=require('../server');
const {householdHttp}=require('./household-http');
const {shoppingHttpContract}=require('./shopping-http-contract');
test('tous parcours métier et courses HTTP PostgreSQL réel',{timeout:60000},async t=>{
  const {database:db}=await databaseFixture(t),legacy=openAccounts(':memory:');let failing=false;
  try{await createAccount(legacy,'member','long-password-member',false);const row=legacy.prepare('SELECT * FROM accounts').get();await db.query('INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)',[row.username,row.password,row.admin]);}finally{legacy.close();}
  const stores=postgresRepositories({...db,transaction:work=>failing?db.query('SELECT private_password FROM household.absent'):db.transaction(work)});
  const server=createServer(protectAccounts(null,createBusinessHandler(stores),{auth:stores.auth})),http=await householdHttp(t,server);
  const {cookie}=await shoppingHttpContract(t,{...http,failDatabase(){failing=true;return()=>{failing=false;};}});
  await t.test('recette → repas → courses → semaine type depuis le même moteur',async()=>{
    const post=async(path,input)=>{const r=await http.request(path,'POST',input,cookie);const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value;};
    const recipe=await post('/api/recipes',{title:'Riz',servings:2,diet:'vegan',minutes:10,tags:['japon'],ingredients:[{name:'riz',unit:'g',amount:160}],steps:[{kind:'cook',instruction:'Cuire.'}]});
    await post('/api/meals',{date:'2026-11-02',slot:'midi',location:'home',occasion:'regular',recipeId:recipe.id,title:recipe.title,people:2,expectedId:null});
    let week=await(await http.request('/api/week?start=2026-11-02','GET',undefined,cookie)).json();assert.equal(week.recipes[0].id,recipe.id);assert.equal(week.meals[0].recipeId,recipe.id);assert.equal(week.shopping[0].amount,160);
    await post('/api/pantry',{name:'riz',unit:'g',amount:60});
    week=await(await http.request('/api/week?start=2026-11-02','GET',undefined,cookie)).json();assert.equal(week.shopping[0].amount,100);
    const model=await post('/api/week-templates',{name:'Semaine test',start:'2026-11-02'});await post(`/api/week-templates/${model.id}/apply`,{targetStart:'2026-11-09'});
    assert.equal((await http.request('/api/calendar.ics?start=2026-11-09','GET',undefined,cookie)).status,200);
    assert.equal((await http.request('/api/household','GET',undefined,cookie)).status,200);
    assert.equal((await http.request('/api/recipes/export','GET',undefined,cookie)).status,200);
  });
});
