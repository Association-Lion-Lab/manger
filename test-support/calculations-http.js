const assert=require('node:assert/strict');
async function calculationHttp(t,{request,login,failDatabase}){
  let cookie;
  await t.test('connexion et origine restent obligatoires',async()=>{
    assert.equal((await request('/api/pantry')).status,401);cookie=await login();
    assert.equal((await request('/api/pantry','POST',{name:'riz',unit:'g',amount:100},cookie,'https://untrusted.invalid')).status,403);
  });
  await t.test('stock, recherche et aperçu gardent leurs formats et refus',async()=>{
    let r=await request('/api/pantry','POST',{name:'RIZ',unit:'g',amount:100},cookie);assert.equal(r.status,200);const rows=await r.json();assert.equal(rows[0].name,'riz');
    assert.equal((await request('/api/suggestions?maxMinutes=0','GET',undefined,cookie)).status,400);
    assert.equal((await request('/api/suggestions?start=2026-11-02&date=2026-11-09','GET',undefined,cookie)).status,400);
    for(const input of [{amount:0},{name:'bad\0name'},{useBy:'2026-02-30'}])assert.equal((await request('/api/pantry','POST',{name:'riz',unit:'g',amount:1,...input},cookie)).status,400);
    assert.equal((await request('/api/week/preview','POST',{},cookie)).status,400);
    r=await request('/api/pantry','POST',undefined,cookie,undefined,'{');assert.equal(r.status,400);
    assert.equal((await request('/api/pantry','POST',undefined,cookie,undefined,JSON.stringify({name:'x'.repeat(33000)}))).status,400);
    r=await request('/api/suggestions','GET',undefined,cookie);assert.equal(r.status,200);assert.ok(Array.isArray(await r.json()));
    r=await request(`/api/pantry/${rows[0].id}`,'DELETE',undefined,cookie);assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);
  });
  await t.test('erreur de stockage privée, puis récupération explicite',async()=>{
    const resume=failDatabase();let response;try{response=await request('/api/pantry','GET',undefined,cookie);assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/password|SELECT|absent|private|SQL/i);}finally{resume();}
    assert.equal((await request('/api/pantry','GET',undefined,cookie)).status,200);
  });
}
module.exports={calculationHttp};
