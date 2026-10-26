// Disposable source, executed via stdin in the candidate image without network.
const {createDatabase,saveRecipe,validateRecipe}=require('./server');
const {openAccounts,createAccount}=require('./accounts');
(async()=>{
  const data=createDatabase('/source/manger.db',{seedData:false}),accounts=openAccounts('/source/accounts.db');
  try{
    const recipe=saveRecipe(data,validateRecipe({title:'Source synthétique Docker',minutes:10,servings:1,diet:'vegetarian',tags:['japon'],ingredients:[{name:'carotte',unit:'g',amount:100,preparation:'cooked'}],steps:[{kind:'prep',instruction:'Donnée synthétique de vérification.',minutes:1}]}));
    data.prepare("INSERT INTO members(name,diet) VALUES('Admin','omnivore')").run();
    data.prepare("INSERT INTO meals(date,slot,location,occasion,people,recipe_id,title) VALUES('2026-10-19','midi','home','regular',1,?,'Source synthétique')").run(recipe.id);
    await createAccount(accounts,'admin','manger-synthetic-image-password',true);
  }finally{accounts.close();data.close();}
  console.log('Copies SQLite synthétiques créées et fermées.');
})().catch(()=>{console.error('Création des copies synthétiques refusée.');process.exitCode=1;});
