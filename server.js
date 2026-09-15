const { createServer } = require('node:http');
const { readFileSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const INDEX_HTML = readFileSync(join(__dirname, 'public', 'index.html'));
const DAY_MS = 86_400_000;

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(key, days) {
  return dateKey(new Date(new Date(`${key}T12:00:00Z`).getTime() + days * DAY_MS));
}

function isDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(new Date(`${value}T12:00:00Z`)) === value;
}

function createDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      minutes INTEGER NOT NULL CHECK (minutes > 0),
      servings INTEGER NOT NULL CHECK (servings > 0),
      tags TEXT NOT NULL DEFAULT '',
      diet TEXT NOT NULL DEFAULT 'omnivore' CHECK (diet IN ('vegan', 'vegetarian', 'pescetarian', 'omnivore')),
      instructions TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      UNIQUE (name, unit)
    );
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
      amount REAL NOT NULL CHECK (amount > 0),
      PRIMARY KEY (recipe_id, ingredient_id)
    );
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id INTEGER PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK (position > 0),
      kind TEXT NOT NULL CHECK (kind IN ('prep', 'cook', 'rest', 'serve')),
      instruction TEXT NOT NULL,
      minutes INTEGER CHECK (minutes IS NULL OR (minutes >= 0 AND minutes <= 1440)),
      UNIQUE (recipe_id, position)
    );
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY,
      date TEXT NOT NULL,
      slot TEXT NOT NULL CHECK (slot IN ('midi', 'soir')),
      location TEXT NOT NULL CHECK (location IN ('home', 'outside', 'restaurant')),
      occasion TEXT NOT NULL CHECK (occasion IN ('regular', 'date', 'guests')),
      people INTEGER NOT NULL CHECK (people > 0 AND people <= 100),
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      UNIQUE (date, slot)
    );
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      diet TEXT NOT NULL CHECK (diet IN ('vegan', 'vegetarian', 'pescetarian', 'omnivore'))
    );
    CREATE TABLE IF NOT EXISTS proteins (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL CHECK (category IN ('plant', 'egg', 'fish', 'meat')),
      amount REAL NOT NULL CHECK (amount > 0),
      unit TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meal_assignments (
      meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      protein_id INTEGER NOT NULL REFERENCES proteins(id),
      portions INTEGER NOT NULL CHECK (portions > 0 AND portions <= 20),
      PRIMARY KEY (meal_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS meal_dishes (
      meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id),
      portions INTEGER NOT NULL CHECK (portions > 0 AND portions <= 20),
      PRIMARY KEY (meal_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS shopping_checks (
      week_start TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      PRIMARY KEY (week_start, name, unit)
    );
  `);
  if (!db.prepare('PRAGMA table_info(recipes)').all().some(column => column.name === 'instructions')) {
    db.exec("ALTER TABLE recipes ADD COLUMN instructions TEXT NOT NULL DEFAULT ''");
  }
  if (!db.prepare('PRAGMA table_info(recipes)').all().some(column => column.name === 'diet')) {
    db.exec("ALTER TABLE recipes ADD COLUMN diet TEXT NOT NULL DEFAULT 'omnivore' CHECK (diet IN ('vegan', 'vegetarian', 'pescetarian', 'omnivore'))");
  }
  seed(db);
  if (db.prepare('PRAGMA user_version').get().user_version < 1) {
    db.exec(`
      UPDATE recipes SET diet = 'vegetarian'
      WHERE diet = 'omnivore'
        AND (tags LIKE '%végétarien%' OR title = 'Gnocchis aux légumes');
      PRAGMA user_version = 1;
    `);
  }
  seedProteins(db);
  db.exec(`
    INSERT INTO recipe_steps (recipe_id, position, kind, instruction, minutes)
    SELECT recipes.id, 1, 'prep', recipes.instructions, NULL
    FROM recipes
    WHERE recipes.instructions <> ''
      AND NOT EXISTS (SELECT 1 FROM recipe_steps WHERE recipe_steps.recipe_id = recipes.id)
  `);
  return db;
}

function seedProteins(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM proteins').get().count > 0) return;
  const insert = db.prepare('INSERT INTO proteins (name, category, amount, unit) VALUES (?, ?, ?, ?)');
  [
    ['tofu', 'plant', 120, 'g'], ['tofu fumé', 'plant', 120, 'g'], ['tempeh', 'plant', 120, 'g'],
    ['œuf', 'egg', 2, 'pièce'], ['saumon', 'fish', 150, 'g'], ['thon', 'fish', 150, 'g'],
    ['poulet', 'meat', 150, 'g'], ['porc', 'meat', 150, 'g'], ['bœuf', 'meat', 150, 'g']
  ].forEach(protein => insert.run(...protein));
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM recipes').get().count > 0) return;

  const recipes = [
    ['Bowl pois chiches', 20, 2, 'végétarien,rapide', 'vegetarian', 'Mélanger les ingrédients et assaisonner selon votre goût.'],
    ['Curry coco', 35, 2, 'végétarien,favori', 'vegetarian', 'Faire mijoter les ingrédients, puis servir avec le riz.'],
    ['Gnocchis aux légumes', 25, 2, 'facile,rapide', 'vegetarian', 'Faire revenir les légumes, ajouter les gnocchis et laisser dorer.']
  ];
  const ingredients = [
    ['pois chiches', 'g'], ['tomate', 'pièce'], ['citron', 'pièce'],
    ['lait de coco', 'cl'], ['curry', 'c. à café'], ['riz', 'g'],
    ['gnocchis', 'g'], ['courgette', 'pièce'], ['oignon rouge', 'pièce']
  ];
  const recipeIngredients = [
    [1, 1, 400], [1, 2, 2], [1, 3, 1],
    [2, 4, 20], [2, 5, 2], [2, 6, 160],
    [3, 7, 500], [3, 8, 2], [3, 9, 1]
  ];

  const insertRecipe = db.prepare('INSERT INTO recipes (title, minutes, servings, tags, diet, instructions) VALUES (?, ?, ?, ?, ?, ?)');
  const insertIngredient = db.prepare('INSERT INTO ingredients (name, unit) VALUES (?, ?)');
  const linkIngredient = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (?, ?, ?)');

  db.exec('BEGIN');
  try {
    recipes.forEach(recipe => insertRecipe.run(...recipe));
    ingredients.forEach(ingredient => insertIngredient.run(...ingredient));
    recipeIngredients.forEach(link => linkIngredient.run(...link));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function recipes(db) {
  const ingredientQuery = db.prepare(`
    SELECT ingredients.name, ingredients.unit, recipe_ingredients.amount
    FROM recipe_ingredients JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
    WHERE recipe_ingredients.recipe_id = ? ORDER BY ingredients.name
  `);
  const stepQuery = db.prepare(`
    SELECT position, kind, instruction, minutes
    FROM recipe_steps WHERE recipe_id = ? ORDER BY position
  `);
  return db.prepare('SELECT id, title, minutes, servings, tags, diet FROM recipes ORDER BY title').all()
    .map(recipe => ({
      ...recipe,
      tags: recipe.tags.split(',').filter(Boolean),
      ingredients: ingredientQuery.all(recipe.id),
      steps: stepQuery.all(recipe.id)
    }));
}

function validateRecipe(input) {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120) throw new Error('Titre invalide');
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 1_440) throw new Error('Durée invalide');
  if (!Number.isInteger(input.servings) || input.servings < 1 || input.servings > 100) throw new Error('Nombre de portions invalide');
  if (!['vegan', 'vegetarian', 'pescetarian', 'omnivore'].includes(input.diet)) throw new Error('Régime de recette invalide');
  if (!Array.isArray(input.tags) || input.tags.length > 20 || input.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 40)) throw new Error('Étiquettes invalides');
  if (!Array.isArray(input.ingredients) || input.ingredients.length < 1 || input.ingredients.length > 100) throw new Error('Ingrédients invalides');

  const ingredients = input.ingredients.map(ingredient => {
    if (!ingredient || typeof ingredient.name !== 'string' || !ingredient.name.trim() || ingredient.name.length > 80) throw new Error('Nom d’ingrédient invalide');
    if (typeof ingredient.unit !== 'string' || !ingredient.unit.trim() || ingredient.unit.length > 24) throw new Error('Unité invalide');
    if (typeof ingredient.amount !== 'number' || !Number.isFinite(ingredient.amount) || ingredient.amount <= 0 || ingredient.amount > 1_000_000) throw new Error('Quantité invalide');
    return { name: ingredient.name.trim().toLocaleLowerCase('fr'), unit: ingredient.unit.trim(), amount: ingredient.amount };
  });
  const duplicate = new Set(ingredients.map(ingredient => `${ingredient.name}\0${ingredient.unit}`));
  if (duplicate.size !== ingredients.length) throw new Error('Un ingrédient est présent plusieurs fois');

  const stepKinds = new Set(['prep', 'cook', 'rest', 'serve']);
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 50) throw new Error('Étapes invalides');
  const steps = input.steps.map((step, index) => {
    if (!step || !stepKinds.has(step.kind)) throw new Error(`Type invalide à l’étape ${index + 1}`);
    if (typeof step.instruction !== 'string' || !step.instruction.trim() || step.instruction.length > 2_000) throw new Error(`Instruction invalide à l’étape ${index + 1}`);
    if (step.minutes != null && (!Number.isInteger(step.minutes) || step.minutes < 0 || step.minutes > 1_440)) throw new Error(`Durée invalide à l’étape ${index + 1}`);
    return { position: index + 1, kind: step.kind, instruction: step.instruction.trim(), minutes: step.minutes ?? null };
  });

  return {
    title: input.title.trim(),
    minutes: input.minutes,
    servings: input.servings,
    tags: [...new Set(input.tags.map(tag => tag.trim().toLocaleLowerCase('fr')))],
    diet: input.diet,
    ingredients,
    steps
  };
}

function saveRecipe(db, recipe, id = null) {
  db.exec('BEGIN');
  try {
    if (id == null) {
      id = Number(db.prepare('INSERT INTO recipes (title, minutes, servings, tags, diet, instructions) VALUES (?, ?, ?, ?, ?, ?)')
        .run(recipe.title, recipe.minutes, recipe.servings, recipe.tags.join(','), recipe.diet, '').lastInsertRowid);
    } else {
      const result = db.prepare('UPDATE recipes SET title = ?, minutes = ?, servings = ?, tags = ?, diet = ?, instructions = ? WHERE id = ?')
        .run(recipe.title, recipe.minutes, recipe.servings, recipe.tags.join(','), recipe.diet, '', id);
      if (result.changes === 0) throw new Error('Recette inconnue');
      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(id);
      db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(id);
      db.prepare('UPDATE meals SET title = ? WHERE recipe_id = ?').run(recipe.title, id);
    }

    const insertIngredient = db.prepare('INSERT INTO ingredients (name, unit) VALUES (?, ?) ON CONFLICT (name, unit) DO NOTHING');
    const findIngredient = db.prepare('SELECT id FROM ingredients WHERE name = ? AND unit = ?');
    const linkIngredient = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount) VALUES (?, ?, ?)');
    for (const ingredient of recipe.ingredients) {
      insertIngredient.run(ingredient.name, ingredient.unit);
      const ingredientId = findIngredient.get(ingredient.name, ingredient.unit).id;
      linkIngredient.run(id, ingredientId, ingredient.amount);
    }
    const insertStep = db.prepare('INSERT INTO recipe_steps (recipe_id, position, kind, instruction, minutes) VALUES (?, ?, ?, ?, ?)');
    for (const step of recipe.steps) insertStep.run(id, step.position, step.kind, step.instruction, step.minutes);
    db.exec('COMMIT');
    return recipes(db).find(item => item.id === id);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function meals(db, start) {
  return db.prepare(`
    SELECT meals.id, date, slot, location, occasion, people, recipe_id AS recipeId,
           meals.title, recipes.minutes
    FROM meals LEFT JOIN recipes ON recipes.id = meals.recipe_id
    WHERE date BETWEEN ? AND ? ORDER BY date, slot
  `).all(start, addDays(start, 6));
}

function shoppingList(db, start) {
  return db.prepare(`
    WITH items AS (
      SELECT ingredients.name, ingredients.unit,
             recipe_ingredients.amount * meals.people / recipes.servings AS amount
      FROM meals
      JOIN recipes ON recipes.id = meals.recipe_id
      JOIN recipe_ingredients ON recipe_ingredients.recipe_id = recipes.id
      JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
      WHERE meals.location = 'home' AND meals.date BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM meal_dishes WHERE meal_dishes.meal_id = meals.id)
      UNION ALL
      SELECT ingredients.name, ingredients.unit,
             recipe_ingredients.amount * meal_dishes.portions / recipes.servings AS amount
      FROM meal_dishes
      JOIN meals ON meals.id = meal_dishes.meal_id
      JOIN recipes ON recipes.id = meal_dishes.recipe_id
      JOIN recipe_ingredients ON recipe_ingredients.recipe_id = recipes.id
      JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
      WHERE meals.date BETWEEN ? AND ?
      UNION ALL
      SELECT proteins.name, proteins.unit, proteins.amount * meal_assignments.portions
      FROM meal_assignments
      JOIN meals ON meals.id = meal_assignments.meal_id
      JOIN proteins ON proteins.id = meal_assignments.protein_id
      WHERE meals.date BETWEEN ? AND ?
    )
    SELECT name, unit, SUM(amount) AS amount FROM items GROUP BY name, unit ORDER BY name
  `).all(start, addDays(start, 6), start, addDays(start, 6), start, addDays(start, 6)).map(item => ({ ...item, amount: Math.round(item.amount * 100) / 100 }));
}

function shoppingState(db, start) {
  const isChecked = db.prepare('SELECT 1 FROM shopping_checks WHERE week_start = ? AND name = ? AND unit = ?');
  return shoppingList(db, start).map(item => ({ ...item, checked: Boolean(isChecked.get(start, item.name, item.unit)) }));
}

function household(db) {
  return {
    members: db.prepare('SELECT id, name, diet FROM members ORDER BY name').all(),
    proteins: db.prepare('SELECT id, name, category, amount, unit FROM proteins ORDER BY name').all()
  };
}

function validateMember(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60) throw new Error('Nom invalide');
  if (!['vegan', 'vegetarian', 'pescetarian', 'omnivore'].includes(input.diet)) throw new Error('Régime invalide');
  return { name: input.name.trim(), diet: input.diet };
}

function validateProtein(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60) throw new Error('Protéine invalide');
  if (!['plant', 'egg', 'fish', 'meat'].includes(input.category)) throw new Error('Catégorie invalide');
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10_000) throw new Error('Quantité invalide');
  if (typeof input.unit !== 'string' || !input.unit.trim() || input.unit.length > 24) throw new Error('Unité invalide');
  return { name: input.name.trim().toLocaleLowerCase('fr'), category: input.category, amount: input.amount, unit: input.unit.trim() };
}

function isCompatible(diet, category) {
  const allowed = {
    vegan: ['plant'],
    vegetarian: ['plant', 'egg'],
    pescetarian: ['plant', 'egg', 'fish'],
    omnivore: ['plant', 'egg', 'fish', 'meat']
  };
  return allowed[diet]?.includes(category) === true;
}

function isDietCompatible(memberDiet, recipeDiet) {
  const rank = { vegan: 0, vegetarian: 1, pescetarian: 2, omnivore: 3 };
  return rank[recipeDiet] <= rank[memberDiet];
}

function suggestions(db, start = null, maxMinutes = null) {
  // ponytail: exact ingredient-name overlap; add pantry quantities only if users need finer scoring.
  const memberDiets = db.prepare('SELECT diet FROM members').all().map(member => member.diet);
  const candidates = db.prepare(`
    WITH eaten AS (
      SELECT recipe_id, date FROM meals WHERE recipe_id IS NOT NULL
      UNION ALL
      SELECT meal_dishes.recipe_id, meals.date FROM meal_dishes JOIN meals ON meals.id = meal_dishes.meal_id
    )
    SELECT recipes.id, recipes.title, recipes.minutes, recipes.servings, recipes.tags, recipes.diet,
           MAX(eaten.date) AS lastEaten
    FROM recipes LEFT JOIN eaten ON eaten.recipe_id = recipes.id
    GROUP BY recipes.id
  `).all().filter(recipe =>
    (maxMinutes == null || recipe.minutes <= maxMinutes) &&
    memberDiets.every(diet => isDietCompatible(diet, recipe.diet))
  );
  const ingredientQuery = db.prepare(`
    SELECT ingredients.name FROM recipe_ingredients
    JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
    WHERE recipe_ingredients.recipe_id = ? ORDER BY ingredients.name
  `);
  const plannedIngredients = new Set(start ? shoppingList(db, start).map(item => item.name) : []);
  const plannedRecipeIds = new Set(start ? db.prepare(`
    SELECT recipe_id AS id FROM meals WHERE date BETWEEN ? AND ? AND recipe_id IS NOT NULL
    UNION SELECT meal_dishes.recipe_id AS id FROM meal_dishes JOIN meals ON meals.id = meal_dishes.meal_id WHERE meals.date BETWEEN ? AND ?
  `).all(start, addDays(start, 6), start, addDays(start, 6)).map(item => item.id) : []);
  const ranked = candidates.map(recipe => ({
    ...recipe,
    tags: recipe.tags.split(',').filter(Boolean),
    reusedIngredients: ingredientQuery.all(recipe.id).map(item => item.name).filter(name => plannedIngredients.has(name)),
    alreadyPlanned: plannedRecipeIds.has(recipe.id)
  })).sort((left, right) =>
    right.reusedIngredients.length - left.reusedIngredients.length ||
    Number(left.alreadyPlanned) - Number(right.alreadyPlanned) ||
    Number(Boolean(left.lastEaten)) - Number(Boolean(right.lastEaten)) ||
    String(left.lastEaten || '').localeCompare(String(right.lastEaten || '')) ||
    left.title.localeCompare(right.title, 'fr')
  );
  const fresh = ranked.filter(recipe => !recipe.alreadyPlanned);
  return [...fresh, ...ranked.filter(recipe => recipe.alreadyPlanned)].slice(0, 3);
}

function validateMeal(input, db) {
  const slots = new Set(['midi', 'soir']);
  const locations = new Set(['home', 'outside', 'restaurant']);
  const occasions = new Set(['regular', 'date', 'guests']);
  if (!input || !isDateKey(input.date)) throw new Error('Date invalide');
  if (!slots.has(input.slot)) throw new Error('Créneau invalide');
  if (!locations.has(input.location)) throw new Error('Lieu invalide');
  if (!occasions.has(input.occasion)) throw new Error('Occasion invalide');
  if (!Number.isInteger(input.people) || input.people < 1 || input.people > 100) throw new Error('Nombre de personnes invalide');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120) throw new Error('Titre invalide');
  const baseRecipe = input.recipeId == null ? null : db.prepare('SELECT diet FROM recipes WHERE id = ?').get(input.recipeId);
  if (input.recipeId != null && !baseRecipe) throw new Error('Recette inconnue');
  if (input.location !== 'home' && input.recipeId != null) throw new Error('Une recette est réservée aux repas à la maison');
  const assignments = input.assignments == null ? [] : input.assignments;
  if (!Array.isArray(assignments) || assignments.length > 100) throw new Error('Répartition invalide');
  const seenMembers = new Set();
  const checkedAssignments = assignments.map(assignment => {
    if (!assignment || !Number.isInteger(assignment.memberId) || !Number.isInteger(assignment.proteinId) || !Number.isInteger(assignment.portions) || assignment.portions < 1 || assignment.portions > 20) throw new Error('Répartition invalide');
    if (seenMembers.has(assignment.memberId)) throw new Error('Membre présent plusieurs fois');
    seenMembers.add(assignment.memberId);
    const member = db.prepare('SELECT diet FROM members WHERE id = ?').get(assignment.memberId);
    const protein = db.prepare('SELECT category FROM proteins WHERE id = ?').get(assignment.proteinId);
    if (!member || !protein || !isCompatible(member.diet, protein.category) || (baseRecipe && !isDietCompatible(member.diet, baseRecipe.diet))) throw new Error('Recette ou protéine incompatible avec le régime');
    return assignment;
  });
  if (input.location !== 'home' && checkedAssignments.length) throw new Error('Les variantes sont réservées aux repas à la maison');
  const dishes = input.dishes == null ? [] : input.dishes;
  if (!Array.isArray(dishes) || dishes.length > 100 || (dishes.length && checkedAssignments.length)) throw new Error('Répartition invalide');
  const seenDishMembers = new Set();
  const checkedDishes = dishes.map(dish => {
    if (!dish || !Number.isInteger(dish.memberId) || !Number.isInteger(dish.recipeId) || !Number.isInteger(dish.portions) || dish.portions < 1 || dish.portions > 20) throw new Error('Répartition invalide');
    if (seenDishMembers.has(dish.memberId)) throw new Error('Membre présent plusieurs fois');
    seenDishMembers.add(dish.memberId);
    const member = db.prepare('SELECT diet FROM members WHERE id = ?').get(dish.memberId);
    const recipe = db.prepare('SELECT diet FROM recipes WHERE id = ?').get(dish.recipeId);
    if (!member || !recipe || !isDietCompatible(member.diet, recipe.diet)) throw new Error('Recette incompatible avec le régime');
    return dish;
  });
  if (input.location !== 'home' && checkedDishes.length) throw new Error('Les recettes sont réservées aux repas à la maison');
  if (checkedDishes.length && input.recipeId != null) throw new Error('Une base commune et deux recettes ne peuvent pas être combinées');
  return {
    date: input.date,
    slot: input.slot,
    location: input.location,
    occasion: input.occasion,
    people: checkedAssignments.length ? checkedAssignments.reduce((total, item) => total + item.portions, 0) : checkedDishes.length ? checkedDishes.reduce((total, item) => total + item.portions, 0) : input.people,
    recipeId: input.recipeId ?? null,
    title: input.title.trim(),
    assignments: checkedAssignments,
    dishes: checkedDishes
  };
}

function upsertMeal(db, meal) {
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO meals (date, slot, location, occasion, people, recipe_id, title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (date, slot) DO UPDATE SET
        location = excluded.location,
        occasion = excluded.occasion,
        people = excluded.people,
        recipe_id = excluded.recipe_id,
        title = excluded.title
    `).run(meal.date, meal.slot, meal.location, meal.occasion, meal.people, meal.recipeId, meal.title);
    const mealId = db.prepare('SELECT id FROM meals WHERE date = ? AND slot = ?').get(meal.date, meal.slot).id;
    db.prepare('DELETE FROM meal_assignments WHERE meal_id = ?').run(mealId);
    db.prepare('DELETE FROM meal_dishes WHERE meal_id = ?').run(mealId);
    const insert = db.prepare('INSERT INTO meal_assignments (meal_id, member_id, protein_id, portions) VALUES (?, ?, ?, ?)');
    meal.assignments.forEach(assignment => insert.run(mealId, assignment.memberId, assignment.proteinId, assignment.portions));
    const insertDish = db.prepare('INSERT INTO meal_dishes (meal_id, member_id, recipe_id, portions) VALUES (?, ?, ?, ?)');
    meal.dishes.forEach(dish => insertDish.run(mealId, dish.memberId, dish.recipeId, dish.portions));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new Error('Requête trop volumineuse');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('JSON invalide');
  }
}

