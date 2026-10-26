const test=require('node:test'),assert=require('node:assert/strict');
const {TABLES}=require('./migration-format');
const {encodeHousehold,decodeHousehold,MAX_BACKUP_BYTES}=require('./household-backup');
function data(){const tables=Object.fromEntries(TABLES.filter(t=>t.schema==='household').map(t=>[t.key,[]]));tables['household.recipes']=[{id:1,title:'\uFEFFŒufs 🥣',minutes:10,servings:1,tags:'été',diet:'vegetarian',instructions:'',source_url:null}];tables['household.recipe_photos']=[{recipe_id:1,data:Buffer.from([255,216,0,217])}];tables['household.pantry']=[{id:0,food_key:Buffer.from('œuf\0pièce'),name:'œuf',unit:'pièce',amount:.123456789,recorded_on:'2026-11-01',use_by:null,explicit_lot:0}];return tables;}
test('sauvegarde foyer JSON : 18 tables, octets/Unicode/IDs/précision conservés, comptes exclus',()=>{
  const source=data(),bytes=encodeHousehold(source),parsed=JSON.parse(bytes.toString('utf8')),restored=decodeHousehold(bytes);
  assert.equal(parsed.format,'manger-household');assert.equal(parsed.version,1);assert.equal(Object.keys(parsed.tables).length,18);assert.ok(!Object.keys(parsed.tables).some(k=>k.startsWith('auth.')));
  assert.deepEqual(restored.tables,source);restored.tables['household.recipe_photos'][0].data[0]=0;assert.equal(source['household.recipe_photos'][0].data[0],255);
  assert.throws(()=>encodeHousehold({...source,'auth.accounts':[]}),{code:'MANGER_BACKUP_FORMAT'});
});
test('sauvegarde foyer JSON : format/version, base64 non canonique, champs ajoutés et UTF8 invalides refusés',()=>{
  const initial=JSON.parse(encodeHousehold(data()));
  for(const change of [d=>d.version=2,d=>d.format='manger-recipes',d=>d.extra=1,d=>d.tables['household.recipe_photos'][0].data.base64='YQ',d=>d.tables['household.recipe_photos'][0].data.extra=1,d=>d.tables['household.recipes'][0].title='\ud800',d=>d.tables['household.recipes'][0].title='\udc00',d=>d.tables['household.members']=[{id:1,name:'Admin',diet:'vegan',avoided_ingredients:'["\\ud800"]'}]]){const copy=structuredClone(initial);change(copy);assert.throws(()=>decodeHousehold(Buffer.from(JSON.stringify(copy))),{code:'MANGER_BACKUP_INPUT'});}
  assert.throws(()=>decodeHousehold(Buffer.from([255,123,125])),{code:'MANGER_BACKUP_INPUT'});
});
test('sauvegarde foyer : 32 Mio maximum vérifiés avant analyse',()=>{
  assert.throws(()=>decodeHousehold(Buffer.alloc(MAX_BACKUP_BYTES+1)),{code:'MANGER_BACKUP_TOO_LARGE'});
  const source=data();source['household.avoided_ingredients']=[{name:'x'.repeat(MAX_BACKUP_BYTES)}];assert.throws(()=>encodeHousehold(source),{code:'MANGER_BACKUP_TOO_LARGE'});
});
