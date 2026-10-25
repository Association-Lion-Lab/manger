const assert=require('node:assert/strict');
const {recipeDraft}=require('./recipe-fixture');
const catalog=require('../catalog');

async function extrasHttpContract(t,{request,login,read,failDatabase,seedLegacyIds}) {
  let cookie,saved;const send=(path,method='GET',data)=>request(path,method,data,cookie);
  const preview=recipes=>send('/api/recipes/import-preview','POST',{kind:'file',data:{format:'manger-recipes',version:1,recipes}});
  await t.test('photos/export et mutations réservés au compte, origine vérifiée',async()=>{
    for(const [path,method] of [['/api/recipes/1/photo','GET'],['/api/recipes/export','GET'],['/api/recipes/1/favorite','PUT'],['/api/recipes/1/notes','PUT'],['/api/recipes/import-preview','POST'],['/api/catalog/import','POST']])assert.equal((await request(path,method,method==='GET'?undefined:{})).status,401);
    cookie=await login();assert.equal((await request('/api/catalog/import','POST',{},cookie,'https://untrusted.invalid')).status,403);
  });
  await t.test('photo prioritaire : octets et en-têtes identiques, absence en 404',async()=>{
    const create=await send('/api/recipes','POST',recipeDraft({photo:'data:image/jpeg;base64,/9j/2Q=='}));assert.equal(create.status,201);saved=await create.json();
    const photo=await send(`/api/recipes/${saved.id}/photo`);assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/jpeg');assert.equal(photo.headers.get('cache-control'),'no-store');assert.equal(photo.headers.get('x-content-type-options'),'nosniff');
    assert.equal(photo.headers.get('content-length'),'4');assert.deepEqual(Buffer.from(await photo.arrayBuffer()),Buffer.from([255,216,255,217]));
    assert.equal((await send('/api/recipes/9000000000/photo')).status,404);assert.equal((await read()).find(r=>r.id===saved.id).hasPhoto,true);
  });
  await t.test('favori répété et avis canonique/remis à zéro, limites strictes et UTF-16',async()=>{
    for(let i=0;i<2;i++){const r=await send(`/api/recipes/${saved.id}/favorite`,'PUT',{favorite:true});assert.equal(r.status,200);assert.deepEqual(await r.json(),{favorite:true});}
    assert.equal((await read()).find(r=>r.id===saved.id).favorite,true);
    let r=await send(`/api/recipes/${saved.id}/notes`,'PUT',{rating:4,note:' À refaire. '});assert.equal(r.status,200);assert.deepEqual(await r.json(),{rating:4,note:'À refaire.'});
    r=await send(`/api/recipes/${saved.id}/notes`,'PUT',{rating:0,note:' '.repeat(2000)});assert.equal(r.status,200);assert.deepEqual(await r.json(),{rating:0,note:''});
    const before=await read();
    for(const value of [null,{}, {favorite:'true'},{favorite:1},{favorite:true,padding:'x'.repeat(32769)}])assert.equal((await send(`/api/recipes/${saved.id}/favorite`,'PUT',value)).status,400);
    for(const value of [{rating:6,note:''},{rating:1.5,note:''},{rating:2,note:' '.repeat(2001)},{rating:2,note:'🍅'.repeat(1001)},{rating:1,note:'a\0b'},{rating:2,note:'ok',padding:'x'.repeat(32769)}])assert.equal((await send(`/api/recipes/${saved.id}/notes`,'PUT',value)).status,400);
    for(const suffix of ['favorite','notes'])for(const id of ['9000000000','9007199254740992'])assert.equal((await send(`/api/recipes/${id}/${suffix}`,'PUT',suffix==='favorite'?{favorite:true}:{rating:1,note:''})).status,400);
    assert.equal((await send('/api/recipes/9007199254740992/photo')).status,400);assert.deepEqual(await read(),before);
  });
  await t.test('export léger et aperçu fichier sans écriture ni photo copiée',async()=>{
    const before=await read(),r=await send('/api/recipes/export');assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/manger-recettes\.json/);
    const data=await r.json();assert.equal(data.format,'manger-recipes');assert.equal(data.version,1);
    for(const value of data.recipes)for(const key of ['id','favorite','hasPhoto','rating','note','photo','photoCopyId'])assert.ok(!Object.hasOwn(value,key));
    const draft={...data.recipes[0],steps:[],photo:'bad',photoCopyId:saved.id,ingredients:[{name:'tomate',unit:'g',amount:1}]};
    const p=await preview([draft]);assert.equal(p.status,200);const result=await p.json();assert.deepEqual(result.recipes[0].steps,[]);assert.ok(!Object.hasOwn(result.recipes[0],'photo'));assert.ok(!Object.hasOwn(result.recipes[0],'photoCopyId'));
    assert.ok(result.warnings.some(w=>w.includes('étapes')));assert.ok(result.warnings.some(w=>w.includes('Cru/cuit')));
    for(const values of [[],Array(201).fill(recipeDraft()),[recipeDraft({steps:undefined})]])assert.equal((await preview(values)).status,400);
    assert.equal((await send('/api/recipes/import-preview','POST',{kind:'file',data:{...data,version:2}})).status,400);
    assert.equal((await send('/api/recipes/import-preview','POST',{kind:'file',data,padding:'x'.repeat(1048577)})).status,400);
    assert.equal((await send('/api/recipes/import-preview','POST',{kind:'url',url:'http://127.0.0.1/private'})).status,400);
    assert.deepEqual(await read(),before);
  });
  await t.test('catalogue réel préserve personnalisation/photo/avis et imports simultanés sans doublon',async()=>{
    assert.equal((await send(`/api/recipes/${saved.id}`,'PUT',recipeDraft({title:catalog[0].title,minutes:7}))).status,200);
    const before=(await read()).find(r=>r.id===saved.id),r=await send('/api/catalog/import','POST',{});assert.equal(r.status,200);assert.deepEqual(await r.json(),{added:99});
    assert.equal((await read()).length,100);assert.deepEqual((await read()).find(r=>r.id===saved.id),before);
    const target=(await read()).find(r=>r.id!==saved.id);assert.equal((await send(`/api/recipes/${target.id}`,'DELETE')).status,200);
    const imports=await Promise.all([send('/api/catalog/import','POST',{}),send('/api/catalog/import','POST',{})]);for(const item of imports)assert.equal(item.status,200);
    const counts=await Promise.all(imports.map(item=>item.json()));assert.deepEqual(counts.map(c=>c.added).sort(),[0,1]);assert.equal((await read()).length,100);
  });
  await t.test('pannes SQL privées, aperçu toujours sans base, reprise',async()=>{
    const before=await read(),undo=failDatabase();
    try {
      for(const [path,method,value] of [[`/api/recipes/${saved.id}/photo`,'GET'],['/api/recipes/export','GET'],[`/api/recipes/${saved.id}/favorite`,'PUT',{favorite:false}],[`/api/recipes/${saved.id}/notes`,'PUT',{rating:3,note:'Après'}],['/api/catalog/import','POST',{}]]){
        const r=await send(path,method,value);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SELECT|private|password|household\./i);
      }
      assert.equal((await preview([recipeDraft()])).status,200);
    } finally {undo();}
    assert.deepEqual(await read(),before);
  });
  await t.test('zéro et grands IDs préservés pour photo, favori et avis',async()=>{
    await seedLegacyIds();
    for(const id of [0,5000000001]){
      assert.equal((await send(`/api/recipes/${id}/photo`)).status,404);
      assert.equal((await send(`/api/recipes/${id}`,'PUT',recipeDraft({photo:'data:image/jpeg;base64,/9j/2Q=='}))).status,200);
      assert.equal((await send(`/api/recipes/${id}/photo`)).status,200);
      assert.equal((await send(`/api/recipes/${id}/favorite`,'PUT',{favorite:true})).status,200);
      assert.equal((await send(`/api/recipes/${id}/notes`,'PUT',{rating:3,note:'Conservé'})).status,200);
    }
    assert.equal((await send('/api/account')).status,200);
  });
}
module.exports={extrasHttpContract};
