const test=require('node:test');
const assert=require('node:assert/strict');
const {postgresRecipes}=require('./db/recipes');
const {validateRecipe,createDatabase}=require('./server');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {recipeDraft}=require('./test-support/recipe-fixture');

test('dépôt des recettes construit sans connexion, requête ni amorçage',()=>{
  let calls=0;const db={query(){calls++;throw new Error('Aucune requête attendue.');},transaction(){calls++;throw new Error('Aucune transaction attendue.');}};
  const store=postgresRecipes(db);assert.ok(Object.isFrozen(store));assert.equal(store.engine,'postgres');assert.equal(calls,0);
});
test('validation historique : positions renumérotées, tags CSV et options photo conservées',()=>{
  const recipe=validateRecipe(recipeDraft({tags:[' a,b ','a'],steps:[{position:4,kind:'prep',instruction:' Mélanger. ',minutes:0},{position:20,kind:'serve',instruction:'Servir.'}],photo:null,photoCopyId:12}));
  assert.deepEqual(recipe.tags,['a,b','a']);assert.deepEqual(recipe.steps,[{position:1,kind:'prep',instruction:'Mélanger.',minutes:0},{position:2,kind:'serve',instruction:'Servir.',minutes:null}]);
  assert.equal(recipe.photo,null);assert.equal(recipe.photoCopyId,12);assert.equal(recipe.ingredients[0].name,'œuf');
  assert.throws(()=>validateRecipe(recipeDraft({photoCopyId:0})));assert.throws(()=>validateRecipe(recipeDraft({sourceUrl:'https://admin:secret@example.org'})));
});
test('les champs SQL texte refusent explicitement NUL sans toucher les autres caractères',()=>{
  for(const patch of [{title:'a\0b'},{tags:['a\0b']},{ingredients:[{name:'a\0b',amount:1,unit:'g'}]},{ingredients:[{name:'riz',amount:1,unit:'g\0'}]},{steps:[{kind:'prep',instruction:'a\0b'}]}])assert.throws(()=>validateRecipe(recipeDraft(patch)),error=>error.code==='MANGER_RECIPE_INPUT');
  assert.equal(validateRecipe(recipeDraft({title:'Été — 今日 🍅'})).title,'Été — 今日 🍅');
});
test('SQLite : erreurs après photo/enfants ou lecture finale annulent toute la recette',()=>{
  const db=createDatabase(':memory:'),store=sqliteRecipes(db),photo='data:image/jpeg;base64,/9j/2Q==';
  const snapshot=()=>JSON.stringify(['recipes','ingredients','recipe_ingredients','recipe_steps','recipe_photos','recipe_notes','recipe_favorites'].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
  try {
    db.exec('DELETE FROM recipes');const saved=store.save(validateRecipe(recipeDraft({photo}))),before=snapshot();
    const update=validateRecipe(recipeDraft({title:'À annuler',photo:null,ingredients:[{name:'nouveau',unit:'g',amount:1}]}));
    db.exec("CREATE TRIGGER reject_steps AFTER INSERT ON recipe_steps BEGIN SELECT RAISE(ABORT,'injected'); END");
    assert.throws(()=>store.save(update,saved.id),/injected/);db.exec('DROP TRIGGER reject_steps');assert.equal(snapshot(),before);
    const prepare=db.prepare.bind(db);db.prepare=(sql,...values)=>{if(sql.includes('FROM recipes ORDER BY title'))throw new Error('dto-read');return prepare(sql,...values);};
    try {assert.throws(()=>store.save(update),/dto-read/);}
    finally {db.prepare=prepare;}
    assert.equal(snapshot(),before);assert.equal(store.save(update,saved.id).title,'À annuler');
    assert.equal(store.remove(saved.id),true);assert.equal(store.remove(saved.id),'unknown-recipe');
    assert.equal(db.prepare('SELECT count(*) AS n FROM recipe_steps').get().n,0);
  } finally {db.close();}
});
