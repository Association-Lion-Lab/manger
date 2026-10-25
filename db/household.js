const {isCompatible}=require('../household');

// Future PostgreSQL meal writers must acquire this lock before reading profiles/proteins.
const lockHousehold=tx=>tx.query('SELECT pg_advisory_xact_lock(1296125511,4)');

function postgresHousehold(db) {
  async function write(work) {
    try {return await db.transaction(async tx=>{await lockHousehold(tx);return work(tx);});}
    catch(error) {
      const duplicates={members_name_key:'duplicate-member',proteins_name_key:'duplicate-protein'};
      if(error.code==='23505'&&duplicates[error.cause?.constraint])return duplicates[error.cause.constraint];
      throw error;
    }
  }
  async function read() {
    return (await db.query(`SELECT
      COALESCE((SELECT json_agg(name ORDER BY name COLLATE "C") FROM household.avoided_ingredients),'[]'::json) AS "avoidedIngredients",
      COALESCE((SELECT json_agg(m) FROM (SELECT id::float8 AS id,name,diet,avoided_ingredients::json AS "avoidedIngredients"
        FROM household.members ORDER BY name COLLATE "C") m),'[]'::json) AS members,
      COALESCE((SELECT json_agg(p) FROM (SELECT id::float8 AS id,name,category,amount,unit
        FROM household.proteins ORDER BY name COLLATE "C") p),'[]'::json) AS proteins`)).rows[0];
  }
  const setPreferences=names=>write(async tx=>{
    await tx.query('DELETE FROM household.avoided_ingredients');
    for(const name of names)await tx.query('INSERT INTO household.avoided_ingredients(name) VALUES($1)',[name]);
    return true;
  });
  const addMember=member=>write(async tx=>{
    const row=(await tx.query(`INSERT INTO household.members(name,diet,avoided_ingredients) VALUES($1,$2,$3)
      ON CONFLICT(name) DO NOTHING RETURNING id::float8 AS id`,[member.name,member.diet,JSON.stringify(member.avoidedIngredients||[])])).rows[0];
    return row?.id??'duplicate-member';
  });
  const editMember=(id,member)=>write(async tx=>{
    const result=await tx.query(`UPDATE household.members SET name=$1,diet=$2,avoided_ingredients=COALESCE($3,avoided_ingredients)
      WHERE id=$4 RETURNING id`,[member.name,member.diet,member.avoidedIngredients===undefined?null:JSON.stringify(member.avoidedIngredients),id]);
    return result.rowCount?true:'unknown-member';
  });
  const removeMember=id=>write(async tx=>(await tx.query('DELETE FROM household.members WHERE id=$1 RETURNING id',[id])).rowCount?true:'unknown-member');
  const addProtein=protein=>write(async tx=>{
    const row=(await tx.query(`INSERT INTO household.proteins(name,category,amount,unit) VALUES($1,$2,$3,$4)
      ON CONFLICT(name) DO NOTHING RETURNING id::float8 AS id`,[protein.name,protein.category,protein.amount,protein.unit])).rows[0];
    return row?.id??'duplicate-protein';
  });
  const editProtein=(id,protein)=>write(async tx=>{
    const diets=(await tx.query(`SELECT m.diet FROM household.meal_assignments a JOIN household.members m ON m.id=a.member_id WHERE a.protein_id=$1
      UNION ALL SELECT m.diet FROM household.meal_dishes d JOIN household.members m ON m.id=d.member_id WHERE d.protein_id=$1`,[id])).rows;
    if(diets.some(member=>!isCompatible(member.diet,protein.category)))return 'incompatible-protein';
    const result=await tx.query('UPDATE household.proteins SET name=$1,category=$2,amount=$3,unit=$4 WHERE id=$5 RETURNING id',
      [protein.name,protein.category,protein.amount,protein.unit,id]);
    return result.rowCount?true:'unknown-protein';
  });
  const removeProtein=id=>write(async tx=>{
    const used=await tx.query('SELECT 1 FROM household.meal_assignments WHERE protein_id=$1 UNION ALL SELECT 1 FROM household.meal_dishes WHERE protein_id=$1 LIMIT 1',[id]);
    if(used.rowCount)return 'used-protein';
    return (await tx.query('DELETE FROM household.proteins WHERE id=$1 RETURNING id',[id])).rowCount?true:'unknown-protein';
  });
  return Object.freeze({engine:'postgres',read,setPreferences,addMember,editMember,removeMember,addProtein,editProtein,removeProtein});
}
module.exports={postgresHousehold,lockHousehold};
