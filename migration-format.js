const {isDateKey}=require('./dates');
const household={
  recipes:'id title minutes servings tags diet instructions source_url',ingredients:'id name unit',
  recipe_ingredients:'recipe_id ingredient_id amount preparation',recipe_steps:'id recipe_id position kind instruction minutes',
  members:'id name diet avoided_ingredients',proteins:'id name category amount unit',
  meals:'id date slot location occasion people recipe_id title leftover_of',
  meal_assignments:'meal_id member_id protein_id portions',meal_dishes:'meal_id member_id recipe_id portions protein_id',
  shopping_checks:'week_start name unit',shopping_manual:'id week_start name amount unit aisle checked',shopping_aisles:'name unit aisle sort_order',
  recipe_favorites:'recipe_id',avoided_ingredients:'name',recipe_photos:'recipe_id data',
  pantry:'id food_key name unit amount recorded_on use_by explicit_lot',recipe_notes:'recipe_id rating note',
  week_templates:'id name source_start meals_json created_at'
};
const auth={accounts:'id username password admin active',sessions:'token account_id expires',attempts:'key count expires',invitations:'id token creator expires'};
const TABLES=Object.freeze([...[...Object.entries(household)].map(([name,columns])=>({schema:'household',name,columns:columns.split(' ')})),...Object.entries(auth).map(([name,columns])=>({schema:'auth',name,columns:columns.split(' ')}))].map(t=>Object.freeze({...t,key:`${t.schema}.${t.name}`})));
const integerNames=new Set('id recipe_id ingredient_id position minutes servings meal_id member_id protein_id portions people leftover_of checked rating explicit_lot admin active account_id creator expires count sort_order'.split(' '));
const nullable=new Set('recipes.source_url recipe_steps.minutes meals.recipe_id meals.leftover_of meal_dishes.protein_id pantry.use_by'.split(' '));
function sourceError(){return Object.assign(new Error('Source de données invalide ou incompatible. Aucun contenu privé n’est affiché.'),{code:'MANGER_SOURCE_INVALID'});}
function kind(table,column){return column==='food_key'||(table.name==='recipe_photos'&&column==='data')?'binary':column==='amount'?'number':integerNames.has(column)?'integer':'text';}
function validScalar(table,column,value){
  if(value===null)return nullable.has(`${table.name}.${column}`);
  const type=kind(table,column);
  if(type==='binary')return Buffer.isBuffer(value);
  if(type==='text')return typeof value==='string'&&value.isWellFormed()&&!value.includes('\0');
  if(type==='number')return typeof value==='number'&&Number.isFinite(value);
  const wide=column==='id'||column.endsWith('_id')||['creator','expires','sort_order','leftover_of'].includes(column);
  return Number.isSafeInteger(value)&&(wide||value>=-2147483648&&value<=2147483647);
}
const keyValue=value=>Buffer.isBuffer(value)?{$hex:value.toString('hex')}:value;
const keyFor=(row,columns)=>JSON.stringify(columns.map(column=>keyValue(row[column])));
function wellFormedJson(value){
  const pending=[value];
  while(pending.length){const item=pending.pop();if(typeof item==='string'&&!item.isWellFormed())return false;if(item&&typeof item==='object'){for(const key of Object.keys(item)){if(!key.isWellFormed())return false;pending.push(item[key]);}}}
  return true;
}
function uniqueness(table,rows){
  const keys={ingredients:[['name','unit']],recipe_ingredients:[['recipe_id','ingredient_id']],recipe_steps:[['recipe_id','position']],members:[['name']],proteins:[['name']],meals:[['date','slot']],meal_assignments:[['meal_id','member_id']],meal_dishes:[['meal_id','member_id']],shopping_checks:[['week_start','name','unit']],shopping_aisles:[['name','unit'],['sort_order']],pantry:[['food_key']],accounts:[['username']],invitations:[['token']],week_templates:[['name']]};
  const primary=table.columns.includes('id')?['id']:['recipe_photos','recipe_notes','recipe_favorites'].includes(table.name)?['recipe_id']:table.name==='avoided_ingredients'?['name']:table.name==='sessions'?['token']:table.name==='attempts'?['key']:null;
  for(const columns of [...(primary?[primary]:[]),...(keys[table.name]||[])])if(new Set(rows.map(row=>keyFor(row,columns))).size!==rows.length)throw sourceError();
}
function rowRules(table,row){
  const oneOf=(column,values)=>{if(!values.includes(row[column]))throw sourceError();};
  const range=(column,min,max=Infinity)=>{if(row[column]<min||row[column]>max)throw sourceError();};
  if(['recipes','members'].includes(table.name))oneOf('diet',['vegan','vegetarian','pescetarian','omnivore']);
  if(table.name==='recipes'){range('minutes',1);range('servings',1);}
  if(['pantry','proteins','recipe_ingredients'].includes(table.name)&&row.amount<=0)throw sourceError();
  if(table.name==='recipe_ingredients')oneOf('preparation',['unknown','raw','cooked']);
  if(table.name==='recipe_steps'){oneOf('kind',['prep','cook','rest','serve']);range('position',1);if(row.minutes!==null)range('minutes',0,1440);}
  if(table.name==='proteins')oneOf('category',['plant','egg','fish','meat']);
  if(table.name==='meals'){oneOf('slot',['midi','soir']);oneOf('location',['home','outside','restaurant']);oneOf('occasion',['regular','date','guests']);range('people',1,100);}
  if(['meal_assignments','meal_dishes'].includes(table.name))range('portions',1,20);
  if(table.name==='recipe_notes')range('rating',0,5);
  for(const column of ['checked','explicit_lot','admin','active'])if(table.columns.includes(column))oneOf(column,[0,1]);
  if(table.name==='invitations'&&row.id!==1)throw sourceError();
  for(const column of ['date','week_start','recorded_on','use_by','source_start'])if(table.columns.includes(column)&&row[column]!==null&&!isDateKey(row[column]))throw sourceError();
  if(table.name==='members'||table.name==='week_templates'){
    let value;try{value=JSON.parse(row[table.name==='members'?'avoided_ingredients':'meals_json']);}catch{throw sourceError();}
    if(!Array.isArray(value)||!wellFormedJson(value)||(table.name==='members'&&value.some(i=>typeof i!=='string'||i.includes('\0'))))throw sourceError();
    if(table.name==='week_templates'){
      if(!require('./planning').monday(row.source_start)||!Number.isFinite(Date.parse(row.created_at))||new Date(row.created_at).toISOString()!==row.created_at)throw sourceError();
      try{require('./planning').checkedSource(value,row.source_start);}catch{throw sourceError();}
    }
  }
  if(table.name==='accounts'&&!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(row.password))throw sourceError();
  if(['sessions','invitations'].includes(table.name)&&!/^[a-f0-9]{64}$/.test(row.token))throw sourceError();
}
function relations(tables){
  const refs={recipe_ingredients:{recipe_id:'recipes',ingredient_id:'ingredients'},recipe_steps:{recipe_id:'recipes'},meals:{recipe_id:'recipes',leftover_of:'meals'},meal_assignments:{meal_id:'meals',member_id:'members',protein_id:'proteins'},meal_dishes:{meal_id:'meals',member_id:'members',recipe_id:'recipes',protein_id:'proteins'},recipe_photos:{recipe_id:'recipes'},recipe_notes:{recipe_id:'recipes'},recipe_favorites:{recipe_id:'recipes'},sessions:{account_id:'accounts'},invitations:{creator:'accounts'}};
  const ids=new Map(TABLES.filter(t=>t.columns.includes('id')).map(t=>[t.key,new Set((tables[t.key]||[]).map(row=>row.id))]));
  for(const table of TABLES)for(const [column,target] of Object.entries(refs[table.name]||{}))for(const row of tables[table.key]||[])if(row[column]!==null&&!ids.get(`${table.schema}.${target}`)?.has(row[column]))throw sourceError();
}
function validateTables(tables,{includeAuth=true}={}){
  const expected=TABLES.filter(t=>includeAuth||t.schema==='household');
  if(!tables||typeof tables!=='object'||Array.isArray(tables)||Object.keys(tables).sort().join(',')!==expected.map(t=>t.key).sort().join(','))throw sourceError();
  for(const table of expected){
    const rows=tables[table.key];if(!Array.isArray(rows))throw sourceError();
    for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!==[...table.columns].sort().join(','))throw sourceError();for(const column of table.columns)if(!validScalar(table,column,row[column]))throw sourceError();rowRules(table,row);}
    uniqueness(table,rows);
  }
  relations(tables);return tables;
}
module.exports={TABLES,kind,sourceError,validateTables,keyFor};
