const test=require('node:test');
const {createDatabase}=require('./server');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {extrasStoreContract}=require('./test-support/recipe-extras-store');

test('photos, favoris et avis : dépôt SQLite',async t=>{
  const db=createDatabase(':memory:');t.after(()=>db.close());db.exec('DELETE FROM recipes');
  await extrasStoreContract(t,{store:sqliteRecipes(db),
    counts:id=>db.prepare('SELECT (SELECT count(*) FROM recipe_favorites WHERE recipe_id=?) AS favorites,(SELECT count(*) FROM recipe_notes WHERE recipe_id=?) AS notes').get(id,id),
    seedZero:()=>db.exec("INSERT INTO recipes(id,title,minutes,servings,diet) VALUES(0,'Zero',1,1,'vegan')")});
});
