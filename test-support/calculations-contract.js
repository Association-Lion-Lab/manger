const assert=require('node:assert/strict');
async function calculationContract(t,{calc,pantry,home,recipes,meals}){
  const today=require('../dates').dateKey(new Date()),start='2026-11-02';
  const member=await home.addMember({name:'Admin',diet:'vegan'});
  const recipe=await recipes.save({title:'Riz aux carottes',minutes:10,servings:2,diet:'vegan',tags:['express'],ingredients:[{name:'carotte',unit:'g',amount:200},{name:'riz',unit:'g',amount:100}],steps:[{position:1,kind:'cook',instruction:'Cuire.',minutes:10}]});
  await t.test('lots séparés, dates conservées, normalisation, édition ciblée et refus',async()=>{
    await pantry.save({name:'CAROTTES',unit:'kg',amount:.3,useBy:today,newLot:true});
    await pantry.save({name:'carotte',unit:'g',amount:200,newLot:true});
    let rows=await calc.pantry();assert.equal(rows.length,2);assert.ok(rows.every(r=>!r.ambiguous&&r.name==='carotte'));
    const first=rows[0];await pantry.save({id:first.id,name:'carotte',unit:'g',amount:400});
    rows=await calc.pantry();assert.equal(rows[0].useBy,today);assert.equal(rows[0].amount,400);
    for(const change of [{id:first.id,newLot:true},{id:first.id,name:'riz'},{useBy:'2026-02-30'},{amount:0},{newLot:'yes'}])await assert.rejects(async()=>pantry.save({name:'carotte',unit:'g',amount:100,...change}),{code:'MANGER_PANTRY_INPUT'});
    await assert.rejects(async()=>pantry.save({name:'carotte',unit:'g',amount:100}),{code:'MANGER_PANTRY_INPUT'});
    for(const r of rows)await pantry.remove(r.id);assert.deepEqual(await calc.pantry(),[]);
  });
  await t.test('courses de restes hors semaine, portions et conversions exactes',async()=>{
    await meals.save({date:start,slot:'midi',location:'home',occasion:'regular',recipeId:recipe.id,title:recipe.title,people:2});
    const source=(await meals.read(start))[0];await meals.leftovers({sourceId:source.id,date:'2026-11-09',slot:'midi',people:1});
    assert.deepEqual(await calc.shoppingList(start),[{name:'carotte',unit:'g',amount:300},{name:'riz',unit:'g',amount:150}]);
    assert.deepEqual(await calc.shoppingList('2026-11-09'),[]);
  });
  await t.test('suggestions et aperçu sans écriture, plats planifiés et régimes',async()=>{
    const result=await calc.suggestions(start,null,[member],start);assert.equal(result[0].id,recipe.id);assert.equal(result[0].alreadyPlanned,true);assert.equal(result[0].lastEaten,'2026-11-09');assert.deepEqual(result[0].tags,['express']);
    await assert.rejects(async()=>calc.suggestions(start,null,[999999],start));
    const input={start:'2026-11-16',memberIds:[member],maxMinutes:15,slots:[{day:0,slot:'midi'}]};
    const before=await calc.pantry();assert.deepEqual(await calc.preview(input),[{day:0,slot:'midi',recipeId:recipe.id,pantryIngredients:[]}]);assert.deepEqual(await calc.pantry(),before);assert.deepEqual(await meals.read(input.start),[]);
    assert.deepEqual(await calc.suggestions(start,5,[member],start),[]);
  });
}
module.exports={calculationContract};
