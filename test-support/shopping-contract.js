const assert=require('node:assert/strict');
async function shoppingContract(t,{store,recipes,meals}){
  const start='2026-11-02',manual={weekStart:start,name:'Café',amount:1,unit:'paquet',aisle:'Épicerie'};let id;
  await t.test('édition conditionnelle, conflit concurrent et coche indépendante',async()=>{
    const saved=await store.saveManual(manual);id=saved.id;assert.equal(typeof id,'number');assert.deepEqual(saved,{id});
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
  const week='2026-11-16',ham={weekStart:week,name:'jambon',amount:1,unit:'pièce',aisle:'Frais'};
  const lines=async start=>(await store.read(start)).map(i=>[i.manualId,i.name,i.amount,i.unit,i.aisle,i.checked]);
  await t.test('un second ajout manuel du même aliment augmente la ligne non cochée, unités compatibles converties',async()=>{
    const first=await store.saveManual(ham);
    assert.deepEqual(await store.saveManual({...ham,name:' Jambon ',unit:'pièces',aisle:''}),{id:first.id,merged:true,name:'jambon',amount:2,unit:'pièce'});
    const flour=await store.saveManual({...ham,name:'farine',amount:500,unit:'g',aisle:''});
    assert.deepEqual(await store.saveManual({...ham,name:'Farine',unit:'kg'}),{id:flour.id,merged:true,name:'farine',amount:1500,unit:'g'});
    assert.deepEqual(await lines(week),[[first.id,'jambon',2,'pièce','Frais',false],[flour.id,'farine',1500,'g','',false]]);
    const butter={...ham,name:'beurre'},both=await Promise.all([1,2].map(()=>Promise.resolve().then(()=>store.saveManual(butter))));
    assert.equal(both[0].id,both[1].id);assert.equal(both.filter(r=>r.merged).length,1);assert.equal((await lines(week))[2][2],2);
    const kilo=await store.saveManual({...ham,name:'sucre',unit:'kg'});
    assert.deepEqual(await store.saveManual({...ham,name:'sucre',amount:0.4,unit:'g'}),{id:kilo.id,merged:true,name:'sucre',amount:1.0004,unit:'kg'});
    const tiny=await store.saveManual({...ham,name:'sucre',amount:1e-7,unit:'g'});assert.deepEqual(tiny,{id:tiny.id});assert.notEqual(tiny.id,kilo.id);
    const soap=await store.saveManual({...ham,name:'savon',unit:'Pièce'});
    assert.deepEqual(await store.saveManual({...ham,name:'savon'}),{id:soap.id,merged:true,name:'savon',amount:2,unit:'pièce'});
    for(const row of [flour,both[0],kilo,tiny,soap])await store.removeManual(row.id);
  });
  await t.test('pas de fusion : unité incompatible, autre semaine, ligne cochée, modification au crayon, plafond',async()=>{
    const [[firstId]]=await lines(week),slices=await store.saveManual({...ham,amount:4,unit:'tranche'});
    assert.deepEqual(slices,{id:slices.id});assert.notEqual(slices.id,firstId);
    const later=await store.saveManual({...ham,weekStart:'2026-11-23'});
    assert.deepEqual(await lines('2026-11-23'),[[later.id,'jambon',1,'pièce','Frais',false]]);
    await store.check({...ham,manualId:firstId,checked:true});
    const again=await store.saveManual(ham);assert.deepEqual(again,{id:again.id});
    assert.deepEqual(await store.saveManual({...ham,amount:4,previous:{...ham,amount:4,unit:'tranche'}},slices.id),{id:slices.id});
    assert.deepEqual(await lines(week),[[firstId,'jambon',2,'pièce','Frais',true],[slices.id,'jambon',4,'pièce','Frais',false],[again.id,'jambon',1,'pièce','Frais',false]]);
    const salt=await store.saveManual({...ham,name:'sel',amount:10000,unit:'g'});
    await assert.rejects(async()=>store.saveManual({...ham,name:'sel',unit:'g'}),{code:'MANGER_SHOPPING_INPUT',status:400});
    assert.equal((await lines(week)).find(l=>l[0]===salt.id)[2],10000);
  });
}
module.exports={shoppingContract};
