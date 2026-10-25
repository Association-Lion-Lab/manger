const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {Script}=require('node:vm');
const source=readFileSync(require('node:path').join(__dirname,'public/index.html'),'utf8').match(/^    async function postMeal[\s\S]*?(?=\n    function compatibleProteins)/m)[0];
test('client repas : création vide, remplacement ID zéro, retrait et conflit gardent leur intention',async()=>{
  const nodes=new Map(),requests=[];let close=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'Avant',contains:()=>false,setAttribute(){}});return nodes.get(id);};
  const state={meals:[]};
  const save=new Script(source+';postMeal').runInNewContext({document:{getElementById:node},state,URLSearchParams,AbortSignal,
    fetch:async(path,options)=>{requests.push({path,options});return {ok:false,json:async()=>({error:'Créneau modifié'})};},dialog:{close(){close++;}},load:async()=>{throw Error('Pas de relecture après refus');}});
  const payload={date:'2026-10-26',slot:'midi',title:'Bowl'};
  await save(payload);assert.equal(JSON.parse(requests[0].options.body).expectedId,null);
  state.meals=[{id:0,date:payload.date,slot:payload.slot}];
  await save(payload);assert.equal(JSON.parse(requests[1].options.body).expectedId,0);
  await save(null,'/api/meals?date=2026-10-26&slot=midi','DELETE');assert.match(requests[2].path,/expectedId=0/);
  assert.equal('body' in requests[2].options,false);assert.equal(close,0);assert.equal(node('dialog-error').textContent,'Créneau modifié');assert.equal(node('meal-fields').disabled,false);
});
