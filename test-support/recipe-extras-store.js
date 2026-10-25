const assert=require('node:assert/strict');
const {validateRecipe}=require('../recipe');
const {recipeDraft}=require('./recipe-fixture');

async function extrasStoreContract(t,{store,counts,seedZero}) {
  let saved;const current=async id=>(await store.read()).find(row=>row.id===id);
  await t.test('JPEG identique, absence et conservation après édition',async()=>{
    saved=await store.save(validateRecipe(recipeDraft()));assert.equal(await store.readPhoto(saved.id),undefined);
    await store.save(validateRecipe(recipeDraft({photo:'data:image/jpeg;base64,/9j/2Q=='})),saved.id);
    assert.deepEqual(await store.readPhoto(saved.id),Buffer.from([255,216,255,217]));
    await store.save(validateRecipe(recipeDraft({title:'Modifiée'})),saved.id);
    assert.deepEqual(await store.readPhoto(saved.id),Buffer.from([255,216,255,217]));assert.equal((await current(saved.id)).hasPhoto,true);
    assert.equal(await store.readPhoto(9000000000),undefined);
  });
  await t.test('favori booléen idempotent et indépendant de la recette',async()=>{
    for(let i=0;i<2;i++)assert.equal(await store.setFavorite(saved.id,true),true);
    assert.equal((await counts(saved.id)).favorites,1);assert.equal((await current(saved.id)).favorite,true);
    assert.equal(await store.setFavorite(saved.id,false),true);assert.equal((await current(saved.id)).favorite,false);
    assert.equal(await store.setFavorite(9000000000,false),'unknown-recipe');
  });
  await t.test('avis remplacé, remise à zéro gardant la ligne et inconnu refusé',async()=>{
    assert.equal(await store.setNote(saved.id,4,'à refaire'),true);assert.equal(await store.setNote(saved.id,5,'Excellent'),true);
    assert.equal((await counts(saved.id)).notes,1);let r=await current(saved.id);assert.equal(r.rating,5);assert.equal(r.note,'Excellent');
    await store.setNote(saved.id,0,'');r=await current(saved.id);assert.equal(r.rating,0);assert.equal(r.note,'');assert.equal((await counts(saved.id)).notes,1);
    assert.equal(await store.setNote(9000000000,1,'absent'),'unknown-recipe');
  });
  await t.test('identifiant zéro historique et cascades gardent le dictionnaire indépendant',async()=>{
    await seedZero();assert.equal(await store.setFavorite(0,true),true);assert.equal(await store.setNote(0,3,'Zéro'),true);
    const r=await current(0);assert.equal(r.favorite,true);assert.equal(r.note,'Zéro');assert.equal(await store.remove(0),true);
    await store.setFavorite(saved.id,true);assert.equal(await store.remove(saved.id),true);
    assert.equal((await counts(saved.id)).favorites,0);assert.equal((await counts(saved.id)).notes,0);assert.equal(await store.readPhoto(saved.id),undefined);
  });
}
module.exports={extrasStoreContract};
