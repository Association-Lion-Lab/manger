const test=require('node:test');
const {createDatabase}=require('./server');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {extrasStoreContract}=require('./test-support/recipe-extras-store');
const {catalogStoreContract}=require('./test-support/recipe-catalog-store');

test('photos, favoris et avis : dépôt SQLite',async t=>{
  const db=createDatabase(':memory:');t.after(()=>db.close());db.exec('DELETE FROM recipes');
  await extrasStoreContract(t,{store:sqliteRecipes(db),
    counts:id=>db.prepare('SELECT (SELECT count(*) FROM recipe_favorites WHERE recipe_id=?) AS favorites,(SELECT count(*) FROM recipe_notes WHERE recipe_id=?) AS notes').get(id,id),
    seedZero:()=>db.exec("INSERT INTO recipes(id,title,minutes,servings,diet) VALUES(0,'Zero',1,1,'vegan')")});
});
test('import catalogue : transaction SQLite complète',async t=>{
  const db=createDatabase(':memory:');t.after(()=>db.close());db.exec('DELETE FROM recipes');const store=sqliteRecipes(db);
  await catalogStoreContract(t,{store,
    snapshot:()=>JSON.stringify(['recipes','ingredients','recipe_ingredients','recipe_steps','recipe_photos','recipe_notes','recipe_favorites'].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())),
    brokenImport(){let steps=0;return sqliteRecipes({exec:sql=>db.exec(sql),prepare(sql){const statement=db.prepare(sql);
      return sql.startsWith('INSERT INTO recipe_steps')?{run(...args){const result=statement.run(...args);if(++steps===3)db.prepare('SELECT missing_function()').get();return result;}}:statement;
    }});}});
});
