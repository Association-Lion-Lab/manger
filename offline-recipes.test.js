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

test('offline step durations are optional for old copies and bounded; timers use deadlines',()=>{
 const store=storage();offline.save(store,recipe(1));assert.equal(offline.read(store)[0].steps[0].minutes,undefined);
 for(const minutes of [null,0,5,1440]){offline.save(store,{...recipe(1),steps:[{label:'Cuisson',text:'Cuire.',minutes}]});assert.equal(offline.read(store)[0].steps[0].minutes,minutes);}
 const previous=store.getItem(offline.KEY);
 for(const minutes of [-1,1441,1.5,'5',Infinity])assert.throws(()=>offline.save(store,{...recipe(1),steps:[{label:'Cuisson',text:'Cuire.',minutes}]}));
 assert.equal(store.getItem(offline.KEY),previous);
 const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'public/offline.html'),'utf8');
 const seconds=require('node:vm').runInNewContext(html.match(/function timerSeconds[\s\S]*?(?=setInterval)/)[0]+';timerSeconds');
 assert.equal(seconds({end:null,remaining:45},999999),45);
 assert.equal(seconds({end:61000,remaining:60},1000),60);
 assert.equal(seconds({end:61000,remaining:60},60500),1);
 assert.equal(seconds({end:61000,remaining:60},90000),0);
});

test('optional local photo is bounded, safe to render and removed with its recipe',()=>{
 const store=storage(), photo='data:image/jpeg;base64,/9j/2Q==';
 offline.save(store,{...recipe(1),photo});
 assert.equal(offline.read(store)[0].photo,photo);
 for(const invalid of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,not base64','data:image/jpeg;base64,'+'A'.repeat(120000)])
   assert.throws(()=>offline.save(store,{...recipe(2),photo:invalid}));
 assert.equal(offline.read(store).length,1);
 offline.remove(store,1);assert.deepEqual(offline.read(store),[]);
});
