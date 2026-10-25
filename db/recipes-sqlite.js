function sqliteRecipes(db) {
  function write(work) {
    db.exec('BEGIN IMMEDIATE');
    try {const result=work();db.exec('COMMIT');return result;}
    catch(error) {db.exec('ROLLBACK');throw error;}
  }
  function read() {
    const ingredientQuery = db.prepare(`
      SELECT ingredients.name, ingredients.unit, recipe_ingredients.amount, recipe_ingredients.preparation
      FROM recipe_ingredients JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
      WHERE recipe_ingredients.recipe_id = ? ORDER BY ingredients.name
    `);
    const stepQuery = db.prepare(`
      SELECT position, kind, instruction, minutes
      FROM recipe_steps WHERE recipe_id = ? ORDER BY position
    `);
    return db.prepare('SELECT id, title, minutes, servings, tags, diet, source_url AS sourceUrl, EXISTS(SELECT 1 FROM recipe_photos WHERE recipe_id = recipes.id) AS hasPhoto, EXISTS(SELECT 1 FROM recipe_favorites WHERE recipe_id = recipes.id) AS favorite FROM recipes ORDER BY title').all()
      .map(recipe => ({
        ...recipe,
        favorite: Boolean(recipe.favorite),
        hasPhoto: Boolean(recipe.hasPhoto),
        ...db.prepare('SELECT rating, note FROM recipe_notes WHERE recipe_id = ?').get(recipe.id),
        tags: recipe.tags.split(',').filter(Boolean),
        ingredients: ingredientQuery.all(recipe.id),
        steps: stepQuery.all(recipe.id)
      }));
  }
  const save=(recipe,id=null)=>write(()=>{
    if (id == null) {
      id = Number(db.prepare('INSERT INTO recipes (title, minutes, servings, tags, diet, instructions) VALUES (?, ?, ?, ?, ?, ?)')
        .run(recipe.title, recipe.minutes, recipe.servings, recipe.tags.join(','), recipe.diet, '').lastInsertRowid);
    } else {
      const result = db.prepare('UPDATE recipes SET title = ?, minutes = ?, servings = ?, tags = ?, diet = ?, instructions = ? WHERE id = ?')
        .run(recipe.title, recipe.minutes, recipe.servings, recipe.tags.join(','), recipe.diet, '', id);
      if (result.changes === 0) return 'unknown-recipe';
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
      db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(id);
      db.prepare('UPDATE meals SET title = ? WHERE recipe_id = ?').run(recipe.title, id);
    }

    db.prepare('UPDATE recipes SET source_url = ? WHERE id = ?').run(recipe.sourceUrl || null, id);
    if (recipe.photoCopyId !== undefined && recipe.photo === undefined) {
      db.prepare('INSERT OR REPLACE INTO recipe_photos (recipe_id, data) SELECT ?, data FROM recipe_photos WHERE recipe_id = ?').run(id, recipe.photoCopyId);
    }
    if (recipe.photo === null) db.prepare('DELETE FROM recipe_photos WHERE recipe_id = ?').run(id);
    else if (recipe.photo !== undefined) db.prepare('INSERT OR REPLACE INTO recipe_photos (recipe_id, data) VALUES (?, ?)').run(id, recipe.photo);

    const insertIngredient = db.prepare('INSERT INTO ingredients (name, unit) VALUES (?, ?) ON CONFLICT (name, unit) DO NOTHING');
    const findIngredient = db.prepare('SELECT id FROM ingredients WHERE name = ? AND unit = ?');
    const linkIngredient = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, preparation) VALUES (?, ?, ?, ?)');
    for (const ingredient of recipe.ingredients) {
      insertIngredient.run(ingredient.name, ingredient.unit);
      const ingredientId = findIngredient.get(ingredient.name, ingredient.unit).id;
      linkIngredient.run(id, ingredientId, ingredient.amount, ingredient.preparation || 'unknown');
    }
    const insertStep = db.prepare('INSERT INTO recipe_steps (recipe_id, position, kind, instruction, minutes) VALUES (?, ?, ?, ?, ?)');
    for (const step of recipe.steps) insertStep.run(id, step.position, step.kind, step.instruction, step.minutes);
    return read().find(item=>item.id===id);
  });
  const remove=id=>write(()=>{
    if(db.prepare('SELECT 1 FROM meals WHERE recipe_id=? UNION ALL SELECT 1 FROM meal_dishes WHERE recipe_id=? LIMIT 1').get(id,id))return 'used-recipe';
    return db.prepare('DELETE FROM recipes WHERE id=?').run(id).changes?true:'unknown-recipe';
  });
  return Object.freeze({engine:'sqlite',read,save,remove});
}
module.exports={sqliteRecipes};
