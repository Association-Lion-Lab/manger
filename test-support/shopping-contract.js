const assert=require('node:assert/strict');
async function shoppingContract(t,{store,recipes,meals}){
  const start='2026-11-02',manual={weekStart:start,name:'Café',amount:1,unit:'paquet',aisle:'Épicerie'};let id;
  await t.test('édition conditionnelle, conflit concurrent et coche indépendante',async()=>{
    id=await store.saveManual(manual);assert.equal(typeof id,'number');
    await store.check({...manual,manualId:id,checked:true});
    const outcomes=await Promise.allSettled([2,3].map(amount=>Promise.resolve().then(()=>store.saveManual({...manual,amount,previous:manual},id))));
    assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.find(r=>r.status==='rejected').reason.status,409);
    const rows=await store.read(start);assert.equal(rows[0].checked,true);assert.ok([2,3].includes(rows[0].amount));assert.deepEqual(await store.read('2026-11-09'),[]);
  });
  let recipe;
  await t.test('courses calculées, rayons canoniques et lecture semaine cohérente',async()=>{
    recipe=await recipes.save({title:'Carottes',minutes:10,servings:1,diet:'vegan',tags:[],ingredients:[{name:'carotte',amount:200,unit:'g'}],steps:[{position:1,kind:'cook',instruction:'Cuire.',minutes:10}]});
    await meals.save({date:start,slot:'midi',location:'home',occasion:'regular',recipeId:recipe.id,title:recipe.title,people:1});
    await store.aisle({name:'CAROTTES',unit:'g',aisle:'Frais'});await store.check({weekStart:start,name:'Carottes',unit:'g',checked:true});
    let rows=await store.read(start);assert.deepEqual(rows[0],{name:'carotte',unit:'g',amount:200,fromPantry:0,aisle:'Frais',checked:true});
    await store.check({weekStart:start,name:'carotte',unit:'g',checked:false});assert.equal((await store.read(start))[0].checked,false);
    const week=await store.week(start);assert.deepEqual(week.shopping,await store.read(start));assert.equal(week.meals.length,1);assert.equal(week.recipes[0].id,recipe.id);
  });
  await t.test('synchronisation additive répétable et refus des quantités devenues différentes',async()=>{
    const items=await store.read(start);const result=await store.sync({weekStart:start,items:[...items,{name:'absent',unit:'g',amount:1}]});
    assert.deepEqual(result,{accepted:[0,1],rejected:[2]});assert.deepEqual(await store.sync({weekStart:start,items}),{accepted:[0,1],rejected:[]});
    assert.deepEqual(await store.sync({weekStart:start,items:[{...items[0],unit:'kg'}]}),{accepted:[],rejected:[0]});
    await recipes.save({...recipe,ingredients:[{name:'carotte',unit:'g',amount:100}]},recipe.id);
    assert.deepEqual(await store.sync({weekStart:start,items}),{accepted:[1],rejected:[0]});
    await assert.rejects(async()=>store.sync({weekStart:start,items:[items[0],items[0]]}),{code:'MANGER_SHOPPING_INPUT'});
    await store.removeManual(id);await assert.rejects(async()=>store.saveManual({...manual,previous:manual},id),{status:409});
  });
}
module.exports={shoppingContract};
