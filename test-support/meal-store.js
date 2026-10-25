const assert=require('node:assert/strict');
const {recipeDraft}=require('./recipe-fixture');
const {validateRecipe}=require('../recipe');
const plain=value=>JSON.parse(JSON.stringify(value));
const mealDraft=(change={})=>({date:'2026-10-26',slot:'midi',location:'home',occasion:'regular',people:2,recipeId:null,title:' Repas ',...change});
async function seedMeals(home,recipes) {
  const vegan=await home.addMember({name:'Vegan',diet:'vegan'}),other=await home.addMember({name:'Admin',diet:'omnivore'});
  const plant=await home.addProtein({name:'extra tofu',category:'plant',amount:123.125,unit:'g'}),meat=await home.addProtein({name:'extra poulet',category:'meat',amount:150,unit:'g'});
  const base=await recipes.save(validateRecipe({...recipeDraft(),title:'Base repas',diet:'vegan',minutes:10}));
  const rich=await recipes.save(validateRecipe({...recipeDraft(),title:'Plat repas',diet:'omnivore',minutes:35}));
  return {vegan,other,plant,meat,base:base.id,rich:rich.id};
}
async function mealStoreContract(t,{store,home,recipes,linkRest}) {
  const ids=await seedMeals(home,recipes),{vegan,other,plant,meat,base,rich}=ids;
  await t.test('repas commun, types, tri, hors semaine et remplacement gardant l’ID',async()=>{
    assert.deepEqual(await store.read('2026-10-26'),[]);
    const result=await store.save(mealDraft({recipeId:base}));assert.equal(result.title,'Repas');assert.equal(result.recipeId,base);
    const [row]=plain(await store.read('2026-10-26'));assert.equal(typeof row.id,'number');
    assert.deepEqual({...row,id:0},{id:0,date:'2026-10-26',slot:'midi',location:'home',occasion:'regular',people:2,recipeId:base,title:'Repas',minutes:10,leftoverOf:null,extraPortions:0,hasVariants:0,assignments:[]});
    await store.save(mealDraft({title:'Remplacé',occasion:'date',recipeId:rich}));
    assert.equal((await store.read('2026-10-26'))[0].id,row.id);
    await store.save(mealDraft({date:'2026-11-02',title:'Hors semaine'}),null);
    assert.equal((await store.read('2026-10-26')).length,1);
  });
  await t.test('variantes et plats distincts : portions, durée maximale, sans supplément',async()=>{
    await store.save(mealDraft({assignments:[{memberId:vegan,proteinId:plant,portions:2},{memberId:other,proteinId:meat,portions:1}],recipeId:base}));
    let [row]=plain(await store.read('2026-10-26'));assert.equal(row.people,3);assert.equal(row.hasVariants,1);assert.equal(row.assignments.length,2);
    const dishes=[{memberId:vegan,recipeId:base,portions:2},{memberId:other,recipeId:rich,portions:1,proteinId:meat}];
    await store.save(mealDraft({dishes}));[row]=plain(await store.read('2026-10-26'));
    assert.equal(row.people,3);assert.equal(row.minutes,35);assert.equal(row.hasVariants,0);assert.equal('assignments' in row,false);assert.deepEqual(row.dishes,dishes);
    const before=plain(await store.read('2026-10-26'));
    for(const change of [{dishes:[{...dishes[0],recipeId:rich}]},{dishes:[{...dishes[0],proteinId:meat}]},{dishes:[{...dishes[0],memberId:99999}]},{assignments:[{memberId:vegan,proteinId:meat,portions:1}]}])await assert.rejects(async()=>store.save(mealDraft(change)),{code:'MANGER_MEAL_INPUT'});
    assert.deepEqual(plain(await store.read('2026-10-26')),before);
  });
  await t.test('sorties, restaurant saisi, date/invités et refus des combinaisons invalides',async()=>{
    for(const [slot,location,occasion] of [['midi','restaurant','date'],['soir','outside','regular']])await store.save(mealDraft({slot,location,occasion,title:'Restaurant, Chez admin; soir'}));
    assert.deepEqual((await store.read('2026-10-26')).map(row=>row.slot),['midi','soir']);
    await store.save(mealDraft({slot:'soir',occasion:'guests',recipeId:rich,people:12}));
    for(const change of [{location:'restaurant',recipeId:base},{location:'outside',assignments:[{memberId:other,proteinId:meat,portions:1}]},{recipeId:99999},{date:'2026-02-30'},{title:'bad\0text'},{recipeId:'1'},{dishes:[{memberId:other,recipeId:rich,portions:1}],recipeId:base}])await assert.rejects(async()=>store.save(mealDraft(change)),{code:'MANGER_MEAL_INPUT'});
  });
  await t.test('création conditionnelle concurrente, remplacement et retrait conditionnels',async()=>{
    const draft=mealDraft({date:'2026-10-28'}),results=await Promise.allSettled([Promise.resolve().then(()=>store.save(draft,null)),Promise.resolve().then(()=>store.save({...draft,title:'Autre'},null))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
    const current=(await store.read('2026-10-26')).find(r=>r.date===draft.date);
    await assert.rejects(async()=>store.save(draft,current.id+5000),{code:'MANGER_MEAL_INPUT',status:409});
    await store.save({...draft,title:'Volontaire'},current.id);
    await assert.rejects(async()=>store.remove(draft.date,draft.slot,null),{status:409});
    await assert.rejects(async()=>store.remove(draft.date,draft.slot,current.id+5000),{status:409});
    await store.remove(draft.date,draft.slot,current.id);await store.remove(draft.date,draft.slot);await store.remove(draft.date,draft.slot,null);
  });
  await t.test('restes hors semaine comptés, source protégée et retrait enfant indépendant',async()=>{
    await store.save(mealDraft({date:'2026-10-30',recipeId:base}));
    const source=(await store.read('2026-10-26')).find(r=>r.date==='2026-10-30');
    await linkRest(source.id,'2026-11-03',4);
    assert.equal((await store.read('2026-10-26')).find(r=>r.id===source.id).extraPortions,4);
    await assert.rejects(async()=>store.save(mealDraft({date:source.date})),{code:'MANGER_MEAL_INPUT'});
    await assert.rejects(async()=>store.remove(source.date,source.slot),{code:'MANGER_MEAL_INPUT'});
    const rest=(await store.read('2026-11-02')).find(r=>r.leftoverOf===source.id);assert.ok(rest);
    await store.remove(rest.date,rest.slot);assert.equal((await store.read('2026-10-26')).find(r=>r.id===source.id).extraPortions,0);
    await store.remove(source.date,source.slot);assert.equal((await store.read('2026-10-26')).some(r=>r.id===source.id),false);
  });
  return ids;
}
module.exports={mealDraft,seedMeals,mealStoreContract,plain};
