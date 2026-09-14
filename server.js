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
      tags TEXT NOT NULL DEFAULT ''
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
  seed(db);
  return db;
}

function seed(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM recipes').get().count > 0) return;

  const recipes = [
    ['Bowl pois chiches', 20, 2, 'végétarien,rapide'],
    ['Curry coco', 35, 2, 'végétarien,favori'],
    ['Gnocchis aux légumes', 25, 2, 'facile,rapide']
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

  const insertRecipe = db.prepare('INSERT INTO recipes (title, minutes, servings, tags) VALUES (?, ?, ?, ?)');
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
  return db.prepare('SELECT id, title, minutes, servings, tags FROM recipes ORDER BY title').all()
    .map(recipe => ({ ...recipe, tags: recipe.tags.split(',').filter(Boolean) }));
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

      if (request.method === 'POST' && url.pathname === '/api/meals') {
        const meal = validateMeal(await readJson(request), db);
        upsertMeal(db, meal);
        return sendJson(response, 200, meal);
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

module.exports = { addDays, createApp, createDatabase, dateKey, isDateKey, shoppingList, suggestions, validateMeal };