function createHandler(db) {
  return async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': INDEX_HTML.length,
          'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(INDEX_HTML);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/week') {
        const start = url.searchParams.get('start');
        if (!isDateKey(start)) return sendJson(response, 400, { error: 'Début de semaine invalide' });
        return sendJson(response, 200, { recipes: recipes(db), meals: meals(db, start), shopping: shoppingState(db, start) });
      }

      if (request.method === 'GET' && url.pathname === '/api/suggestions') {
        const start = url.searchParams.get('start');
        const maxMinutesValue = url.searchParams.get('maxMinutes');
        const maxMinutes = maxMinutesValue == null ? null : Number(maxMinutesValue);
        if (start != null && !isDateKey(start)) throw new Error('Début de semaine invalide');
        if (maxMinutes != null && (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 1440)) throw new Error('Temps disponible invalide');
        return sendJson(response, 200, suggestions(db, start, maxMinutes));
      }

      if (request.method === 'GET' && url.pathname === '/api/household') {
        return sendJson(response, 200, household(db));
      }

      if (request.method === 'POST' && url.pathname === '/api/members') {
        const member = validateMember(await readJson(request));
        const id = Number(db.prepare('INSERT INTO members (name, diet) VALUES (?, ?)').run(member.name, member.diet).lastInsertRowid);
        return sendJson(response, 201, { id, ...member });
      }

      if (request.method === 'POST' && url.pathname === '/api/proteins') {
        const protein = validateProtein(await readJson(request));
        const id = Number(db.prepare('INSERT INTO proteins (name, category, amount, unit) VALUES (?, ?, ?, ?)').run(protein.name, protein.category, protein.amount, protein.unit).lastInsertRowid);
        return sendJson(response, 201, { id, ...protein });
      }

      if (request.method === 'POST' && url.pathname === '/api/shopping-checks') {
        const input = await readJson(request);
        if (!input || !isDateKey(input.weekStart) || typeof input.name !== 'string' || !input.name || input.name.length > 80 || typeof input.unit !== 'string' || !input.unit || input.unit.length > 24 || typeof input.checked !== 'boolean') throw new Error('Article invalide');
        if (input.checked) db.prepare('INSERT INTO shopping_checks (week_start, name, unit) VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(input.weekStart, input.name, input.unit);
        else db.prepare('DELETE FROM shopping_checks WHERE week_start = ? AND name = ? AND unit = ?').run(input.weekStart, input.name, input.unit);
        return sendJson(response, 200, {});
      }

      if (request.method === 'POST' && url.pathname === '/api/recipes') {
        return sendJson(response, 201, saveRecipe(db, validateRecipe(await readJson(request))));
      }

      const recipeMatch = url.pathname.match(/^\/api\/recipes\/(\d+)$/);
      if (request.method === 'PUT' && recipeMatch) {
        return sendJson(response, 200, saveRecipe(db, validateRecipe(await readJson(request)), Number(recipeMatch[1])));
      }

      if (request.method === 'POST' && url.pathname === '/api/meals') {
        const meal = validateMeal(await readJson(request), db);
        upsertMeal(db, meal);
        return sendJson(response, 200, meal);
      }

      if (request.method === 'DELETE' && url.pathname === '/api/meals') {
        const date = url.searchParams.get('date');
        const slot = url.searchParams.get('slot');
        if (!isDateKey(date) || !['midi', 'soir'].includes(slot)) throw new Error('Créneau invalide');
        db.prepare('DELETE FROM meals WHERE date = ? AND slot = ?').run(date, slot);
        return sendJson(response, 200, {});
      }

      sendJson(response, 404, { error: 'Introuvable' });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
  };
}

function createApp(database = createDatabase(process.env.MANGER_DB || join(__dirname, 'data', 'manger.db'))) {
  return createServer(createHandler(database));
}

if (require.main === module) {
  const port = Number(process.env.MANGER_PORT || 3000);
  const server = createApp();
  server.listen(port, '0.0.0.0', () => console.log(`Manger! écoute sur http://localhost:${port}`));
}

module.exports = { addDays, createApp, createDatabase, dateKey, household, isCompatible, isDietCompatible, isDateKey, recipes, saveRecipe, shoppingList, suggestions, validateMeal, validateMember, validateProtein, validateRecipe };
