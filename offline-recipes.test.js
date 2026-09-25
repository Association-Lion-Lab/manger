const test = require('node:test');
const assert = require('node:assert/strict');
const offline = require('./public/offline-recipes');
function storage() { const data = new Map(); return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}; }
const recipe = id => ({id,title:'Recette <test>',portions:4,minutes:25,savedAt:'2026-09-25T12:00:00Z',ingredients:['2 tomates · cru'],steps:[{label:'Préparation · 5 min',text:'Couper les tomates.'}]});
test('offline recipe copies replace by ID, preserve portions, cap at 20 and remove independently',()=>{
 const store=storage();assert.deepEqual(offline.read(store),[]);
 for(let i=1;i<=20;i++)offline.save(store,recipe(i));
 const before=store.getItem(offline.KEY);assert.throws(()=>offline.save(store,recipe(21)),/20 recettes/);assert.equal(store.getItem(offline.KEY),before);
 offline.save(store,{...recipe(1),portions:2,ingredients:['1 tomate · cru']});
 assert.equal(offline.read(store).length,20);assert.equal(offline.read(store)[0].portions,2);assert.equal(offline.read(store)[0].ingredients[0],'1 tomate · cru');
 offline.remove(store,1);assert.equal(offline.read(store).length,19);offline.save(store,recipe(21));assert.equal(offline.read(store)[0].id,21);
});
test('offline storage rejects corruption and bad snapshots, preserves previous copy on quota failure',()=>{
 const store=storage();offline.save(store,recipe(1));const previous=store.getItem(offline.KEY);
 for(const patch of [{portions:0},{steps:null},{savedAt:'broken'},{ingredients:[42]},{id:'1'}])assert.throws(()=>offline.save(store,{...recipe(2),...patch}));
 assert.equal(store.getItem(offline.KEY),previous);
 const full={getItem:store.getItem,setItem:()=>{throw new Error('QuotaExceededError');}};
 assert.throws(()=>offline.save(full,recipe(2)),/Quota/);assert.equal(store.getItem(offline.KEY),previous);
 store.setItem(offline.KEY,'{}');assert.throws(()=>offline.read(store),/invalide/);
 store.setItem(offline.KEY,'not json');assert.throws(()=>offline.read(store));
});
