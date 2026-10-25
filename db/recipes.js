const {lockHousehold}=require('./household');

function postgresRecipes(db) {
  async function read(id=null,tx=db) {
    const {rows}=await tx.query(`SELECT r.id::float8 AS id,r.title,r.minutes,r.servings,r.tags,r.diet,r.source_url AS "sourceUrl",
      EXISTS(SELECT 1 FROM household.recipe_photos p WHERE p.recipe_id=r.id) AS "hasPhoto",
      EXISTS(SELECT 1 FROM household.recipe_favorites f WHERE f.recipe_id=r.id) AS favorite,
      (SELECT json_build_object('rating',n.rating,'note',n.note) FROM household.recipe_notes n WHERE n.recipe_id=r.id) AS feedback,
      COALESCE((SELECT json_agg(i ORDER BY i.name COLLATE "C") FROM
        (SELECT g.name,g.unit,l.amount,l.preparation FROM household.recipe_ingredients l
         JOIN household.ingredients g ON g.id=l.ingredient_id WHERE l.recipe_id=r.id) i),'[]'::json) AS ingredients,
      COALESCE((SELECT json_agg(s ORDER BY s.position) FROM
        (SELECT position,kind,instruction,minutes FROM household.recipe_steps WHERE recipe_id=r.id) s),'[]'::json) AS steps
      FROM household.recipes r WHERE ($1::bigint IS NULL OR r.id=$1) ORDER BY r.title COLLATE "C"`,[id]);
    return rows.map(({tags,feedback,...recipe})=>({...recipe,...feedback,tags:tags.split(',').filter(Boolean)}));
  }
  const write=work=>db.transaction(async tx=>{await lockHousehold(tx);return work(tx);});
  async function children(tx,id,recipe) {
    const names=recipe.ingredients.map(i=>i.name),units=recipe.ingredients.map(i=>i.unit);
    await tx.query(`INSERT INTO household.ingredients(name,unit) SELECT * FROM unnest($1::text[],$2::text[])
      ON CONFLICT(name,unit) DO NOTHING`,[names,units]);
    await tx.query(`INSERT INTO household.recipe_ingredients(recipe_id,ingredient_id,amount,preparation)
      SELECT $1,g.id,i.amount,i.preparation FROM unnest($2::text[],$3::text[],$4::float8[],$5::text[]) i(name,unit,amount,preparation)
      JOIN household.ingredients g ON g.name=i.name AND g.unit=i.unit`,
      [id,names,units,recipe.ingredients.map(i=>i.amount),recipe.ingredients.map(i=>i.preparation||'unknown')]);
    await tx.query(`INSERT INTO household.recipe_steps(recipe_id,position,kind,instruction,minutes)
      SELECT $1,s.* FROM unnest($2::integer[],$3::text[],$4::text[],$5::integer[]) s(position,kind,instruction,minutes)`,
      [id,recipe.steps.map(s=>s.position),recipe.steps.map(s=>s.kind),recipe.steps.map(s=>s.instruction),recipe.steps.map(s=>s.minutes)]);
  }
  async function photo(tx,id,recipe) {
    if(recipe.photoCopyId!==undefined&&recipe.photo===undefined)await tx.query(`INSERT INTO household.recipe_photos(recipe_id,data)
      SELECT $1,data FROM household.recipe_photos WHERE recipe_id=$2 ON CONFLICT(recipe_id) DO UPDATE SET data=excluded.data`,[id,recipe.photoCopyId]);
    if(recipe.photo===null)await tx.query('DELETE FROM household.recipe_photos WHERE recipe_id=$1',[id]);
    else if(recipe.photo!==undefined)await tx.query('INSERT INTO household.recipe_photos(recipe_id,data) VALUES($1,$2) ON CONFLICT(recipe_id) DO UPDATE SET data=excluded.data',[id,recipe.photo]);
  }
  const save=(recipe,id=null)=>write(async tx=>{
    const values=[recipe.title,recipe.minutes,recipe.servings,recipe.tags.join(','),recipe.diet,recipe.sourceUrl||null];
    if(id===null)id=(await tx.query(`INSERT INTO household.recipes(title,minutes,servings,tags,diet,source_url,instructions)
      VALUES($1,$2,$3,$4,$5,$6,'') RETURNING id::float8 AS id`,values)).rows[0].id;
    else {
      const result=await tx.query("UPDATE household.recipes SET title=$1,minutes=$2,servings=$3,tags=$4,diet=$5,source_url=$6,instructions='' WHERE id=$7 RETURNING id",[...values,id]);
      if(!result.rowCount)return 'unknown-recipe';
      await tx.query('DELETE FROM household.recipe_ingredients WHERE recipe_id=$1',[id]);
      await tx.query('DELETE FROM household.recipe_steps WHERE recipe_id=$1',[id]);
      await tx.query('UPDATE household.meals SET title=$1 WHERE recipe_id=$2',[recipe.title,id]);
    }
    await photo(tx,id,recipe);await children(tx,id,recipe);
    return (await read(id,tx))[0];
  });
  const remove=id=>write(async tx=>{
    const used=await tx.query('SELECT 1 FROM household.meals WHERE recipe_id=$1 UNION ALL SELECT 1 FROM household.meal_dishes WHERE recipe_id=$1 LIMIT 1',[id]);
    if(used.rowCount)return 'used-recipe';
    return (await tx.query('DELETE FROM household.recipes WHERE id=$1 RETURNING id',[id])).rowCount?true:'unknown-recipe';
  });
  return Object.freeze({engine:'postgres',read:()=>read(),save,remove});
}
module.exports={postgresRecipes};
