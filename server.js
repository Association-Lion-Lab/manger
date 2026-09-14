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
  `);
  if (!db.prepare('PRAGMA table_info(recipes)').all().some(column => column.name === 'instructions')) {
    db.exec("ALTER TABLE recipes ADD COLUMN instructions TEXT NOT NULL DEFAULT ''");
  }
  seed(db);
  db.exec(`
    INSERT INTO recipe_steps (recipe_id, position, kind, instruction, minutes)
    SELECT recipes.id, 1, 'prep', recipes.instructions, NULL
    FROM recipes
    WHERE recipes.instructions <> ''
      AND NOT EXISTS (SELECT 1 FROM recipe_steps WHERE recipe_steps.recipe_id = recipes.id)
  `);
  return db;
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM recipes').get().count > 0) return;

  const recipes = [
    ['Bowl pois chiches', 20, 2, 'végétarien,rapide', 'Mélanger les ingrédients et assaisonner selon votre goût.'],
    ['Curry coco', 35, 2, 'végétarien,favori', 'Faire mijoter les ingrédients, puis servir avec le riz.'],
    ['Gnocchis aux légumes', 25, 2, 'facile,rapide', 'Faire revenir les légumes, ajouter les gnocchis et laisser dorer.']
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

  const insertRecipe = db.prepare('INSERT INTO recipes (title, minutes, servings, tags, instructions) VALUES (?, ?, ?, ?, ?)');
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
  return db.prepare('SELECT id, title, minutes, servings, tags FROM recipes ORDER BY title').all()
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
    ingredients,
    steps
  };
}

function saveRecipe(db, recipe, id = null) {
  db.exec('BEGIN');
  try {
    if (id == null) {
      id = Number(db.prepare('INSERT INTO recipes (title, minutes, servings, tags, instructions) VALUES (?, ?, ?, ?, ?)')
        .run(recipe.title, recipe.minutes, recipe.servings, recipe.tags.join(','), '').lastInsertRowid);
    } else {
      const result = db.prepare('UPDATE recipes SET title = ?, minutes = ?, servings = ?, tags = ?, instructions = ? WHERE id = ?')
        .run(recipe.title, recipe.minutes, recipe.servings, recipe.tags.join(','), '', id);
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
    SELECT ingredients.name, ingredients.unit,
           SUM(recipe_ingredients.amount * meals.people / recipes.servings) AS amount
    FROM meals
    JOIN recipes ON recipes.id = meals.recipe_id
    JOIN recipe_ingredients ON recipe_ingredients.recipe_id = recipes.id
    JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
    WHERE meals.location = 'home' AND meals.date BETWEEN ? AND ?
    GROUP BY ingredients.id ORDER BY ingredients.name
  `).all(start, addDays(start, 6)).map(item => ({ ...item, amount: Math.round(item.amount * 100) / 100 }));
}

function suggestions(db) {
  // ponytail: deterministic recency ranking; add household preferences once profiles exist.
  return db.prepare(`
    SELECT recipes.id, recipes.title, recipes.minutes, recipes.servings, recipes.tags,
           MAX(meals.date) AS lastEaten
    FROM recipes LEFT JOIN meals ON meals.recipe_id = recipes.id
    GROUP BY recipes.id
    ORDER BY CASE WHEN MAX(meals.date) IS NULL THEN 0 ELSE 1 END,
             MAX(meals.date), recipes.title
    LIMIT 3
  `).all().map(recipe => ({ ...recipe, tags: recipe.tags.split(',').filter(Boolean) }));
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
  if (input.recipeId != null && !db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(input.recipeId)) throw new Error('Recette inconnue');
  if (input.location !== 'home' && input.recipeId != null) throw new Error('Une recette est réservée aux repas à la maison');
  return {
    date: input.date,
    slot: input.slot,
    location: input.location,
    occasion: input.occasion,
    people: input.people,
    recipeId: input.recipeId ?? null,
    title: input.title.trim()
  };
}

function upsertMeal(db, meal) {
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
        return sendJson(response, 200, { recipes: recipes(db), meals: meals(db, start), shopping: shoppingList(db, start) });
      }

      if (request.method === 'GET' && url.pathname === '/api/suggestions') {
        return sendJson(response, 200, suggestions(db));
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

module.exports = { addDays, createApp, createDatabase, dateKey, isDateKey, recipes, saveRecipe, shoppingList, suggestions, validateMeal, validateRecipe };
