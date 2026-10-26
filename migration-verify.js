const {createHash}=require('node:crypto');
const {TABLES,kind,validateTables}=require('./migration-format');
const transferError=()=>Object.assign(new Error('Reprise refusée : cible ou comparaison incompatible.'),{code:'MANGER_TRANSFER_INVALID'});
function canonical(table,rows){
  return rows.map(row=>JSON.stringify(table.columns.map(c=>Buffer.isBuffer(row[c])?{$binary:row[c].toString('base64')}:row[c]))).sort();
}
function verifyMigration(expected,actual,{includeAuth=true}={}){
  try{validateTables(expected,{includeAuth});validateTables(actual,{includeAuth});}catch{throw transferError();}
  const counts={},fingerprints={};let tables=0;
  for(const table of TABLES.filter(t=>includeAuth||t.schema==='household')){
    const before=canonical(table,expected[table.key]),after=canonical(table,actual[table.key]);
    if(before.length!==after.length||before.some((value,index)=>value!==after[index]))throw transferError();
    tables++;counts[table.key]=before.length;fingerprints[table.key]=createHash('sha256').update(JSON.stringify(before)).digest('hex');
  }
  return {tables,counts,fingerprints};
}
async function readPostgresTables(tx,{includeAuth=true}={}){
  const data={};for(const table of TABLES.filter(t=>includeAuth||t.schema==='household')){
    const columns=table.columns.map(c=>kind(table,c)==='integer'?`"${c}"::float8 AS "${c}"`:`"${c}"`);
    data[table.key]=(await tx.query(`SELECT ${columns.join(',')} FROM ${table.key}`)).rows;
  }
  return data;
}
module.exports={verifyMigration,readPostgresTables,transferError};
