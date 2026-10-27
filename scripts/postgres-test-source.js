// Disposable source, executed via stdin in the candidate image without network.
const {createDatabase,saveRecipe,validateRecipe}=require('./server');
const {openAccounts,createAccount}=require('./accounts');
(async()=>{
  const {join}=require('node:path'),folder=process.env.MANGER_PROBE_SOURCE_DIR||'/source';
  const data=createDatabase(join(folder,'manger.db'),{seedData:false}),accounts=openAccounts(join(folder,'accounts.db'));
  try{
    const recipe=saveRecipe(data,validateRecipe({title:'Source synthétique Docker',minutes:10,servings:1,diet:'vegetarian',tags:['japon'],ingredients:[{name:'carotte',unit:'g',amount:100,preparation:'cooked'}],steps:[{kind:'prep',instruction:'Donnée synthétique de vérification.',minutes:1}]}));
    data.prepare("INSERT INTO members(name,diet) VALUES('Admin','omnivore')").run();
    data.prepare("INSERT INTO meals(date,slot,location,occasion,people,recipe_id,title) VALUES('2026-10-19','midi','home','regular',1,?,'Source synthétique')").run(recipe.id);
    const account=await createAccount(accounts,'admin','manger-synthetic-image-password',true);
    const tokenHash=require('node:crypto').createHash('sha256').update('c'.repeat(64)).digest('hex');
    accounts.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash,account,Date.now()+86400000);
  }finally{accounts.close();data.close();}
  console.log('Copies SQLite synthétiques créées et fermées.');
})().catch(()=>{console.error('Création des copies synthétiques refusée.');process.exitCode=1;});
