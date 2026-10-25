const test=require('node:test');
const assert=require('node:assert/strict');
const {createRecipePreview}=require('./recipe-preview');
const {validateNote}=require('./recipe');
const {recipeDraft}=require('./test-support/recipe-fixture');
const file=recipes=>({kind:'file',data:{format:'manger-recipes',version:1,recipes}});
const page={sourceUrl:'https://example.org/recette',html:'<script>throw new Error("do not run")</script><script type="application/ld+json">'+JSON.stringify({'@type':'Recipe',name:'Riz',totalTime:'PT10M',recipeYield:'2',recipeIngredient:['200 g de riz'],recipeInstructions:'Cuire le riz.'})+'</script>'};

test('aperçu fichier : photos/références ignorées, étapes vides averties, absentes refusées',async()=>{
  const preview=createRecipePreview();const result=await preview(file([recipeDraft({photo:'bad',photoCopyId:12,steps:[]})]));
  assert.equal(result.recipes[0].steps.length,0);assert.ok(!Object.hasOwn(result.recipes[0],'photo'));assert.ok(!Object.hasOwn(result.recipes[0],'photoCopyId'));
  assert.ok(result.warnings.some(w=>w.includes('étapes')));
  for(const value of [file([recipeDraft({steps:undefined})]),file([]),file(Array(201).fill(recipeDraft())),{kind:'file',data:{format:'manger-recipes',version:2,recipes:[recipeDraft()]}}])await assert.rejects(()=>preview(value),e=>e.code==='MANGER_RECIPE_INPUT');
});
test('aperçu URL : un seul téléchargement, fichier parallèle permis, garde libérée',async()=>{
  let finish,calls=0;const preview=createRecipePreview({download:async()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
  const pending=preview({kind:'url',url:page.sourceUrl});
  await assert.rejects(()=>preview({kind:'url',url:page.sourceUrl}),/déjà en cours/);assert.equal(calls,1);
  assert.equal((await preview(file([recipeDraft()]))).recipes.length,1);
  finish(page);const result=await pending;assert.equal(result.recipes[0].title,'Riz');assert.ok(result.warnings.some(w=>w.includes('Cru/cuit')));
  const next=preview({kind:'url',url:page.sourceUrl});finish(page);await next;assert.equal(calls,2);
});
test('aperçu : erreur réseau inattendue non marquée, reprise et téléchargement réel toujours protégé',async()=>{
  let calls=0;const preview=createRecipePreview({download:async()=>{if(++calls===1)throw new Error('technical-private-detail');return page;}});
  await assert.rejects(()=>preview({kind:'url',url:page.sourceUrl}),e=>e.code===undefined);
  assert.equal((await preview({kind:'url',url:page.sourceUrl})).recipes[0].title,'Riz');assert.equal(calls,2);
  await assert.rejects(()=>createRecipePreview()({kind:'url',url:'http://127.0.0.1/private'}),e=>e.code==='MANGER_RECIPE_INPUT');
});
test('avis : longueur UTF-16 avant trim, remise à zéro et NUL refusé',()=>{
  assert.deepEqual(validateNote({rating:0,note:' '.repeat(2000)}),{rating:0,note:''});
  assert.equal(validateNote({rating:5,note:'🍅'.repeat(1000)}).note.length,2000);
  for(const input of [{rating:2,note:' '.repeat(2001)},{rating:2,note:'🍅'.repeat(1001)},{rating:3,note:'a\0b'},{rating:1.5,note:''},{rating:6,note:''}])assert.throws(()=>validateNote(input),e=>e.code==='MANGER_RECIPE_INPUT');
});
