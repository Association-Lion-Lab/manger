const test=require('node:test');
const assert=require('node:assert/strict');
const {postgresRecipes}=require('./db/recipes');
const {validateRecipe}=require('./server');
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
