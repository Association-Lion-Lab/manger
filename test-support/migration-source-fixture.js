const {mkdtemp,rm}=require('node:fs/promises');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {createHash}=require('node:crypto');
const {createDatabase}=require('../server');
const {openAccounts,createAccount}=require('../accounts');
const {sqliteMeals}=require('../db/meals-sqlite');
async function migrationSourceFixture(t){
  const folder=await mkdtemp(join(tmpdir(),'manger-transfer-source-'));t.after(()=>rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const home=join(folder,'manger.db'),accounts=join(folder,'accounts.db'),db=createDatabase(home,{seedData:false}),access=openAccounts(accounts);
  const token='c'.repeat(64),hash=s=>createHash('sha256').update(s).digest('hex');
  try{
    db.exec("INSERT INTO recipes(id,title,minutes,servings,tags,diet,instructions) VALUES(5000000001,'\uFEFFŒufs, été 🥣',10,1,'été,japon','vegetarian','Texte ancien'); INSERT INTO ingredients VALUES(0,'œuf','pièce'); INSERT INTO recipe_ingredients VALUES(5000000001,0,0.123456789123,'cooked'); INSERT INTO recipe_steps VALUES(0,5000000001,1,'cook','Cuire.',0); INSERT INTO members VALUES(0,'Admin','vegetarian','[ \"tomate crue\" ]'); INSERT INTO proteins VALUES(0,'œuf','egg',1,'pièce');");
    db.exec("INSERT INTO meals(id,date,slot,location,occasion,people,recipe_id,title) VALUES(0,'2026-11-02','midi','home','regular',1,5000000001,'Cuisine'); INSERT INTO meals(id,date,slot,location,occasion,people,recipe_id,title,leftover_of) VALUES(1,'2026-11-03','soir','home','regular',1,NULL,'Restes',0); INSERT INTO meal_assignments VALUES(0,0,0,1); INSERT INTO meal_dishes VALUES(1,0,5000000001,1,0); INSERT INTO shopping_checks VALUES('2026-11-02','œuf','pièce'); INSERT INTO shopping_manual VALUES(0,'2026-11-02','Café',1,'paquet','Épicerie',1); INSERT INTO shopping_aisles(rowid,name,unit,aisle) VALUES(-5,'œufs','pièce','Frais'),(9,'œuf','pièce','Épicerie'); INSERT INTO recipe_favorites VALUES(5000000001); INSERT INTO avoided_ingredients VALUES('céleri'); INSERT INTO recipe_notes VALUES(5000000001,4,'Avis synthétique');");
    db.prepare('INSERT INTO recipe_photos VALUES(?,?)').run(5000000001,Buffer.from([255,216,0,127,255,217]));
    db.prepare('INSERT INTO pantry VALUES(?,?,?,?,?,?,?,?)').run(0,'œuf\0pièce','œuf','pièce',.2,'2026-11-01','2026-11-05',0);
    db.prepare('INSERT INTO week_templates VALUES(?,?,?,?,?)').run(0,'Type','2026-11-02',JSON.stringify(sqliteMeals(db).read('2026-11-02')),'2026-11-01T12:00:00.000Z');
    await createAccount(access,'admin','long-password-admin',true);access.exec('UPDATE accounts SET id=0');
    access.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),0,Date.now()+86400000);
    access.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash('e'.repeat(64)),0,1);
    access.prepare('INSERT INTO attempts VALUES(?,?,?)').run('global',1,Date.now()+3600000);
    access.prepare('INSERT INTO invitations VALUES(?,?,?,?)').run(1,hash('d'.repeat(64)),0,Date.now()+86400000);
  }finally{db.close();access.close();}
  return {folder,home,accounts,token};
}
module.exports={migrationSourceFixture};
