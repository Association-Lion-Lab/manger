// Only these two fixed table namespaces are allowed; there is no SQL translation or user-provided identifier.
function itemQuery(engine){
  if(!['sqlite','postgres'].includes(engine))throw new Error('Moteur inconnu');
  const schema=engine==='postgres'?'household.':'';
  return `
    WITH items AS (
      SELECT meals.date, ingredients.name, ingredients.unit,
             recipe_ingredients.amount * (meals.people + COALESCE((SELECT SUM(rest.people) FROM ${schema}meals rest WHERE rest.leftover_of = meals.id), 0)) / recipes.servings AS amount
      FROM ${schema}meals
      JOIN ${schema}recipes ON recipes.id = meals.recipe_id
      JOIN ${schema}recipe_ingredients ON recipe_ingredients.recipe_id = recipes.id
      JOIN ${schema}ingredients ON ingredients.id = recipe_ingredients.ingredient_id
      WHERE meals.location = 'home' AND 1=1
        AND meals.leftover_of IS NULL
        AND NOT EXISTS (SELECT 1 FROM ${schema}meal_dishes WHERE meal_dishes.meal_id = meals.id)
      UNION ALL
      SELECT meals.date, ingredients.name, ingredients.unit,
             recipe_ingredients.amount * (meal_dishes.portions + COALESCE((
               SELECT SUM(rest_dishes.portions) FROM ${schema}meals rest
               JOIN ${schema}meal_dishes rest_dishes ON rest_dishes.meal_id = rest.id
               WHERE rest.leftover_of = meals.id AND rest_dishes.member_id = meal_dishes.member_id
             ), 0)) / recipes.servings AS amount
      FROM ${schema}meal_dishes
      JOIN ${schema}meals ON meals.id = meal_dishes.meal_id
      JOIN ${schema}recipes ON recipes.id = meal_dishes.recipe_id
      JOIN ${schema}recipe_ingredients ON recipe_ingredients.recipe_id = recipes.id
      JOIN ${schema}ingredients ON ingredients.id = recipe_ingredients.ingredient_id
      WHERE 1=1 AND meals.leftover_of IS NULL
      UNION ALL
      SELECT meals.date, proteins.name, proteins.unit, proteins.amount * (meal_assignments.portions + COALESCE((
        SELECT SUM(rest_dishes.portions) FROM ${schema}meals rest
        JOIN ${schema}meal_dishes rest_dishes ON rest_dishes.meal_id = rest.id
        WHERE rest.leftover_of = meals.id AND rest_dishes.member_id = meal_assignments.member_id
      ), 0))
      FROM ${schema}meal_assignments
      JOIN ${schema}meals ON meals.id = meal_assignments.meal_id
      JOIN ${schema}proteins ON proteins.id = meal_assignments.protein_id
      WHERE 1=1 AND meals.leftover_of IS NULL
      UNION ALL
      SELECT meals.date, proteins.name, proteins.unit, proteins.amount * (meal_dishes.portions + COALESCE((
        SELECT SUM(rest_dishes.portions) FROM ${schema}meals rest
        JOIN ${schema}meal_dishes rest_dishes ON rest_dishes.meal_id = rest.id
        WHERE rest.leftover_of = meals.id AND rest_dishes.member_id = meal_dishes.member_id
      ), 0))
      FROM ${schema}meal_dishes JOIN ${schema}meals ON meals.id = meal_dishes.meal_id
      JOIN ${schema}proteins ON proteins.id = meal_dishes.protein_id
      WHERE 1=1 AND meals.leftover_of IS NULL
    )
    SELECT date,name,unit,amount FROM items ORDER BY date,name,unit`;
}
module.exports={itemQuery};
