const {lockHousehold}=require('./household');
const {addDays}=require('../dates');
const {inputError,validateSlot,validateExpectedId,checkExpectedId,validateMealInput,checkMealReferences}=require('../meal');
function postgresMeals(db) {
  async function read(start,tx=db,end=addDays(start,6)) {
    const {rows}=await tx.query(`SELECT m.id::float8 AS id,m.date,m.slot,m.location,m.occasion,m.people,m.recipe_id::float8 AS "recipeId",
      m.title,r.minutes,m.leftover_of::float8 AS "leftoverOf",
      COALESCE((SELECT SUM(rest.people) FROM household.meals rest WHERE rest.leftover_of=m.id),0)::float8 AS "extraPortions",
      (EXISTS(SELECT 1 FROM household.meal_assignments WHERE meal_id=m.id))::int AS "hasVariants",
      COALESCE((SELECT json_agg(a ORDER BY a."memberId") FROM
        (SELECT member_id::float8 AS "memberId",protein_id::float8 AS "proteinId",portions FROM household.meal_assignments WHERE meal_id=m.id) a),'[]'::json) AS assignments,
      COALESCE((SELECT json_agg(d ORDER BY d."memberId") FROM
        (SELECT member_id::float8 AS "memberId",recipe_id::float8 AS "recipeId",protein_id::float8 AS "proteinId",portions,recipes.minutes
          FROM household.meal_dishes JOIN household.recipes ON recipes.id=recipe_id WHERE meal_id=m.id) d),'[]'::json) AS dishes
      FROM household.meals m LEFT JOIN household.recipes r ON r.id=m.recipe_id
      WHERE m.date BETWEEN $1 AND $2 ORDER BY m.date COLLATE "C",m.slot COLLATE "C"`,[start,end]);
    return rows.map(({dishes,assignments,...meal})=>dishes.length?{...meal,minutes:Math.max(...dishes.map(d=>d.minutes)),dishes:dishes.map(({minutes,proteinId,...dish})=>({...dish,...(proteinId==null?{}:{proteinId})}))}:{...meal,assignments});
  }
  const write=work=>db.transaction(async tx=>{await lockHousehold(tx);return work(tx);});
  async function references(tx) {
    const members=(await tx.query('SELECT id::float8 AS id,diet FROM household.members')).rows;
    const proteins=(await tx.query('SELECT id::float8 AS id,category FROM household.proteins')).rows;
    const recipes=(await tx.query('SELECT id::float8 AS id,diet FROM household.recipes')).rows;
    return {members,proteins,recipes};
  }
  async function current(tx,date,slot,expectedId) {
    const row=(await tx.query(`SELECT id::float8 AS id,EXISTS(SELECT 1 FROM household.meals rest WHERE rest.leftover_of=m.id) AS used
      FROM household.meals m WHERE date=$1 AND slot=$2`,[date,slot])).rows[0];
    checkExpectedId(row,expectedId);
    if(row?.used)throw inputError('Retire d’abord les repas de restes liés à ce repas.');
  }
  async function children(tx,id,meal) {
    await tx.query('DELETE FROM household.meal_assignments WHERE meal_id=$1',[id]);
    await tx.query('DELETE FROM household.meal_dishes WHERE meal_id=$1',[id]);
    const a=meal.assignments,d=meal.dishes;
    if(a.length)await tx.query(`INSERT INTO household.meal_assignments(meal_id,member_id,protein_id,portions)
      SELECT $1,a.* FROM unnest($2::bigint[],$3::bigint[],$4::int[]) a(member_id,protein_id,portions)`,[id,a.map(x=>x.memberId),a.map(x=>x.proteinId),a.map(x=>x.portions)]);
    if(d.length)await tx.query(`INSERT INTO household.meal_dishes(meal_id,member_id,recipe_id,portions,protein_id)
      SELECT $1,d.* FROM unnest($2::bigint[],$3::bigint[],$4::int[],$5::bigint[]) d(member_id,recipe_id,portions,protein_id)`,[id,d.map(x=>x.memberId),d.map(x=>x.recipeId),d.map(x=>x.portions),d.map(x=>x.proteinId??null)]);
  }
  async function saveIn(tx,meal,expectedId) {
      checkMealReferences(meal,await references(tx));await current(tx,meal.date,meal.slot,expectedId);
      const {rows:[row]}=await tx.query(`INSERT INTO household.meals(date,slot,location,occasion,people,recipe_id,title) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(date,slot) DO UPDATE SET location=excluded.location,occasion=excluded.occasion,people=excluded.people,
        recipe_id=excluded.recipe_id,title=excluded.title,leftover_of=NULL RETURNING id::float8 AS id`,[meal.date,meal.slot,meal.location,meal.occasion,meal.people,meal.recipeId,meal.title]);
      await children(tx,row.id,meal);return row.id;
  }
  function save(input,expectedId) {
    const meal=validateMealInput(input);validateExpectedId(expectedId);
    return write(async tx=>{await saveIn(tx,meal,expectedId);return meal;});
  }
  function remove(date,slot,expectedId) {
    validateSlot(date,slot);validateExpectedId(expectedId);
    return write(async tx=>{await current(tx,date,slot,expectedId);await tx.query('DELETE FROM household.meals WHERE date=$1 AND slot=$2',[date,slot]);return true;});
  }
  return Object.freeze({engine:'postgres',read,save,remove,...require('./planning-postgres').postgresPlanning(db,{write,read,references,saveIn,children})});
}
module.exports={postgresMeals};
