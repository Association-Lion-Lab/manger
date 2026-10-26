const assert=require('node:assert/strict');
async function shoppingHttpContract(t,{request,login,failDatabase}){
  let cookie,id;const start='2026-11-02',manual={weekStart:start,name:'Pain',unit:'pièce',amount:2,aisle:'Épicerie'};
  await t.test('authentification et origine gardées sur les routes agrégées',async()=>{
    assert.equal((await request(`/api/week?start=${start}`)).status,401);cookie=await login();
    assert.equal((await request('/api/shopping-manual','POST',manual,cookie,'https://untrusted.invalid')).status,403);
  });
  await t.test('ajout, édition conflictuelle, rayons, coches et synchronisation',async()=>{
    let r=await request('/api/shopping-manual','POST',manual,cookie);assert.equal(r.status,201);id=(await r.json()).id;
    r=await request(`/api/shopping-manual/${id}`,'PUT',{...manual,amount:3,previous:manual},cookie);assert.equal(r.status,200);
    assert.equal((await request(`/api/shopping-manual/${id}`,'PUT',{...manual,amount:4,previous:manual},cookie)).status,409);
    assert.equal((await request('/api/shopping-aisles','POST',{...manual,manualId:id,aisle:'Frais'},cookie)).status,200);
    let rows=await(await request(`/api/shopping?start=${start}`,'GET',undefined,cookie)).json();assert.equal(rows[0].amount,3);assert.equal(rows[0].aisle,'Frais');
    r=await request('/api/shopping-checks/sync','POST',{weekStart:start,items:rows},cookie);assert.deepEqual(await r.json(),{accepted:[0],rejected:[]});
    rows=await(await request(`/api/shopping?start=${start}`,'GET',undefined,cookie)).json();assert.equal(rows[0].checked,true);
    const week=await(await request(`/api/week?start=${start}`,'GET',undefined,cookie)).json();assert.deepEqual(week.shopping,rows);assert.ok(Array.isArray(week.recipes)&&Array.isArray(week.meals));
    assert.equal((await request('/api/shopping-checks','POST',{...manual,manualId:id,checked:false},cookie)).status,200);
    assert.equal((await request(`/api/shopping-manual/${id}`,'DELETE',undefined,cookie)).status,200);
    assert.equal((await request('/api/shopping?start=wrong','GET',undefined,cookie)).status,400);
  });
  await t.test('erreurs de stockage privées et récupération',async()=>{
    const resume=failDatabase();try{const r=await request(`/api/week?start=${start}`,'GET',undefined,cookie);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/password|SELECT|absent|private|SQL/i);}finally{resume();}
    assert.equal((await request(`/api/week?start=${start}`,'GET',undefined,cookie)).status,200);
  });
  return {cookie};
}
module.exports={shoppingHttpContract};
