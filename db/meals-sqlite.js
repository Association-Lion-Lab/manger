const {addDays}=require('../dates');
const {inputError,validateSlot,checkExpectedId,validateExpectedId,validateMealInput,checkMealReferences}=require('../meal');
function sqliteMeals(db) {
  const references=()=>({members:db.prepare('SELECT id,diet FROM members').all(),proteins:db.prepare('SELECT id,category FROM proteins').all(),recipes:db.prepare('SELECT id,diet FROM recipes').all()});
  function write(work) {
    db.exec('BEGIN IMMEDIATE');
    try {const result=work();db.exec('COMMIT');return result;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  function read(start,end=addDays(start,6)) {
    return db.prepare(`SELECT meals.id,date,slot,location,occasion,people,recipe_id AS recipeId,
      meals.title,recipes.minutes,leftover_of AS leftoverOf,
      COALESCE((SELECT SUM(rest.people) FROM meals rest WHERE rest.leftover_of=meals.id),0) AS extraPortions,
      EXISTS(SELECT 1 FROM meal_assignments WHERE meal_id=meals.id) AS hasVariants
      FROM meals LEFT JOIN recipes ON recipes.id=meals.recipe_id WHERE date BETWEEN ? AND ? ORDER BY date,slot`).all(start,end).map(meal=>{
      const dishes=db.prepare('SELECT member_id AS memberId,recipe_id AS recipeId,protein_id AS proteinId,portions,recipes.minutes FROM meal_dishes JOIN recipes ON recipes.id=meal_dishes.recipe_id WHERE meal_id=? ORDER BY member_id').all(meal.id);
      const assignments=db.prepare('SELECT member_id AS memberId,protein_id AS proteinId,portions FROM meal_assignments WHERE meal_id=? ORDER BY member_id').all(meal.id);
      return dishes.length?{...meal,minutes:Math.max(...dishes.map(d=>d.minutes)),dishes:dishes.map(({minutes,proteinId,...d})=>({...d,...(proteinId==null?{}:{proteinId})}))}:{...meal,assignments};
    });
  }
  function protectSource(date,slot) {
    if(db.prepare('SELECT 1 FROM meals rest JOIN meals source ON source.id=rest.leftover_of WHERE source.date=? AND source.slot=?').get(date,slot))throw inputError('Retire d’abord les repas de restes liés à ce repas.');
  }
  function saveIn(meal,expectedId) {
    const current=db.prepare('SELECT id FROM meals WHERE date=? AND slot=?').get(meal.date,meal.slot);
    checkExpectedId(current,expectedId);protectSource(meal.date,meal.slot);
    db.prepare(`INSERT INTO meals(date,slot,location,occasion,people,recipe_id,title) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(date,slot) DO UPDATE SET location=excluded.location,occasion=excluded.occasion,
      people=excluded.people,recipe_id=excluded.recipe_id,title=excluded.title,leftover_of=NULL`).run(meal.date,meal.slot,meal.location,meal.occasion,meal.people,meal.recipeId,meal.title);
    const id=db.prepare('SELECT id FROM meals WHERE date=? AND slot=?').get(meal.date,meal.slot).id;
    children(id,meal);return id;
  }
  function children(id,meal){
    db.prepare('DELETE FROM meal_assignments WHERE meal_id=?').run(id);db.prepare('DELETE FROM meal_dishes WHERE meal_id=?').run(id);
    const insert=db.prepare('INSERT INTO meal_assignments(meal_id,member_id,protein_id,portions) VALUES(?,?,?,?)');
    for(const a of meal.assignments)insert.run(id,a.memberId,a.proteinId,a.portions);
    const dish=db.prepare('INSERT INTO meal_dishes(meal_id,member_id,recipe_id,portions,protein_id) VALUES(?,?,?,?,?)');
    for(const d of meal.dishes)dish.run(id,d.memberId,d.recipeId,d.portions,d.proteinId??null);
  }
  function save(input,expectedId) {
    const meal=validateMealInput(input);validateExpectedId(expectedId);
    return write(()=>{saveIn(checkMealReferences(meal,references()),expectedId);return meal;});
  }
  function remove(date,slot,expectedId) {
    validateSlot(date,slot);validateExpectedId(expectedId);
    return write(()=>{checkExpectedId(db.prepare('SELECT id FROM meals WHERE date=? AND slot=?').get(date,slot),expectedId);protectSource(date,slot);db.prepare('DELETE FROM meals WHERE date=? AND slot=?').run(date,slot);return true;});
  }
  return {engine:'sqlite',read,references,save,remove,...require('./planning-sqlite').sqlitePlanning(db,{write,read,references,saveIn,children})};
}
module.exports={sqliteMeals};
