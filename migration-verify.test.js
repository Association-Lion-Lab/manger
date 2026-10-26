const test=require('node:test'),assert=require('node:assert/strict');
const {TABLES}=require('./migration-format');
const {verifyMigration}=require('./migration-verify');
test('comparaison de reprise : valeurs et octets, pas seulement les effectifs',()=>{
  const source=Object.fromEntries(TABLES.map(t=>[t.key,[]]));source['household.avoided_ingredients']=[{name:'\uFEFFcéleri'},{name:'tomate crue'}];
  const reverse=structuredClone(source);reverse['household.avoided_ingredients'].reverse();
  assert.equal(verifyMigration(source,reverse).tables,22);
  reverse['household.avoided_ingredients'][0].name='different';assert.throws(()=>verifyMigration(source,reverse),{code:'MANGER_TRANSFER_INVALID'});
});
test('départs de séquence : au moins un, épuisement refusé avant connexion',async()=>{
  const empty=Object.fromEntries(TABLES.map(t=>[t.key,[]]));const {sequenceStarts}=require('./postgres-transfer');
  empty['household.recipes']=[{id:-5}];assert.equal(sequenceStarts(empty).find(s=>s.sequence==='household.recipes_id_seq').next,1);
  empty['household.recipes']=[{id:Number.MAX_SAFE_INTEGER,title:'Limite',minutes:1,servings:1,tags:'',diet:'vegan',instructions:'',source_url:null}];
  await assert.rejects(require('./migrate-postgres').migratePostgres({connect(){assert.fail('Aucune connexion attendue');}},{tables:empty}),{code:'MANGER_TRANSFER_INVALID'});
});
