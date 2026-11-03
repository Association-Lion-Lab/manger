const origin=value=>{
  try{const url=new URL(value);return typeof value==='string'&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.origin===value?value:null;}catch{return null;}
};
const remoteId=value=>typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)?value:null;
const version=value=>Number.isInteger(value)&&value>0&&value<=2147483647;
function metadata(projection){
  const result={};
  for(const key of ['author','licence','provenance','sourceUrl','url']){
    const value=projection[key];
    if(value!==undefined&&value!==null){
      if(typeof value!=='string'||value.length>2000||value.includes('\0')||!value.isWellFormed())throw new Error('Métadonnées FDL invalides.');
      result[key]=value;
    }
  }
  if(projection.seasons!==undefined){
    if(!Array.isArray(projection.seasons)||projection.seasons.length>4||projection.seasons.some(s=>typeof s!=='string'||s.length>40||s.includes('\0')||!s.isWellFormed()))throw new Error('Saisons FDL invalides.');
    result.seasons=projection.seasons;
  }
  return result;
}
function validateCopies(copies,tables){
  const ids=new Set(tables['household.recipes'].map(r=>r.id)),seen=new Set(),sources=new Set();
  if(!Array.isArray(copies)||copies.length>ids.size)throw new Error('Suivi FDL invalide.');
  for(const copy of copies){
    const fields='availableVersion,fdlId,metadata,modified,origin,recipeId,removed,skippedVersion,version';
    if(!copy||Object.keys(copy).sort().join(',')!==fields)throw new Error('Suivi FDL invalide.');
    if(!ids.has(copy.recipeId)||seen.has(copy.recipeId)||!origin(copy.origin)||!remoteId(copy.fdlId)||!version(copy.version))throw new Error('Référence FDL invalide.');
    if((copy.availableVersion!==null&&!version(copy.availableVersion))||(copy.skippedVersion!==null&&!version(copy.skippedVersion)))throw new Error('Version FDL invalide.');
    if(typeof copy.modified!=='boolean'||typeof copy.removed!=='boolean')throw new Error('État FDL invalide.');
    if(!copy.metadata||Array.isArray(copy.metadata)||Object.keys(copy.metadata).some(key=>!['author','licence','provenance','sourceUrl','url','seasons'].includes(key)))throw new Error('Provenance FDL invalide.');
    metadata(copy.metadata);const key=copy.origin+'/'+copy.fdlId;if(sources.has(key))throw new Error('Copie FDL en double.');seen.add(copy.recipeId);sources.add(key);
  }
  return copies;
}
const copyColumns='recipe_id::float8 AS "recipeId",origin,fdl_id AS "fdlId",version,available_version AS "availableVersion",skipped_version AS "skippedVersion",modified,removed,metadata';
const readCopies=async tx=>(await tx.query('SELECT '+copyColumns+' FROM household.fdl_copies ORDER BY recipe_id')).rows;
async function restoreCopies(tx,copies){
  for(const copy of copies)await tx.query(`INSERT INTO household.fdl_copies(recipe_id,origin,fdl_id,version,available_version,skipped_version,modified,removed,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[copy.recipeId,copy.origin,copy.fdlId,copy.version,copy.availableVersion,copy.skippedVersion,copy.modified,copy.removed,copy.metadata]);
}
module.exports={origin,remoteId,version,metadata,validateCopies,readCopies,restoreCopies};
