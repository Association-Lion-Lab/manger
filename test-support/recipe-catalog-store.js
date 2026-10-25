const assert=require('node:assert/strict');
const {validateRecipe}=require('../recipe');
const {recipeDraft}=require('./recipe-fixture');
const catalog=require('../catalog');

async function catalogStoreContract(t,{store,brokenImport,snapshot}) {
  const draft=patch=>validateRecipe(recipeDraft(patch)),clean=async()=>JSON.parse(JSON.stringify(await store.read()));let custom;
  await t.test('catalogue : recettes personnalisées conservées, répétition sans ajout',async()=>{
    custom=await store.save(draft({title:'Déjà personnalisée',minutes:7,photo:'data:image/jpeg;base64,/9j/2Q=='}));
    await store.setFavorite(custom.id,true);await store.setNote(custom.id,4,'Mon avis');custom=(await clean()).find(r=>r.id===custom.id);
    const list=['Déjà personnalisée','Nouvelle A','Nouvelle B'].map(title=>draft({title}));
    assert.equal(await store.importCatalog(list),2);assert.equal(await store.importCatalog(list),0);
    assert.deepEqual((await clean()).find(r=>r.id===custom.id),custom);
  });
  await t.test('titres exacts : casse préservée et doublon du même lot ignoré',async()=>{
    assert.equal(await store.importCatalog(['Case','case','Case'].map(title=>draft({title}))),2);
    const titles=(await clean()).map(r=>r.title);assert.equal(titles.filter(title=>title==='Case').length,1);assert.equal(titles.filter(title=>title==='case').length,1);
  });
  await t.test('échec au milieu du lot : aucune recette ou donnée enfant partielle',async()=>{
    const before=await snapshot(),broken=brokenImport();
    const list=['À annuler A','À annuler B'].map((title,i)=>draft({title,ingredients:[{name:`nouveau-échec-${i}`,unit:'g',amount:1}]}));
    await assert.rejects(async()=>broken.importCatalog(list));assert.deepEqual(await snapshot(),before);
    assert.equal(await store.importCatalog(list),2);
  });
  await t.test('deux imports concurrents n’ajoutent chaque titre qu’une fois',async()=>{
    const list=['En même temps A','En même temps B'].map(title=>draft({title}));
    const results=await Promise.all([store.importCatalog(list),store.importCatalog(list)]);assert.deepEqual(results.sort(),[0,2]);
    const titles=(await clean()).map(r=>r.title);for(const item of list)assert.equal(titles.filter(title=>title===item.title).length,1);
  });
  await t.test('les 100 recettes réelles importées sans écraser une personnalisation',async()=>{
    const customized=await store.save(validateRecipe({...catalog[0],minutes:7,photo:'data:image/jpeg;base64,/9j/2Q=='}));await store.setFavorite(customized.id,true);
    const before=(await clean()).find(r=>r.id===customized.id),titles=new Set((await clean()).map(r=>r.title));
    const expected=catalog.filter(r=>!titles.has(r.title)).length;assert.equal(await store.importCatalog(catalog.map(validateRecipe)),expected);
    assert.equal(await store.importCatalog(catalog.map(validateRecipe)),0);assert.deepEqual((await clean()).find(r=>r.id===customized.id),before);
    const after=new Set((await clean()).map(r=>r.title));assert.equal(catalog.length,100);for(const item of catalog)assert.ok(after.has(item.title));
  });
}
module.exports={catalogStoreContract};
