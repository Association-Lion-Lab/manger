const {DatabaseSync}=require('node:sqlite');
const {readFile,lstat,mkdtemp,rm}=require('node:fs/promises');
const {resolve,join,dirname,basename}=require('node:path');
const {tmpdir}=require('node:os');
const {createHash}=require('node:crypto');
const {TABLES,kind,sourceError,validateTables}=require('./migration-format');
const legacyOptional={recipes:['source_url','instructions','diet'],pantry:['use_by','explicit_lot'],members:['avoided_ingredients'],meal_dishes:['protein_id'],recipe_ingredients:['preparation'],meals:['leftover_of']};
const core=['recipes','recipe_ingredients','recipe_steps','ingredients','members','meals','pantry','proteins'];
const quote=name=>'"'+name+'"';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function sourceFile(filename){
  if(typeof filename!=='string'||!filename)throw sourceError();const path=resolve(filename),info=await lstat(path,{bigint:true});
  if(!info.isFile()||info.isSymbolicLink()||info.size>256n*1024n*1024n)throw sourceError();
  for(const suffix of ['-wal','-shm','-journal']){try{await lstat(path+suffix);throw sourceError();}catch(error){if(error.code!=='ENOENT')throw error;}}
  return {path,info,hash:digest(await readFile(path))};
}
function inspect(db,schema,version){
  db.exec('PRAGMA trusted_schema=OFF; PRAGMA ignore_check_constraints=ON');
  if(db.prepare('PRAGMA encoding').get().encoding!=='UTF-8')throw sourceError();
  if(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL").get())throw sourceError();
  const structure=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE substr(name,1,7)<>'sqlite_' AND type<>'index'").all(),specs=TABLES.filter(t=>t.schema===schema);
  for(const entry of structure){
    const spec=specs.find(t=>t.name===entry.name);if(!spec||entry.type!=='table'||/CREATE\s+VIRTUAL/i.test(entry.sql))throw sourceError();
    const columns=db.prepare(`PRAGMA table_xinfo(${quote(entry.name)})`).all(),expected=spec.columns.filter(c=>c!=='sort_order');
    if(columns.some(c=>c.hidden!==0||!expected.includes(c.name)))throw sourceError();
    for(const column of expected)if(!columns.some(c=>c.name===column)&&!(schema==='household'&&version<4&&legacyOptional[spec.name]?.includes(column)))throw sourceError();
    for(const column of columns){const type=kind(spec,column.name),declared=column.type.toUpperCase();if(declared!==(type==='integer'?'INTEGER':type==='number'?'REAL':spec.name==='recipe_photos'&&column.name==='data'?'BLOB':'TEXT'))throw sourceError();}
  }
  const required=schema==='auth'?['accounts','sessions','attempts']:version===4?specs.map(t=>t.name):[...core,...(version>=3?['week_templates']:[])];
  if(required.some(name=>!structure.some(t=>t.name===name)))throw sourceError();
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw sourceError();
}
function readTable(db,table){
  const present=db.prepare(`PRAGMA table_xinfo(${quote(table.name)})`).all().map(c=>c.name);
  if(!present.length)return [];
  const available=table.columns.filter(c=>c==='sort_order'||present.includes(c));
  const columns=available.map((c,i)=>{
    const expr=c==='sort_order'?'rowid':quote(c);
    return `${kind(table,c)==='text'||kind(table,c)==='binary'?`CAST(${expr} AS BLOB)`:expr} AS ${quote(c)},typeof(${expr}) AS ${quote('__type'+i)}`;
  });
  const statement=db.prepare(`SELECT ${columns.join(',')} FROM ${quote(table.name)} NOT INDEXED`);statement.setReadBigInts(true);
  return statement.all().map(raw=>{
    const row={};for(const [index,column] of available.entries()){
      let value=raw[column];const type=raw['__type'+index],expected=kind(table,column);
      if(type!=='null'){
        if(expected==='text'){if(type!=='text')throw sourceError();value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(value);}
        else if(expected==='binary'){if(type!=='blob'&&!(column==='food_key'&&type==='text'))throw sourceError();value=Buffer.from(value);}
        else{if(expected==='integer'?type!=='integer':!['integer','real'].includes(type))throw sourceError();if(typeof value==='bigint'){const number=Number(value);if(!Number.isSafeInteger(number))throw sourceError();value=number;}}
      }
      row[column]=value;
    }
    for(const column of table.columns.filter(c=>!available.includes(c))){
      const defaults={source_url:null,instructions:'',diet:'omnivore',use_by:null,explicit_lot:0,avoided_ingredients:'[]',protein_id:null,preparation:'unknown',leftover_of:null};
      if(!Object.hasOwn(defaults,column))throw sourceError();row[column]=defaults[column];
    }
    return row;
  });
}
function rebuild(path,schema,tables,version){
  const db=schema==='household'?require('./server').createDatabase(path,{seedData:false}):require('./accounts').openAccounts(path);
  try{
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    try{
      for(const table of TABLES.filter(t=>t.schema===schema)){
        const columns=table.columns.map(c=>quote(c==='sort_order'?'rowid':c));
        const placeholders=table.columns.map(c=>c==='food_key'?'CAST(? AS TEXT)':'?');
        const insert=db.prepare(`INSERT INTO ${quote(table.name)}(${columns.join(',')}) VALUES(${placeholders.join(',')})`);
        for(const row of tables[table.key])insert.run(...table.columns.map(c=>row[c]));
      }
      if(schema==='household')db.exec(`PRAGMA user_version=${version}`);
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw sourceError();db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }finally{db.close();}
  if(schema==='household'&&version<4)require('./server').createDatabase(path,{seedData:false}).close();
}
async function analyzeSource(input,{includeAuth=true}={}){
  let folder;const handles=[];
  try{
    const home=await sourceFile(input?.home),accounts=includeAuth?await sourceFile(input?.accounts):null;
    if(accounts&&(home.path===accounts.path||home.info.dev===accounts.info.dev&&home.info.ino===accounts.info.ino))throw sourceError();
    const originals=[home,...(accounts?[accounts]:[])],versions=[],raw={};
    for(const [index,source] of originals.entries()){
      const db=new DatabaseSync(source.path,{readOnly:true,allowExtension:false,defensive:true,limits:{length:256*1024*1024,sqlLength:1024*1024,column:64,exprDepth:100,attach:0,vdbeOp:100000}});
      try{
        const version=db.prepare('PRAGMA user_version').get().user_version,schema=index===0?'household':'auth';if(index===0?version<0||version>4:version!==0)throw sourceError();inspect(db,schema,version);versions.push(version);
        for(const table of TABLES.filter(t=>t.schema===schema))raw[table.key]=readTable(db,table);
      }finally{db.close();}
    }
    validateTables(raw,{includeAuth});
    folder=await mkdtemp(join(tmpdir(),'manger-source-'));const paths=[];
    for(const [index] of originals.entries()){const target=join(folder,index===0?'household.db':'accounts.db');rebuild(target,index===0?'household':'auth',raw,versions[index]);paths.push(target);}
    const tables={};
    for(const [index,path] of paths.entries()){
      const db=new DatabaseSync(path,{readOnly:true,allowExtension:false});handles.push(db);const schema=index===0?'household':'auth';inspect(db,schema,index===0?4:0);
      for(const table of TABLES.filter(t=>t.schema===schema))tables[table.key]=readTable(db,table);
    }
    validateTables(tables,{includeAuth});
    for(const source of originals){const after=await sourceFile(source.path);if(after.hash!==source.hash)throw sourceError();}
    return {tables,report:{sourceVersion:versions[0],normalizedVersion:4,counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),fingerprints:originals.map(s=>s.hash)}};
  }catch(error){throw error.code==='MANGER_SOURCE_INVALID'?error:sourceError();}
  finally{
    for(const db of handles)db.close();
    if(folder&&dirname(folder)===resolve(tmpdir())&&basename(folder).startsWith('manger-source-'))await rm(folder,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}
if(require.main===module){
  const [home,accounts,flag,...extra]=process.argv.slice(2);
  if(!home||!accounts||flag!=='--source-stopped'||extra.length){console.error('Usage : node migration-source.js copie-manger.db copie-accounts.db --source-stopped');process.exitCode=1;}
  else analyzeSource({home,accounts}).then(result=>console.log(JSON.stringify(result.report,null,2))).catch(()=>{console.error('Analyse refusée : copies arrêtées, complètes et compatibles requises. Aucun fichier source modifié.');process.exitCode=1;});
}
module.exports={analyzeSource,readTable};
