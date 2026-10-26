const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtemp,rm,readFile,writeFile}=require('node:fs/promises');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {createDatabase}=require('./server');
const {openAccounts}=require('./accounts');
const {analyzeSource}=require('./migration-source');
async function fixture(t){
  const folder=await mkdtemp(join(tmpdir(),'manger-source-test-'));t.after(()=>rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  const home=join(folder,'manger.db'),accounts=join(folder,'accounts.db');createDatabase(home,{seedData:false}).close();openAccounts(accounts).close();
  return {folder,home,accounts,change(fn){const db=new DatabaseSync(home);try{fn(db);}finally{db.close();}}};
}
test('analyse source : lecture seule, clés NUL, ordre des rayons et aucun amorçage',async t=>{
  const f=await fixture(t);f.change(db=>{
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recipes').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM proteins').get().n,0);
    db.prepare('INSERT INTO pantry(food_key,name,unit,amount,recorded_on) VALUES(?,?,?,?,?)').run('riz\0g','riz','g',123.456789,'2026-11-01');
    db.exec("INSERT INTO shopping_aisles(rowid,name,unit,aisle) VALUES(-5,'carottes','g','Maison'),(9,'carotte','g','Frais')");
    db.prepare('INSERT INTO avoided_ingredients(name) VALUES(?)').run('\uFEFFmoutarde');
  });
  const before=await readFile(f.home),a=await analyzeSource(f);assert.deepEqual(await readFile(f.home),before);assert.equal(a.tables['household.recipes'].length,0);assert.equal(a.tables['household.proteins'].length,0);
  assert.deepEqual(a.tables['household.pantry'][0].food_key,Buffer.from('riz\0g'));assert.deepEqual(a.tables['household.shopping_aisles'].map(i=>i.sort_order),[-5,9]);
  assert.equal(a.tables['household.avoided_ingredients'][0].name,'\uFEFFmoutarde');
  assert.equal(Object.keys(a.tables).length,22);assert.doesNotMatch(JSON.stringify(a.report),/carotte|riz|password|username|token/);
});
test('analyse source : ancienne version normalisée uniquement sur copie, modèle v3 obligatoire',async t=>{
  const f=await fixture(t);f.change(db=>db.exec('ALTER TABLE pantry DROP COLUMN use_by; ALTER TABLE pantry DROP COLUMN explicit_lot; PRAGMA user_version=3'));
  const before=await readFile(f.home),a=await analyzeSource(f);assert.equal(a.report.sourceVersion,3);assert.equal(a.report.normalizedVersion,4);assert.deepEqual(await readFile(f.home),before);
  f.change(db=>db.exec('DROP TABLE week_templates'));await assert.rejects(analyzeSource(f),{code:'MANGER_SOURCE_INVALID'});
});
test('analyse source : versions, schémas, NUL texte et fichiers incomplets refusés sans mutation',async t=>{
  const f=await fixture(t),original=await readFile(f.home);
  for(const sql of ['PRAGMA user_version=99','ALTER TABLE pantry ADD COLUMN hidden TEXT GENERATED ALWAYS AS (name) VIRTUAL','CREATE VIEW hidden AS SELECT * FROM recipes','CREATE VIEW sqliteX_hidden AS SELECT * FROM recipes','CREATE TRIGGER sqliteX_trigger AFTER INSERT ON pantry BEGIN DELETE FROM pantry; END',"INSERT INTO avoided_ingredients(name) VALUES('bad'||char(0)||'name')"]){
    await writeFile(f.home,original);f.change(db=>db.exec(sql));const before=await readFile(f.home);await assert.rejects(analyzeSource(f),{code:'MANGER_SOURCE_INVALID'});assert.deepEqual(await readFile(f.home),before);
  }
  await writeFile(f.home,original);await writeFile(f.home+'-wal','not a stopped source');await assert.rejects(analyzeSource(f),{code:'MANGER_SOURCE_INVALID'});await rm(f.home+'-wal');
  await assert.rejects(analyzeSource({...f,accounts:join(f.folder,'absent.db')}),{code:'MANGER_SOURCE_INVALID'});
  await writeFile(f.home,'corrupt');await assert.rejects(analyzeSource(f),{code:'MANGER_SOURCE_INVALID'});
});
test('analyse source : relations vérifiées même sans FK et encodage UTF-16 refusé',async t=>{
  const f=await fixture(t);let db=new DatabaseSync(f.accounts);
  db.exec('DROP TABLE sessions; CREATE TABLE sessions(token TEXT PRIMARY KEY,account_id INTEGER NOT NULL,expires INTEGER NOT NULL)');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run('a'.repeat(64),999,Date.now()+10000);db.close();
  await assert.rejects(analyzeSource(f),{code:'MANGER_SOURCE_INVALID'});
  await rm(f.accounts);db=new DatabaseSync(f.accounts);db.exec("PRAGMA encoding='UTF-16le'; CREATE TABLE marker(x); DROP TABLE marker");db.close();openAccounts(f.accounts).close();await assert.rejects(analyzeSource(f),{code:'MANGER_SOURCE_INVALID'});
});
test('analyse source : le CHECK du fichier n’est jamais réexécuté pendant la normalisation',async t=>{
  const f=await fixture(t);f.change(db=>{
    db.function('private_check',value=>1);db.exec("DROP TABLE avoided_ingredients; CREATE TABLE avoided_ingredients(name TEXT PRIMARY KEY CHECK(private_check(name))); INSERT INTO avoided_ingredients VALUES('céleri'); PRAGMA user_version=3");
  });
  const result=await analyzeSource(f);assert.deepEqual(result.tables['household.avoided_ingredients'],[{name:'céleri'}]);
});
test('initialisation SQLite : un échec ferme le handle jamais retourné',t=>{
  const original=DatabaseSync.prototype.exec,closed=[];const close=DatabaseSync.prototype.close;
  t.mock.method(DatabaseSync.prototype,'close',function(){closed.push(this);return close.call(this);});
  t.mock.method(DatabaseSync.prototype,'exec',function(sql){if(sql.includes('PRAGMA user_version = 2; COMMIT'))throw new Error('injected bootstrap failure');return original.call(this,sql);});
  assert.throws(()=>createDatabase(':memory:',{seedData:false}),/injected bootstrap failure/);assert.equal(closed.length,1);assert.equal(closed[0].isOpen,false);
});
test('analyse source : une semaine type doit contenir un snapshot structurellement valable',async t=>{
  const f=await fixture(t);f.change(db=>db.prepare('INSERT INTO week_templates(name,source_start,meals_json,created_at) VALUES(?,?,?,?)').run('Type','2026-11-02',JSON.stringify([{id:1,date:'2026-11-02',slot:'soir',location:'restaurant',occasion:'regular',people:1,recipeId:null,title:'Restaurant',leftoverOf:null,assignments:[]}]),'2026-11-02T12:00:00.000Z'));
  await analyzeSource(f);f.change(db=>db.exec("UPDATE week_templates SET meals_json='[null]'"));await assert.rejects(analyzeSource(f),{code:'MANGER_SOURCE_INVALID'});
});
