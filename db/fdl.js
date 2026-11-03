const {lockHousehold}=require('./household');
const {postgresRecipes}=require('./recipes');
const {version:validVersion}=require('../fdl-format');
const lostLink=()=>Object.assign(new Error('La liaison FDL a changé. Recommence depuis Compte.'),{code:'MANGER_FDL_LINK',status:409});

function postgresFdl(db){
  const recipes=postgresRecipes(db);
  const write=work=>db.transaction(async tx=>{await lockHousehold(tx);return work(tx);});
  const link=async(tx=db)=>(await tx.query('SELECT origin,client_origin AS "clientOrigin",token,linked_at AS "linkedAt" FROM household.fdl_link WHERE id=1')).rows[0]||null;
  async function requireLink(tx,expected){
    const current=await link(tx);
    if(!current||!expected||current.token!==expected.token||current.origin!==expected.origin)throw lostLink();
  }
  const adminWrite=(authorize,work)=>db.transaction(async tx=>{
    if(authorize&&!await authorize(tx))throw Object.assign(lostLink(),{status:403});
    await lockHousehold(tx);return work(tx);
  });
  const setLink=(value,{authorize}={})=>adminWrite(authorize,async tx=>{
    await tx.query(`INSERT INTO household.fdl_link(id,origin,client_origin,token) VALUES(1,$1,$2,$3)
      ON CONFLICT(id) DO UPDATE SET origin=excluded.origin,client_origin=excluded.client_origin,token=excluded.token,linked_at=now()`,[value.origin,value.clientOrigin,value.token]);
  });
  const clearLink=(token,{authorize}={})=>adminWrite(authorize,tx=>tx.query('DELETE FROM household.fdl_link WHERE ($1::text IS NULL OR token=$1)',[token??null]));
  const copies=async(tx=db)=>(await tx.query(`SELECT f.recipe_id::float8 AS "recipeId",f.origin,f.fdl_id AS "fdlId",f.version,
    f.available_version AS "availableVersion",f.skipped_version AS "skippedVersion",f.modified,f.removed,f.metadata,r.title
    FROM household.fdl_copies f JOIN household.recipes r ON r.id=f.recipe_id ORDER BY f.recipe_id`)).rows;
  const notices=async()=>(await db.query('SELECT id::float8 AS id,title,created_at AS "createdAt" FROM household.fdl_notices ORDER BY id')).rows;
  const clearNotices=()=>write(tx=>tx.query('DELETE FROM household.fdl_notices'));
  const importCopy=(recipe,source,expected)=>write(async tx=>{
    await requireLink(tx,expected);
    if((await tx.query('SELECT 1 FROM household.fdl_copies WHERE origin=$1 AND fdl_id=$2',[source.origin,source.fdlId])).rowCount)return 'already-imported';
    const saved=await recipes.saveIn(tx,recipe,null);
    await tx.query('INSERT INTO household.fdl_copies(recipe_id,origin,fdl_id,version,metadata) VALUES($1,$2,$3,$4,$5)',[saved.id,source.origin,source.fdlId,source.version,source.metadata]);
    return {...saved,fdl:{origin:source.origin,id:source.fdlId,version:source.version,removed:false,metadata:source.metadata}};
  });
  async function removeIn(tx,id){
    const copy=(await tx.query('SELECT r.title FROM household.fdl_copies f JOIN household.recipes r ON r.id=f.recipe_id WHERE f.recipe_id=$1 AND NOT f.removed',[id])).rows[0];
    if(!copy)return;
    const used=(await tx.query('SELECT 1 FROM household.meals WHERE recipe_id=$1 UNION ALL SELECT 1 FROM household.meal_dishes WHERE recipe_id=$1 LIMIT 1',[id])).rowCount;
    if(!used)await tx.query('DELETE FROM household.recipes WHERE id=$1',[id]);
    else{
      await tx.query("UPDATE household.recipes SET title='Recette retirée de FDL',instructions='',source_url=NULL,tags='' WHERE id=$1",[id]);
      for(const table of ['recipe_ingredients','recipe_steps','recipe_photos','recipe_notes','recipe_favorites'])await tx.query(`DELETE FROM household.${table} WHERE recipe_id=$1`,[id]);
      await tx.query("INSERT INTO household.recipe_steps(recipe_id,position,kind,instruction) VALUES($1,1,'serve','Recette retirée par la modération de FDL.')",[id]);
      await tx.query("UPDATE household.fdl_copies SET removed=true,available_version=NULL,metadata='{}' WHERE recipe_id=$1",[id]);
    }
    await tx.query('INSERT INTO household.fdl_notices(title) VALUES($1)',[copy.title]);
  }
  const applyStates=(expected,states)=>write(async tx=>{
    await requireLink(tx,expected);
    for(const item of states){
      const copy=(await tx.query('SELECT 1 FROM household.fdl_copies WHERE recipe_id=$1 AND origin=$2 AND NOT removed',[item.recipeId,expected.origin])).rowCount;
      if(!copy)continue;
      if(item.state==='removed')await removeIn(tx,item.recipeId);
      else if(['published','private'].includes(item.state)&&validVersion(item.version)){
        await tx.query(`UPDATE household.fdl_copies SET available_version=greatest(coalesce(available_version,0),$2)
          WHERE recipe_id=$1 AND version<$2 AND coalesce(skipped_version,0)<$2`,[item.recipeId,item.version]);
      }
    }
  });
  const applyUpdate=(id,recipe,version,metadata,expected)=>write(async tx=>{
    await requireLink(tx,expected);
    const copy=(await tx.query('SELECT version,fdl_id FROM household.fdl_copies WHERE recipe_id=$1 AND origin=$2 AND NOT removed',[id,expected.origin])).rows[0];
    if(!copy||copy.version>=version)return 'unknown-recipe';
    const saved=await recipes.saveIn(tx,recipe,id);
    await tx.query('UPDATE household.fdl_copies SET version=$2,available_version=NULL,modified=false,metadata=$3 WHERE recipe_id=$1',[id,version,metadata]);
    return {...saved,fdl:{origin:expected.origin,id:copy.fdl_id,version,removed:false,metadata}};
  });
  const skipUpdate=id=>write(tx=>tx.query('UPDATE household.fdl_copies SET skipped_version=available_version,available_version=NULL WHERE recipe_id=$1 AND NOT removed',[id]));
  return Object.freeze({link,setLink,clearLink,copies,notices,clearNotices,importCopy,applyStates,applyUpdate,skipUpdate});
}
module.exports={postgresFdl,lostLink};
