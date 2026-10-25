const test=require('node:test');
const {createDatabase,createApp}=require('./server');
const {sqliteMeals}=require('./db/meals-sqlite');
const {sqliteHousehold}=require('./db/household-sqlite');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {openAccounts,createAccount}=require('./accounts');
const {householdHttp}=require('./test-support/household-http');
const {planningHttpContract}=require('./test-support/planning-http-contract');
test('planning HTTP SQLite normal protégé',async t=>{
  const db=createDatabase(':memory:'),accounts=openAccounts(':memory:');t.after(()=>{db.close();accounts.close();});await createAccount(accounts,'member','long-password-member',false);
  const server=createApp(db,accounts,null);
  try {await planningHttpContract(t,{...await householdHttp(t,server),store:sqliteMeals(db),home:sqliteHousehold(db),recipes:sqliteRecipes(db),
    failDatabase(){const prepare=db.prepare.bind(db);db.prepare=()=>{throw Error('SELECT private password');};return()=>{db.prepare=prepare;};},
    seedTemplateIds(snapshot,start){for(const id of [0,5000000001])db.prepare('INSERT INTO week_templates(id,name,source_start,meals_json,created_at) VALUES(?,?,?,?,?)').run(id,'ID '+id,start,snapshot,'2026-10-25T12:00:00.000Z');}
  });}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
