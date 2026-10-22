const { createServer } = require('node:http');
const { createServer: createHttpsServer } = require('node:https');
const { tlsOptions, localCertificate } = require('./tls');
const { readFileSync, mkdirSync, createReadStream } = require('node:fs');
const { mkdtemp, rm, stat } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { pipeline } = require('node:stream/promises');
const { dirname, join } = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const catalog = require('./catalog');
const { foodName, foodKey, inUnit, groupIngredients, isAntiWasteIngredient } = require('./ingredients');
const { downloadRecipePage, extractRecipeDraft } = require('./recipe-import');
const { recipeTaste, tasteRank } = require('./public/tastes');
const { createRestore } = require('./restore');
const { openAccounts, protectAccounts } = require('./accounts');
const { createInvitationMailer } = require('./invitation-mail');
const { storageEngine } = require('./db/storage');

const INDEX_HTML = Buffer.from(readFileSync(join(__dirname, 'public', 'index.html'), 'utf8')
  .replace('<!-- MANGER_INFORMATION -->', readFileSync(join(__dirname, 'public', 'information.html'), 'utf8')));
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
    CREATE TABLE IF NOT EXISTS shopping_manual (
      id INTEGER PRIMARY KEY, week_start TEXT NOT NULL, name TEXT NOT NULL,
      amount REAL NOT NULL, unit TEXT NOT NULL, aisle TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS shopping_aisles (
      name TEXT NOT NULL, unit TEXT NOT NULL, aisle TEXT NOT NULL,
      PRIMARY KEY (name, unit)
    );
    CREATE TABLE IF NOT EXISTS recipe_favorites (
      recipe_id INTEGER PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS avoided_ingredients (name TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS recipe_photos (
      recipe_id INTEGER PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
      data BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pantry (
      id INTEGER PRIMARY KEY, food_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, unit TEXT NOT NULL, amount REAL NOT NULL CHECK(amount > 0),
      recorded_on TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recipe_notes (
      recipe_id INTEGER PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 0 AND 5), note TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS week_templates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      source_start TEXT NOT NULL,
      meals_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  if (!db.prepare('PRAGMA table_info(recipes)').all().some(column => column.name === 'source_url')) db.exec('ALTER TABLE recipes ADD COLUMN source_url TEXT');
  if (!db.prepare('PRAGMA table_info(pantry)').all().some(column => column.name === 'use_by')) db.exec('ALTER TABLE pantry ADD COLUMN use_by TEXT');
  if (!db.prepare('PRAGMA table_info(pantry)').all().some(column => column.name === 'explicit_lot')) db.exec('ALTER TABLE pantry ADD COLUMN explicit_lot INTEGER NOT NULL DEFAULT 0');
  if (!db.prepare('PRAGMA table_info(members)').all().some(column => column.name === 'avoided_ingredients')) db.exec("ALTER TABLE members ADD COLUMN avoided_ingredients TEXT NOT NULL DEFAULT '[]'");
  if (!db.prepare('PRAGMA table_info(meal_dishes)').all().some(column => column.name === 'protein_id')) db.exec('ALTER TABLE meal_dishes ADD COLUMN protein_id INTEGER REFERENCES proteins(id)');
  if (!db.prepare('PRAGMA table_info(recipe_ingredients)').all().some(column => column.name === 'preparation')) db.exec("ALTER TABLE recipe_ingredients ADD COLUMN preparation TEXT NOT NULL DEFAULT 'unknown' CHECK(preparation IN ('unknown', 'raw', 'cooked'))");
  if (!db.prepare('PRAGMA table_info(meals)').all().some(column => column.name === 'leftover_of')) db.exec('ALTER TABLE meals ADD COLUMN leftover_of INTEGER REFERENCES meals(id) ON DELETE RESTRICT');
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
  if (db.prepare('PRAGMA user_version').get().user_version < 2) {
    // Only unchanged originals are annotated. A shared title alone is not enough.
    const signature = recipe => JSON.stringify({
      title: recipe.title, servings: recipe.servings, minutes: recipe.minutes,
      ingredients: recipe.ingredients.map(({ name, amount, unit }) => ({ name, amount, unit })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      steps: recipe.steps.map(({ kind, instruction, minutes }) => ({ kind, instruction, minutes }))
    });
    const originals = new Map(catalog.map(recipe => [signature(recipe), recipe]));
    const starters = [
      ['Bowl pois chiches', 20, 'Mélanger les ingrédients et assaisonner selon votre goût.', [['pois chiches', 400, 'g', 'unknown'], ['tomate', 2, 'pièce', 'raw'], ['citron', 1, 'pièce', 'raw']]],
      ['Curry coco', 35, 'Faire mijoter les ingrédients, puis servir avec le riz.', [['lait de coco', 20, 'cl', 'cooked'], ['curry', 2, 'c. à café', 'cooked'], ['riz', 160, 'g', 'cooked']]],
      ['Gnocchis aux légumes', 25, 'Faire revenir les légumes, ajouter les gnocchis et laisser dorer.', [['gnocchis', 500, 'g', 'cooked'], ['courgette', 2, 'pièce', 'cooked'], ['oignon rouge', 1, 'pièce', 'cooked']]]
    ];
    for (const [title, minutes, instruction, ingredients] of starters) {
      const recipe = { title, minutes, servings: 2, ingredients: ingredients.map(([name, amount, unit, preparation]) => ({ name, amount, unit, preparation })), steps: [{ kind: 'prep', instruction, minutes: null }] };
      originals.set(signature(recipe), recipe);
    }
    const update = db.prepare("UPDATE recipe_ingredients SET preparation = ? WHERE recipe_id = ? AND preparation = 'unknown' AND ingredient_id = (SELECT id FROM ingredients WHERE name = ? AND unit = ?)");
    db.exec('BEGIN');
    try {
      for (const recipe of recipes(db)) {
        const original = originals.get(signature(recipe));
        if (original) for (const ingredient of original.ingredients) update.run(ingredient.preparation, recipe.id, ingredient.name, ingredient.unit);
      }
      db.exec('PRAGMA user_version = 2; COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  if (db.prepare('PRAGMA user_version').get().user_version < 4) db.exec('PRAGMA user_version = 4');
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
    [1, 1, 400, 'unknown'], [1, 2, 2, 'raw'], [1, 3, 1, 'raw'],
    [2, 4, 20, 'cooked'], [2, 5, 2, 'cooked'], [2, 6, 160, 'cooked'],
    [3, 7, 500, 'cooked'], [3, 8, 2, 'cooked'], [3, 9, 1, 'cooked']
  ];

  const insertRecipe = db.prepare('INSERT INTO recipes (title, minutes, servings, tags, diet, instructions) VALUES (?, ?, ?, ?, ?, ?)');
  const insertIngredient = db.prepare('INSERT INTO ingredients (name, unit) VALUES (?, ?)');
  const linkIngredient = db.prepare('INSERT INTO recipe_ingredients (recipe_id, ingredient_id, amount, preparation) VALUES (?, ?, ?, ?)');

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
    if (ingredient.preparation !== undefined && !['raw', 'cooked', 'unknown'].includes(ingredient.preparation)) throw new Error('État d’ingrédient invalide');
    return { name: ingredient.name.trim().toLocaleLowerCase('fr'), unit: ingredient.unit.trim(), amount: ingredient.amount, preparation: ingredient.preparation ?? 'unknown' };
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

  let sourceUrl = null;
  if (input.sourceUrl != null && input.sourceUrl !== '') {
    if (typeof input.sourceUrl !== 'string' || input.sourceUrl.length > 2000) throw new Error('Lien source invalide');
    let url; try { url = new URL(input.sourceUrl); } catch { throw new Error('Lien source invalide'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Lien source invalide');
    sourceUrl = url.href;
  }
  let photo;
  if (input.photo !== undefined && input.photo !== null) {
    if (typeof input.photo !== 'string' || input.photo.length > 400000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.photo)) throw new Error('Photo JPEG invalide ou trop volumineuse');
    photo = Buffer.from(input.photo.slice(23), 'base64');
    if (photo.length < 4 || photo.readUInt16BE(0) !== 0xffd8 || photo.readUInt16BE(photo.length - 2) !== 0xffd9) throw new Error('Photo JPEG invalide');
  } else photo = input.photo;
  if (input.photoCopyId !== undefined && (!Number.isSafeInteger(input.photoCopyId) || input.photoCopyId < 1)) throw new Error('Photo source invalide');
  return {
    title: input.title.trim(),
    minutes: input.minutes,
    servings: input.servings,
    tags: [...new Set(input.tags.map(tag => tag.trim().toLocaleLowerCase('fr')))],
    diet: input.diet,
    sourceUrl,
    ...(photo !== undefined ? { photo } : {}),
    ...(input.photoCopyId !== undefined ? { photoCopyId: input.photoCopyId } : {}),
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
           meals.title, recipes.minutes, leftover_of AS leftoverOf,
           COALESCE((SELECT SUM(rest.people) FROM meals rest WHERE rest.leftover_of = meals.id), 0) AS extraPortions,
           EXISTS(SELECT 1 FROM meal_assignments WHERE meal_id = meals.id) AS hasVariants
    FROM meals LEFT JOIN recipes ON recipes.id = meals.recipe_id
    WHERE date BETWEEN ? AND ? ORDER BY date, slot
  `).all(start, addDays(start, 6)).map(meal => {
    const dishes = db.prepare('SELECT member_id AS memberId, recipe_id AS recipeId, protein_id AS proteinId, portions, recipes.minutes FROM meal_dishes JOIN recipes ON recipes.id = meal_dishes.recipe_id WHERE meal_id = ?').all(meal.id);
    const assignments = db.prepare('SELECT member_id AS memberId, protein_id AS proteinId, portions FROM meal_assignments WHERE meal_id = ?').all(meal.id);
    return dishes.length ? { ...meal, minutes: Math.max(...dishes.map(dish => dish.minutes)), dishes: dishes.map(({ minutes, proteinId, ...dish }) => ({ ...dish, ...(proteinId == null ? {} : { proteinId }) })) } : { ...meal, assignments };
  });
}

function shoppingList(db, start, end = addDays(start, 6)) {
  return groupIngredients(db.prepare(`
    WITH items AS (
      SELECT ingredients.name, ingredients.unit,
             recipe_ingredients.amount * (meals.people + COALESCE((SELECT SUM(rest.people) FROM meals rest WHERE rest.leftover_of = meals.id), 0)) / recipes.servings AS amount
      FROM meals
      JOIN recipes ON recipes.id = meals.recipe_id
      JOIN recipe_ingredients ON recipe_ingredients.recipe_id = recipes.id
      JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
      WHERE meals.location = 'home' AND meals.date BETWEEN ? AND ?
        AND meals.leftover_of IS NULL
        AND NOT EXISTS (SELECT 1 FROM meal_dishes WHERE meal_dishes.meal_id = meals.id)
      UNION ALL
      SELECT ingredients.name, ingredients.unit,
             recipe_ingredients.amount * (meal_dishes.portions + COALESCE((
               SELECT SUM(rest_dishes.portions) FROM meals rest
               JOIN meal_dishes rest_dishes ON rest_dishes.meal_id = rest.id
               WHERE rest.leftover_of = meals.id AND rest_dishes.member_id = meal_dishes.member_id
             ), 0)) / recipes.servings AS amount
      FROM meal_dishes
      JOIN meals ON meals.id = meal_dishes.meal_id
      JOIN recipes ON recipes.id = meal_dishes.recipe_id
      JOIN recipe_ingredients ON recipe_ingredients.recipe_id = recipes.id
      JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
      WHERE meals.date BETWEEN ? AND ? AND meals.leftover_of IS NULL
      UNION ALL
      SELECT proteins.name, proteins.unit, proteins.amount * (meal_assignments.portions + COALESCE((
        SELECT SUM(rest_dishes.portions) FROM meals rest
        JOIN meal_dishes rest_dishes ON rest_dishes.meal_id = rest.id
        WHERE rest.leftover_of = meals.id AND rest_dishes.member_id = meal_assignments.member_id
      ), 0))
      FROM meal_assignments
      JOIN meals ON meals.id = meal_assignments.meal_id
      JOIN proteins ON proteins.id = meal_assignments.protein_id
      WHERE meals.date BETWEEN ? AND ? AND meals.leftover_of IS NULL
      UNION ALL
      SELECT proteins.name, proteins.unit, proteins.amount * (meal_dishes.portions + COALESCE((
        SELECT SUM(rest_dishes.portions) FROM meals rest
        JOIN meal_dishes rest_dishes ON rest_dishes.meal_id = rest.id
        WHERE rest.leftover_of = meals.id AND rest_dishes.member_id = meal_dishes.member_id
      ), 0))
      FROM meal_dishes JOIN meals ON meals.id = meal_dishes.meal_id
      JOIN proteins ON proteins.id = meal_dishes.protein_id
      WHERE meals.date BETWEEN ? AND ? AND meals.leftover_of IS NULL
    )
    SELECT name, unit, SUM(amount) AS amount FROM items GROUP BY name, unit ORDER BY name
  `).all(start, end, start, end, start, end, start, end));
}

function pantryStocks(db) {
  const rows = db.prepare('SELECT id, name, unit, amount, explicit_lot AS explicitLot, recorded_on AS recordedOn, use_by AS useBy FROM pantry ORDER BY use_by IS NULL, use_by, recorded_on, id').all();
  const counts = new Map();
  for (const row of rows.filter(row => !row.explicitLot)) counts.set(foodKey(row), (counts.get(foodKey(row)) || 0) + 1);
  return rows.map(row => ({ ...row, ambiguous: !row.explicitLot && counts.get(foodKey(row)) > 1 }));
}

function matchingStocks(stocks, item, date) {
  return stocks.filter(stock => !stock.ambiguous && foodKey(stock) === foodKey(item) && stock.recordedOn <= date && (!stock.useBy || stock.useBy >= date));
}

function consumeStocks(stocks, item, date) {
  let remaining = item.amount;
  for (const stock of matchingStocks(stocks, item, date)) {
    const taken = Math.min(remaining, inUnit(stock, item.unit));
    stock.amount = Math.max(0, stock.amount - inUnit({ ...item, amount: taken }, stock.unit));
    remaining = Math.max(0, remaining - taken);
  }
  return item.amount - remaining;
}

function reservePantry(db, end, countFrom = null) {
  const stocks = pantryStocks(db), covered = [];
  const first = stocks.filter(stock => !stock.ambiguous && stock.recordedOn <= end).map(stock => stock.recordedOn).sort()[0];
  if (!first) return { stocks, covered };
  // Only visit planned days, rather than every day since the oldest stock.
  const dates = db.prepare('SELECT DISTINCT date FROM meals WHERE date BETWEEN ? AND ? ORDER BY date').all(first, end);
  for (const { date } of dates) for (const item of shoppingList(db, date, date)) {
    const amount = consumeStocks(stocks, item, date);
    if (countFrom && date >= countFrom && amount > 0) covered.push({ ...item, amount });
  }
  return { stocks, covered: groupIngredients(covered) };
}

function pantry(db) {
  const today = dateKey(new Date());
  const remaining = new Map(reservePantry(db, addDays(today, -1)).stocks.map(item => [item.id, item.amount]));
  return pantryStocks(db).map(item => {
    return { ...item, dateStatus: !item.useBy ? null : item.useBy < today ? 'past' : item.useBy <= addDays(today, 3) ? 'soon' : 'later', remaining: item.ambiguous ? 0 : Math.round(remaining.get(item.id) * 100) / 100 };
  });
}

function pantryShopping(db, start) {
  const { covered } = reservePantry(db, addDays(start, 6), start);
  return shoppingList(db, start).map(item => {
    const stock = covered.find(row => foodKey(row) === foodKey(item));
    const used = stock ? Math.min(item.amount, inUnit(stock, item.unit)) : 0;
    return { ...item, amount: Math.max(0, Math.round((item.amount - used) * 100) / 100), fromPantry: Math.round(used * 100) / 100 };
  }).filter(item => item.amount > 0);
}

function shoppingState(db, start) {
  const checks = new Set(db.prepare('SELECT name, unit FROM shopping_checks WHERE week_start = ?').all(start).map(foodKey));
  const aisles = new Map(db.prepare('SELECT name, unit, aisle FROM shopping_aisles ORDER BY rowid').all().map(item => [foodKey(item), item.aisle]));
  return [...pantryShopping(db, start).map(item => ({ ...item, aisle: aisles.get(foodKey(item)) || null, checked: checks.has(foodKey(item)) })),
    ...db.prepare('SELECT id AS manualId, name, amount, unit, aisle, checked FROM shopping_manual WHERE week_start = ? ORDER BY id').all(start).map(item => ({ ...item, checked: Boolean(item.checked) }))];
}

function household(db) {
  return {
    avoidedIngredients: db.prepare('SELECT name FROM avoided_ingredients ORDER BY name').all().map(item => item.name),
    members: db.prepare('SELECT id, name, diet, avoided_ingredients FROM members ORDER BY name').all().map(({ avoided_ingredients, ...member }) => ({ ...member, avoidedIngredients: JSON.parse(avoided_ingredients) })),
    proteins: db.prepare('SELECT id, name, category, amount, unit FROM proteins ORDER BY name').all()
  };
}

function validateMember(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60) throw new Error('Nom invalide');
  if (!['vegan', 'vegetarian', 'pescetarian', 'omnivore'].includes(input.diet)) throw new Error('Régime invalide');
  if (input.avoidedIngredients !== undefined && (!Array.isArray(input.avoidedIngredients) || input.avoidedIngredients.length > 50 || input.avoidedIngredients.some(name => typeof name !== 'string' || !name.trim() || name.length > 80))) throw new Error('Préférences invalides : 50 ingrédients maximum');
  return { name: input.name.trim(), diet: input.diet, ...(input.avoidedIngredients !== undefined ? { avoidedIngredients: [...new Set(input.avoidedIngredients.map(name => name.trim().toLocaleLowerCase('fr')))] } : {}) };
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

function availablePantry(db, end) {
  return reservePantry(db, end).stocks.filter(item => !item.ambiguous && item.recordedOn <= end);
}

function previewMenu(db, input) {
  if (!input || !isDateKey(input.start) || new Date(`${input.start}T12:00:00Z`).getUTCDay() !== 1 || !Number.isInteger(input.maxMinutes) || input.maxMinutes < 1 || input.maxMinutes > 1440 || !Array.isArray(input.memberIds) || !Array.isArray(input.slots) || !input.slots.length || input.slots.length > 14) throw new Error('Critères du menu invalides.');
  const home = household(db);
  if (new Set(input.memberIds).size !== input.memberIds.length || input.memberIds.some(id => !Number.isInteger(id) || !home.members.some(member => member.id === id))) throw new Error('Participants inconnus.');
  const members = home.members.filter(member => input.memberIds.includes(member.id));
  const people = members.length || input.people;
  if ((home.members.length && !members.length) || !Number.isInteger(people) || people < 1 || people > 100) throw new Error('Choisis au moins une personne.');
  const existing = meals(db, input.start), seen = new Set();
  const slots = input.slots.map(item => {
    if (!item || !Number.isInteger(item.day) || item.day < 0 || item.day > 6 || !['midi', 'soir'].includes(item.slot)) throw new Error('Créneau invalide.');
    const key = `${item.day}/${item.slot}`;
    if (seen.has(key) || existing.some(meal => meal.date === addDays(input.start, item.day) && meal.slot === item.slot)) throw new Error('Créneau déjà occupé ou répété. Recharge le planning.');
    seen.add(key); return item;
  }).sort((a, b) => a.day - b.day || a.slot.localeCompare(b.slot));
  const candidates = recipes(db).filter(recipe => recipe.minutes <= input.maxMinutes && members.every(member => isDietCompatible(member.diet, recipe.diet))).map(recipe => ({ ...recipe, ...recipeTaste(recipe.ingredients, members, home.avoidedIngredients), needs: groupIngredients(recipe.ingredients.map(item => ({ ...item, amount: item.amount * people / recipe.servings }))) }));
  if (!candidates.length) throw new Error('Aucune recette adaptée aux régimes et au temps choisi.');
  for (const slot of slots) if (slot.recipeId !== undefined && (!Number.isInteger(slot.recipeId) || !candidates.some(recipe => recipe.id === slot.recipeId))) throw new Error('Le plat choisi ne respecte plus les critères du menu.');
  const stocks = availablePantry(db, addDays(input.start, 6));
  const ingredients = new Set(shoppingList(db, input.start).map(item => foodName(item.name))), used = new Map();
  existing.forEach(meal => [meal.recipeId, ...(meal.dishes || []).map(dish => dish.recipeId)].filter(Boolean).forEach(id => used.set(id, (used.get(id) || 0) + 1)));
  // ponytail: greedy chronological choice, not a global menu optimization.
  // Reserve manual choices first, including later meals, before proposing the rest.
  return [...slots].sort((a, b) => Number(b.recipeId !== undefined) - Number(a.recipeId !== undefined)).map(slot => {
    const date = addDays(input.start, slot.day);
    const stockFor = item => matchingStocks(stocks, item, date);
    const ranked = candidates.map(recipe => {
      const relevant = recipe.needs.filter(item => isAntiWasteIngredient(item.name));
      const covered = relevant.filter(item => stockFor(item).reduce((sum, stock) => sum + inUnit(stock, item.unit), 0) + 1e-8 >= item.amount);
      return { recipe, covered, soon: covered.filter(item => stockFor(item).some(stock => stock.amount > 0 && stock.useBy && stock.useBy <= addDays(date, 3))).length, reused: relevant.filter(item => ingredients.has(foodName(item.name))).length };
    }).sort((a, b) => ((used.get(a.recipe.id) || 0) * 2 + tasteRank(a.recipe)) - ((used.get(b.recipe.id) || 0) * 2 + tasteRank(b.recipe)) || tasteRank(a.recipe) - tasteRank(b.recipe) || b.soon - a.soon || b.covered.length - a.covered.length || b.reused - a.reused || a.recipe.title.localeCompare(b.recipe.title, 'fr'));
    const { recipe, covered } = slot.recipeId === undefined ? ranked[0] : ranked.find(item => item.recipe.id === slot.recipeId);
    used.set(recipe.id, (used.get(recipe.id) || 0) + 1);
    recipe.needs.forEach(item => {
      ingredients.add(foodName(item.name));
      consumeStocks(stocks, item, date);
    });
    return { day: slot.day, slot: slot.slot, recipeId: recipe.id, pantryIngredients: covered.map(item => item.name) };
  }).sort((a, b) => a.day - b.day || a.slot.localeCompare(b.slot));
}

function suggestions(db, start = null, maxMinutes = null, memberIds = null, targetDate = start || dateKey(new Date())) {
  // Stock is an estimate: reserve existing meals through the suggested week before ranking.
  const home = household(db);
  const members = memberIds === null ? home.members : home.members.filter(member => memberIds.includes(member.id));
  if (memberIds !== null && (!Array.isArray(memberIds) || memberIds.some(id => !home.members.some(member => member.id === id)))) throw new Error('Participants inconnus');
  const memberDiets = members.map(member => member.diet);
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
    SELECT ingredients.name, ingredients.unit, recipe_ingredients.amount, recipe_ingredients.preparation FROM recipe_ingredients
    JOIN ingredients ON ingredients.id = recipe_ingredients.ingredient_id
    WHERE recipe_ingredients.recipe_id = ? ORDER BY ingredients.name
  `);
  const plannedIngredients = new Set(start ? shoppingList(db, start).map(item => item.name) : []);
  const stocks = availablePantry(db, start ? addDays(start, 6) : targetDate).filter(item => item.recordedOn <= targetDate && (!item.useBy || item.useBy >= targetDate));
  const plannedRecipeIds = new Set(start ? db.prepare(`
    SELECT recipe_id AS id FROM meals WHERE date BETWEEN ? AND ? AND recipe_id IS NOT NULL
    UNION SELECT meal_dishes.recipe_id AS id FROM meal_dishes JOIN meals ON meals.id = meal_dishes.meal_id WHERE meals.date BETWEEN ? AND ?
  `).all(start, addDays(start, 6), start, addDays(start, 6)).map(item => item.id) : []);
  const ranked = candidates.map(recipe => ({ ...recipe, ...recipeTaste(ingredientQuery.all(recipe.id), members, home.avoidedIngredients) })).map(recipe => ({
    ...recipe,
    tags: recipe.tags.split(',').filter(Boolean),
    reusedIngredients: [...new Set(ingredientQuery.all(recipe.id).map(item => foodName(item.name)).filter(name => isAntiWasteIngredient(name) && plannedIngredients.has(name)))],
    pantryIngredients: [...new Set(groupIngredients(ingredientQuery.all(recipe.id)).filter(item => {
      return isAntiWasteIngredient(item.name) && matchingStocks(stocks, item, targetDate).reduce((sum, stock) => sum + inUnit(stock, item.unit), 0) + 1e-8 >= item.amount * (members.length || recipe.servings) / recipe.servings;
    }).map(item => item.name))],
    alreadyPlanned: plannedRecipeIds.has(recipe.id)
  })).map(recipe => ({ ...recipe, useSoonIngredients: [...new Set(groupIngredients(ingredientQuery.all(recipe.id)).filter(item => recipe.pantryIngredients.includes(item.name) && matchingStocks(stocks, item, targetDate).some(stock => stock.amount > 0 && stock.useBy && stock.useBy <= addDays(targetDate, 3))).map(item => item.name))] })).sort((left, right) =>
    tasteRank(left) - tasteRank(right) ||
    Number(left.alreadyPlanned) - Number(right.alreadyPlanned) ||
    right.useSoonIngredients.length - left.useSoonIngredients.length ||
    right.pantryIngredients.length - left.pantryIngredients.length ||
    right.reusedIngredients.length - left.reusedIngredients.length ||
    Number(Boolean(left.lastEaten)) - Number(Boolean(right.lastEaten)) ||
    String(left.lastEaten || '').localeCompare(String(right.lastEaten || '')) ||
    left.title.localeCompare(right.title, 'fr')
  );
  return ranked.slice(0, 3);
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
    if (dish.proteinId != null) {
      if (!Number.isInteger(dish.proteinId)) throw new Error('Protéine invalide');
      const protein = db.prepare('SELECT category FROM proteins WHERE id = ?').get(dish.proteinId);
      if (!protein || !isCompatible(member.diet, protein.category)) throw new Error('Protéine incompatible avec le régime');
    }
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

function upsertMeal(db, meal, transactional = true) {
  if (transactional) db.exec('BEGIN');
  try {
    if (db.prepare('SELECT 1 FROM meals rest JOIN meals source ON source.id = rest.leftover_of WHERE source.date = ? AND source.slot = ?').get(meal.date, meal.slot)) throw new Error('Retire d’abord les repas de restes liés à ce repas.');
    db.prepare(`
      INSERT INTO meals (date, slot, location, occasion, people, recipe_id, title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (date, slot) DO UPDATE SET
        location = excluded.location,
        occasion = excluded.occasion,
        people = excluded.people,
        recipe_id = excluded.recipe_id,
        title = excluded.title,
        leftover_of = NULL
    `).run(meal.date, meal.slot, meal.location, meal.occasion, meal.people, meal.recipeId, meal.title);
    const mealId = db.prepare('SELECT id FROM meals WHERE date = ? AND slot = ?').get(meal.date, meal.slot).id;
    db.prepare('DELETE FROM meal_assignments WHERE meal_id = ?').run(mealId);
    db.prepare('DELETE FROM meal_dishes WHERE meal_id = ?').run(mealId);
    const insert = db.prepare('INSERT INTO meal_assignments (meal_id, member_id, protein_id, portions) VALUES (?, ?, ?, ?)');
    meal.assignments.forEach(assignment => insert.run(mealId, assignment.memberId, assignment.proteinId, assignment.portions));
    const insertDish = db.prepare('INSERT INTO meal_dishes (meal_id, member_id, recipe_id, portions, protein_id) VALUES (?, ?, ?, ?, ?)');
    meal.dishes.forEach(dish => insertDish.run(mealId, dish.memberId, dish.recipeId, dish.portions, dish.proteinId ?? null));
    if (transactional) db.exec('COMMIT');
  } catch (error) {
    if (transactional) db.exec('ROLLBACK');
    throw error;
  }
}

function copyMealSet(db, source, sourceStart, targetStart) {
  if (!Array.isArray(source) || !source.length) throw new Error('Cette semaine ne contient aucun repas.');
  if (source.some(meal => meal.leftoverOf && !source.some(parent => parent.id === meal.leftoverOf))) throw new Error('Cette semaine contient des restes préparés une autre semaine. Copie ces repas séparément depuis leur préparation.');
  const offset = Math.round((new Date(`${targetStart}T12:00:00Z`) - new Date(`${sourceStart}T12:00:00Z`)) / DAY_MS);
  const copied = source.map(meal => validateMeal({ ...meal, date: addDays(meal.date, offset) }, db));
  db.exec('BEGIN');
  try {
    for (const meal of copied) if (db.prepare('SELECT 1 FROM meals WHERE date=? AND slot=?').get(meal.date, meal.slot)) throw new Error('Un créneau de destination est déjà occupé. Aucun repas n’a été ajouté.');
    const ids = new Map();
    copied.forEach((meal, index) => {
      upsertMeal(db, meal, false);
      const id = db.prepare('SELECT id FROM meals WHERE date=? AND slot=?').get(meal.date, meal.slot).id;
      ids.set(source[index].id, id);
      if (source[index].leftoverOf) db.prepare('UPDATE meals SET leftover_of=? WHERE id=?').run(ids.get(source[index].leftoverOf), id);
    });
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return copied.length;
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

function calendar(db, start) {
  const escape = value => String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const events = meals(db, start).flatMap(meal => {
    const date = meal.date.replace(/-/g, '');
    const nextDate = addDays(meal.date, 1).replace(/-/g, '');
    const slot = meal.slot === 'midi' ? 'Midi' : 'Soir';
    const place = meal.location === 'home' ? 'Maison' : meal.location === 'restaurant' ? 'Restaurant' : 'Extérieur';
    return ['BEGIN:VEVENT', `UID:meal-${meal.id}@manger`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${nextDate}`, `SUMMARY:${escape(`${slot} — ${meal.title}`)}`, `DESCRIPTION:${escape(`${place} · ${meal.people} personne${meal.people > 1 ? 's' : ''}`)}`, 'END:VEVENT'];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Manger!//FR', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

async function readJson(request, maxSize = 32_768) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) throw new Error('Requête trop volumineuse');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('JSON invalide');
  }
}

function createHandler(db) {
  let importingUrl = false;
  let backingUp = false;
  const restoration = createRestore(db);
  let restoring = false, activeRequests = 0;
  return async (request, response) => {
    if (restoring) return sendJson(response, 503, { error: 'Restauration en cours. Réessaie dans un instant.' });
    activeRequests++;
    const url = new URL(request.url, 'http://localhost');
    try {
      if (request.method === 'POST' && ['/api/restore/preview', '/api/restore/apply'].includes(url.pathname)) {
        if (request.headers['x-manger-restore'] !== '1') return sendJson(response, 403, { error: 'Utilise la restauration dans Mon foyer.' });
        if (activeRequests !== 1) return sendJson(response, 409, { error: 'Une opération est en cours. Réessaie dans un instant.' });
        restoring = true;
        try {
          const result = url.pathname.endsWith('/preview') ? await restoration.preview(request) : await restoration.apply((await readJson(request))?.token);
          return sendJson(response, 200, result);
        } finally { restoring = false; }
      }
      if (request.method === 'GET' && url.pathname === '/api/health') {
        db.prepare('SELECT 1').get();
        return sendJson(response, 200, { status: 'ok', version: require('./package.json').version });
      }
      if (request.method === 'GET' && url.pathname === '/api/backup') {
        if (request.headers['x-manger-backup'] !== '1') return sendJson(response, 403, { error: 'Utilise le bouton Sauvegarde dans Mon foyer.' });
        if (backingUp) return sendJson(response, 409, { error: 'Une sauvegarde est déjà en cours. Réessaie dans un instant.' });
        backingUp = true;
        let folder;
        try {
          folder = await mkdtemp(join(tmpdir(), 'manger-backup-'));
          const filename = join(folder, 'manger.db');
          await backup(db, filename);
          const info = await stat(filename);
          response.writeHead(200, { 'Content-Type': 'application/vnd.sqlite3', 'Content-Length': info.size, 'Content-Disposition': `attachment; filename="manger-${dateKey(new Date())}.db"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          await pipeline(createReadStream(filename), response);
        } catch {
          if (!response.headersSent && !response.destroyed) sendJson(response, 503, { error: 'Sauvegarde indisponible. Réessaie dans un instant.' });
          else response.destroy();
        } finally {
          try { if (folder) await rm(folder, { recursive: true, force: true }); }
          catch { console.error('Impossible de nettoyer un fichier temporaire de sauvegarde.'); }
          finally { backingUp = false; }
        }
        return;
      }
      const offlineAssets = { '/sw.js': 'text/javascript', '/offline.html': 'text/html', '/manifest.webmanifest': 'application/manifest+json', '/icon.svg': 'image/svg+xml', '/apple-touch-icon.png': 'image/png', '/icon-180.png': 'image/png', '/icon-192.png': 'image/png', '/icon-512.png': 'image/png' };
      if (request.method === 'GET' && Object.hasOwn(offlineAssets, url.pathname)) {
        response.writeHead(200, { 'Content-Type': offlineAssets[url.pathname] + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
        return response.end(readFileSync(join(__dirname, 'public', url.pathname === '/apple-touch-icon.png' ? 'icon-180.png' : url.pathname.slice(1))));
      }
      if (request.method === 'GET' && ['/ui-icons.js', '/tastes.js', '/food-names.js', '/seasons.js', '/offline-recipes.js', '/offline-shopping.js'].includes(url.pathname)) {
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
        return response.end(readFileSync(join(__dirname, 'public', url.pathname.slice(1))));
      }
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

      if (request.method === 'GET' && url.pathname === '/api/shopping') {
        const start = url.searchParams.get('start');
        if (!isDateKey(start)) return sendJson(response, 400, { error: 'Début de semaine invalide' });
        return sendJson(response, 200, shoppingState(db, start));
      }
      if (request.method === 'GET' && url.pathname === '/api/week') {
        const start = url.searchParams.get('start');
        if (!isDateKey(start)) return sendJson(response, 400, { error: 'Début de semaine invalide' });
        return sendJson(response, 200, { recipes: recipes(db), meals: meals(db, start), shopping: shoppingState(db, start) });
      }
      if (request.method === 'GET' && url.pathname === '/api/pantry') return sendJson(response, 200, pantry(db));
      if (request.method === 'POST' && url.pathname === '/api/pantry') {
        const input = await readJson(request);
        if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.unit !== 'string' || !input.unit.trim() || input.unit.length > 24 || typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1000000) throw new Error('Indique un aliment, une unité et une quantité positive.');
        if (input.useBy != null && (typeof input.useBy !== 'string' || !isDateKey(input.useBy))) throw new Error('Date du placard invalide.');
        if (input.newLot !== undefined && typeof input.newLot !== 'boolean') throw new Error('Lot invalide.');
        if (input.id !== undefined && (!Number.isInteger(input.id) || input.id < 1 || input.newLot)) throw new Error('Lot invalide.');
        const item = { name: foodName(input.name), unit: input.unit.trim(), amount: input.amount };
        const key = foodKey(item);
        const existing = db.prepare('SELECT id, name, unit, food_key AS storageKey, explicit_lot AS explicitLot, use_by AS useBy FROM pantry').all().filter(row => input.id !== undefined ? row.id === input.id : !input.newLot && foodKey(row) === key);
        if (input.id !== undefined && (!existing.length || foodKey(existing[0]) !== key)) throw new Error('Lot inconnu ou aliment modifié.');
        if (existing.length > 1) throw new Error('Plusieurs stocks correspondent à cet aliment. Retire les doublons du placard puis saisis la quantité totale actuelle.');
        if (existing.length === 1) {
          db.prepare('UPDATE pantry SET food_key=?, name=?, unit=?, amount=?, recorded_on=?, use_by=? WHERE id=?').run(existing[0].explicitLot || input.id !== undefined ? existing[0].storageKey : key, item.name, item.unit, item.amount, dateKey(new Date()), input.useBy === undefined ? existing[0].useBy : input.useBy, existing[0].id);
          return sendJson(response, 200, pantry(db));
        }
        if (db.prepare('SELECT COUNT(*) AS n FROM pantry').get().n >= 500) throw new Error('Le placard peut contenir 500 lots maximum.');
        db.prepare('INSERT INTO pantry (food_key, name, unit, amount, recorded_on, use_by, explicit_lot) VALUES (?, ?, ?, ?, ?, ?, ?)').run(input.newLot ? `lot:${randomUUID()}` : key, item.name, item.unit, item.amount, dateKey(new Date()), input.useBy ?? null, input.newLot ? 1 : 0);
        return sendJson(response, 200, pantry(db));
      }
      const pantryMatch = url.pathname.match(/^\/api\/pantry\/(\d+)$/);
      if (request.method === 'DELETE' && pantryMatch) {
        if (!db.prepare('DELETE FROM pantry WHERE id = ?').run(Number(pantryMatch[1])).changes) throw new Error('Aliment inconnu');
        return sendJson(response, 200, pantry(db));
      }
      const photoMatch = url.pathname.match(/^\/api\/recipes\/(\d+)\/photo$/);
      if (request.method === 'GET' && photoMatch) {
        const photo = db.prepare('SELECT data FROM recipe_photos WHERE recipe_id = ?').get(Number(photoMatch[1]));
        if (!photo) return sendJson(response, 404, { error: 'Photo absente' });
        response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': photo.data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return response.end(photo.data);
      }
      if (request.method === 'GET' && url.pathname === '/api/recipes/export') {
        response.setHeader('Content-Disposition', 'attachment; filename="manger-recettes.json"');
        return sendJson(response, 200, { format: 'manger-recipes', version: 1, recipes: recipes(db).map(({ id, favorite, hasPhoto, rating, note, ...recipe }) => recipe) });
      }
      if (request.method === 'POST' && url.pathname === '/api/recipes/import-preview') {
        const input = await readJson(request, 1048576);
        if (!input || !['url', 'file'].includes(input.kind)) throw new Error('Import invalide');
        let result;
        if (input.kind === 'url') {
          if (importingUrl) throw new Error('Un import internet est déjà en cours, réessaie dans un instant');
          importingUrl = true;
          try { const page = await downloadRecipePage(input.url); result = extractRecipeDraft(page.html, page.sourceUrl); }
          finally { importingUrl = false; }
        } else {
          if (!input.data || input.data.format !== 'manger-recipes' || input.data.version !== 1 || !Array.isArray(input.data.recipes) || input.data.recipes.length < 1 || input.data.recipes.length > 200) throw new Error('Fichier Manger! version 1 attendu (1 à 200 recettes)');
          result = { recipes: input.data.recipes, warnings: ['Sélectionne une recette puis vérifie-la. L’import crée une nouvelle recette, sans remplacer les recettes existantes.'] };
        }
        const validated = result.recipes.map(recipe => {
          const missingSteps = input.kind === 'file' && Array.isArray(recipe?.steps) && recipe.steps.length === 0;
          const safeRecipe = { ...recipe, photo: undefined, photoCopyId: undefined };
          const draft = validateRecipe(missingSteps ? { ...safeRecipe, steps: [{ kind: 'prep', instruction: 'À compléter', minutes: null }] } : safeRecipe);
          if (missingSteps) { draft.steps = []; result.warnings.push(`« ${draft.title} » n’a pas encore d’étapes : complète-les dans le brouillon avant d’enregistrer.`); }
          return draft;
        });
        if (validated.some(recipe => recipe.ingredients.some(item => item.preparation === 'unknown'))) result.warnings.push('Cru/cuit non précisé pour certains ingrédients : complète « Servi » dans leurs détails si nécessaire pour les goûts du foyer. Aucune cuisson n’est déduite automatiquement.');
        return sendJson(response, 200, { recipes: validated, warnings: result.warnings });
      }

      if (request.method === 'GET' && url.pathname === '/api/calendar.ics') {
        const start = url.searchParams.get('start');
        if (!isDateKey(start)) throw new Error('Début de semaine invalide');
        const body = Buffer.from(calendar(db, start));
        // Request a regular file download rather than a direct calendar handoff.
        const contentType = url.searchParams.get('download') === '1' ? 'application/octet-stream' : 'text/calendar; charset=utf-8';
        response.writeHead(200, { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="manger-${start}.ics"`, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
        response.end(body);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/suggestions') {
        const start = url.searchParams.get('start');
        const maxMinutesValue = url.searchParams.get('maxMinutes');
        const maxMinutes = maxMinutesValue == null ? null : Number(maxMinutesValue);
        if (start != null && !isDateKey(start)) throw new Error('Début de semaine invalide');
        const targetDate = url.searchParams.get('date') || start || dateKey(new Date());
        if (!isDateKey(targetDate) || (start && (targetDate < start || targetDate > addDays(start, 6)))) throw new Error('Date de suggestion invalide');
        if (maxMinutes != null && (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 1440)) throw new Error('Temps disponible invalide');
        const memberIds = url.searchParams.has('members') ? url.searchParams.get('members').split(',').filter(Boolean).map(Number) : null;
        return sendJson(response, 200, suggestions(db, start, maxMinutes, memberIds, targetDate));
      }

      if (request.method === 'POST' && url.pathname === '/api/week/preview') {
        return sendJson(response, 200, previewMenu(db, await readJson(request)));
      }

      if (request.method === 'GET' && url.pathname === '/api/week-templates') {
        return sendJson(response, 200, db.prepare('SELECT id, name, created_at AS createdAt, json_array_length(meals_json) AS mealCount FROM week_templates ORDER BY name COLLATE NOCASE').all());
      }
      if (request.method === 'POST' && url.pathname === '/api/week-templates') {
        const input = await readJson(request), name = typeof input?.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 60 || !isDateKey(input.start) || new Date(`${input.start}T12:00:00Z`).getUTCDay() !== 1) throw new Error('Nom ou semaine type invalide.');
        const source = meals(db, input.start);
        if (!source.length) throw new Error('Cette semaine ne contient aucun repas.');
        if (source.some(meal => meal.leftoverOf && !source.some(parent => parent.id === meal.leftoverOf))) throw new Error('Cette semaine contient des restes préparés une autre semaine.');
        if (db.prepare('SELECT COUNT(*) AS n FROM week_templates').get().n >= 30) throw new Error('Tu peux conserver 30 semaines types maximum.');
        try {
          const result = db.prepare('INSERT INTO week_templates (name, source_start, meals_json, created_at) VALUES (?, ?, ?, ?)').run(name, input.start, JSON.stringify(source), new Date().toISOString());
          return sendJson(response, 201, { id: Number(result.lastInsertRowid), name, mealCount: source.length });
        } catch (error) {
          if (error.code === 'ERR_SQLITE_ERROR' && /UNIQUE/.test(error.message)) throw new Error('Une semaine type porte déjà ce nom.');
          throw error;
        }
      }
      const templateApply = url.pathname.match(/^\/api\/week-templates\/(\d+)\/apply$/);
      if (request.method === 'POST' && templateApply) {
        const input = await readJson(request), targetStart = input?.targetStart;
        if (!isDateKey(targetStart) || new Date(`${targetStart}T12:00:00Z`).getUTCDay() !== 1) throw new Error('Semaine de destination invalide.');
        const template = db.prepare('SELECT source_start AS sourceStart, meals_json AS mealsJson FROM week_templates WHERE id=?').get(Number(templateApply[1]));
        if (!template) throw new Error('Semaine type inconnue.');
        return sendJson(response, 200, { added: copyMealSet(db, JSON.parse(template.mealsJson), template.sourceStart, targetStart) });
      }
      const templateDelete = url.pathname.match(/^\/api\/week-templates\/(\d+)$/);
      if (request.method === 'DELETE' && templateDelete) {
        if (!db.prepare('DELETE FROM week_templates WHERE id=?').run(Number(templateDelete[1])).changes) throw new Error('Semaine type inconnue.');
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === 'POST' && url.pathname === '/api/week/copy') {
        const input = await readJson(request);
        if (!input || !isDateKey(input.sourceStart) || !isDateKey(input.targetStart) || input.sourceStart === input.targetStart || [input.sourceStart, input.targetStart].some(date => new Date(`${date}T12:00:00Z`).getUTCDay() !== 1)) throw new Error('Choisis deux semaines différentes, commençant un lundi.');
        const source = meals(db, input.sourceStart);
        if (input.sourceSnapshot !== JSON.stringify(source)) throw new Error('La semaine source a changé. Recharge son aperçu.');
        return sendJson(response, 200, { added: copyMealSet(db, source, input.sourceStart, input.targetStart) });
      }

      if (request.method === 'POST' && url.pathname === '/api/week/plan') {
        const input = await readJson(request);
        if (!input || !isDateKey(input.start) || !Array.isArray(input.meals) || input.meals.length < 1 || input.meals.length > 14) throw new Error('Menu hebdomadaire invalide');
        const seen = new Set();
        const meals = input.meals.map(item => {
          const meal = validateMeal(item, db);
          const slotKey = `${meal.date}/${meal.slot}`;
          if (meal.date < input.start || meal.date > addDays(input.start, 6) || seen.has(slotKey) || meal.location !== 'home' || meal.occasion !== 'regular' || (!meal.recipeId && !meal.dishes.length)) throw new Error('Créneau du menu invalide');
          seen.add(slotKey);
          if (db.prepare('SELECT 1 FROM meals WHERE date = ? AND slot = ?').get(meal.date, meal.slot)) throw new Error('Un repas est déjà prévu sur ce créneau. Recomposez votre menu.');
          if (meal.recipeId) {
            const recipe = db.prepare('SELECT diet FROM recipes WHERE id = ?').get(meal.recipeId);
            const members = db.prepare('SELECT diet FROM members').all();
            if (!meal.assignments.length && members.some(member => !isDietCompatible(member.diet, recipe.diet))) throw new Error('Recette incompatible avec le foyer');
          }
          return meal;
        });
        db.exec('BEGIN');
        try {
          meals.forEach(meal => {
            if (db.prepare('SELECT 1 FROM meals WHERE date = ? AND slot = ?').get(meal.date, meal.slot)) throw new Error('Un repas est déjà prévu sur ce créneau. Recomposez votre menu.');
            upsertMeal(db, meal, false);
          });
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        return sendJson(response, 200, { added: meals.length });
      }

      if (request.method === 'GET' && url.pathname === '/api/household') {
        return sendJson(response, 200, household(db));
      }
      if (request.method === 'PUT' && url.pathname === '/api/household/preferences') {
        const input = await readJson(request);
        if (!input || !Array.isArray(input.avoidedIngredients) || input.avoidedIngredients.length > 50 || input.avoidedIngredients.some(name => typeof name !== 'string' || !name.trim() || name.length > 80)) throw new Error('Préférences invalides : 50 mots ou expressions maximum');
        const names = [...new Set(input.avoidedIngredients.map(name => name.trim().toLocaleLowerCase('fr')))];
        db.exec('BEGIN');
        try {
          db.exec('DELETE FROM avoided_ingredients');
          const insert = db.prepare('INSERT INTO avoided_ingredients (name) VALUES (?)');
          names.forEach(name => insert.run(name));
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return sendJson(response, 200, { avoidedIngredients: names });
      }

      if (request.method === 'POST' && url.pathname === '/api/members') {
        const member = validateMember(await readJson(request));
        const id = Number(db.prepare('INSERT INTO members (name, diet, avoided_ingredients) VALUES (?, ?, ?)').run(member.name, member.diet, JSON.stringify(member.avoidedIngredients || [])).lastInsertRowid);
        return sendJson(response, 201, { id, ...member });
      }

      const memberMatch = url.pathname.match(/^\/api\/members\/(\d+)$/);
      if (request.method === 'PUT' && memberMatch) {
        const id = Number(memberMatch[1]);
        const member = validateMember(await readJson(request));
        if (db.prepare('UPDATE members SET name = ?, diet = ?, avoided_ingredients = COALESCE(?, avoided_ingredients) WHERE id = ?').run(member.name, member.diet, member.avoidedIngredients === undefined ? null : JSON.stringify(member.avoidedIngredients), id).changes === 0) throw new Error('Membre inconnu');
        return sendJson(response, 200, { id, ...member });
      }
      if (request.method === 'DELETE' && memberMatch) {
        if (db.prepare('DELETE FROM members WHERE id = ?').run(Number(memberMatch[1])).changes === 0) throw new Error('Membre inconnu');
        return sendJson(response, 200, {});
      }

      if (request.method === 'POST' && url.pathname === '/api/proteins') {
        const protein = validateProtein(await readJson(request));
        const id = Number(db.prepare('INSERT INTO proteins (name, category, amount, unit) VALUES (?, ?, ?, ?)').run(protein.name, protein.category, protein.amount, protein.unit).lastInsertRowid);
        return sendJson(response, 201, { id, ...protein });
      }

      const proteinMatch = url.pathname.match(/^\/api\/proteins\/(\d+)$/);
      if (request.method === 'PUT' && proteinMatch) {
        const id = Number(proteinMatch[1]);
        const protein = validateProtein(await readJson(request));
        const diets = db.prepare('SELECT members.diet FROM meal_assignments JOIN members ON members.id = meal_assignments.member_id WHERE protein_id = ? UNION ALL SELECT members.diet FROM meal_dishes JOIN members ON members.id = meal_dishes.member_id WHERE protein_id = ?').all(id, id);
        if (diets.some(member => !isCompatible(member.diet, protein.category))) throw new Error('Cette catégorie est incompatible avec un repas déjà planifié');
        if (db.prepare('UPDATE proteins SET name = ?, category = ?, amount = ?, unit = ? WHERE id = ?').run(protein.name, protein.category, protein.amount, protein.unit, id).changes === 0) throw new Error('Protéine inconnue');
        return sendJson(response, 200, { id, ...protein });
      }
      if (request.method === 'DELETE' && proteinMatch) {
        const id = Number(proteinMatch[1]);
        if (db.prepare('SELECT 1 FROM meal_assignments WHERE protein_id = ? UNION ALL SELECT 1 FROM meal_dishes WHERE protein_id = ?').get(id, id)) throw new Error('Cette protéine est utilisée dans le planning');
        if (db.prepare('DELETE FROM proteins WHERE id = ?').run(id).changes === 0) throw new Error('Protéine inconnue');
        return sendJson(response, 200, {});
      }

      if (request.method === 'POST' && url.pathname === '/api/shopping-checks/sync') {
        const input = await readJson(request);
        if (!input || !isDateKey(input.weekStart) || !Array.isArray(input.items) || !input.items.length || input.items.length > 200
          || input.items.some(item => !item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80
            || typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length > 24 || !Number.isFinite(item.amount) || item.amount <= 0
            || (item.manualId != null && (!Number.isSafeInteger(item.manualId) || item.manualId < 1)))) throw new Error('Achats hors connexion invalides.');
        const identity = item => item.manualId == null ? foodKey(item) : `manual:${item.manualId}`;
        if (new Set(input.items.map(identity)).size !== input.items.length) throw new Error('Article envoyé plusieurs fois.');
        const accepted = [], rejected = [];
        db.exec('BEGIN');
        try {
          const current = shoppingState(db, input.weekStart);
          for (const [index, item] of input.items.entries()) {
            const match = current.find(row => identity(row) === identity(item));
            if (!match || foodKey(match) !== foodKey(item) || match.amount !== item.amount) { rejected.push(index); continue; }
            // Only mark existing, unchanged items bought. A retry is harmless while the item stays checked.
            if (!match.checked) {
              if (match.manualId != null) db.prepare('UPDATE shopping_manual SET checked = 1 WHERE id = ? AND week_start = ?').run(match.manualId, input.weekStart);
              else db.prepare('INSERT OR IGNORE INTO shopping_checks (week_start, name, unit) VALUES (?, ?, ?)').run(input.weekStart, match.name, match.unit);
            }
            accepted.push(index);
          }
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return sendJson(response, 200, { accepted, rejected });
      }

      if (request.method === 'POST' && url.pathname === '/api/shopping-checks') {
        const input = await readJson(request);
        if (!input || !isDateKey(input.weekStart) || typeof input.name !== 'string' || !input.name || input.name.length > 80 || typeof input.unit !== 'string' || !input.unit || input.unit.length > 24 || typeof input.checked !== 'boolean') throw new Error('Article invalide');
        if (input.manualId != null) {
          if (!Number.isSafeInteger(input.manualId) || db.prepare('UPDATE shopping_manual SET checked = ? WHERE id = ? AND week_start = ?').run(Number(input.checked), input.manualId, input.weekStart).changes === 0) throw new Error('Article inconnu');
          return sendJson(response, 200, {});
        }
        for (const item of db.prepare('SELECT name, unit FROM shopping_checks WHERE week_start = ?').all(input.weekStart)) {
          if (foodKey(item) === foodKey(input)) db.prepare('DELETE FROM shopping_checks WHERE week_start = ? AND name = ? AND unit = ?').run(input.weekStart, item.name, item.unit);
        }
        if (input.checked) db.prepare('INSERT INTO shopping_checks (week_start, name, unit) VALUES (?, ?, ?)').run(input.weekStart, input.name, input.unit);
        return sendJson(response, 200, {});
      }

      if (request.method === 'POST' && url.pathname === '/api/shopping-aisles') {
        const input = await readJson(request);
        if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.unit !== 'string' || !input.unit.trim() || input.unit.length > 24 || !['', 'Fruits et légumes', 'Frais', 'Épicerie', 'Surgelés', 'Maison', 'Autres'].includes(input.aisle)) throw new Error('Rayon invalide');
        if (input.manualId != null) {
          if (!Number.isSafeInteger(input.manualId) || !isDateKey(input.weekStart) || db.prepare('UPDATE shopping_manual SET aisle = ? WHERE id = ? AND week_start = ?').run(input.aisle, input.manualId, input.weekStart).changes === 0) throw new Error('Article inconnu');
        } else {
          for (const item of db.prepare('SELECT name, unit FROM shopping_aisles').all()) {
            if (foodKey(item) === foodKey(input)) db.prepare('DELETE FROM shopping_aisles WHERE name = ? AND unit = ?').run(item.name, item.unit);
          }
          if (input.aisle) db.prepare('INSERT INTO shopping_aisles (name, unit, aisle) VALUES (?, ?, ?)').run(input.name, input.unit, input.aisle);
        }
        return sendJson(response, 200, {});
      }
      const shoppingManualMatch = url.pathname.match(/^\/api\/shopping-manual\/(\d+)$/);
      if ((request.method === 'POST' && url.pathname === '/api/shopping-manual') || (request.method === 'PUT' && shoppingManualMatch)) {
        const input = await readJson(request);
        if (!input || !isDateKey(input.weekStart) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.unit !== 'string' || !input.unit.trim() || input.unit.length > 24 || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10000 || !['', 'Fruits et légumes', 'Frais', 'Épicerie', 'Surgelés', 'Maison', 'Autres'].includes(input.aisle)) throw new Error('Article invalide');
        if (request.method === 'PUT') {
          const id = Number(shoppingManualMatch[1]), previous = input.previous;
          if (!Number.isSafeInteger(id) || id <= 0 || !previous || typeof previous.name !== 'string' || typeof previous.unit !== 'string' || typeof previous.aisle !== 'string' || !Number.isFinite(previous.amount)) throw new Error('Article invalide');
          // Ne pas écraser la modification d'un autre appareil ; l'état coché reste indépendant.
          const result = db.prepare('UPDATE shopping_manual SET name = ?, amount = ?, unit = ?, aisle = ? WHERE id = ? AND week_start = ? AND name = ? AND amount = ? AND unit = ? AND aisle = ?').run(input.name.trim(), input.amount, input.unit.trim(), input.aisle, id, input.weekStart, previous.name, previous.amount, previous.unit, previous.aisle);
          if (!result.changes) return sendJson(response, 409, { error: 'Cet article a été modifié ou supprimé ailleurs. Ferme cette fenêtre et recharge la page avant de réessayer.' });
          return sendJson(response, 200, { id });
        }
        const result = db.prepare('INSERT INTO shopping_manual (week_start, name, amount, unit, aisle) VALUES (?, ?, ?, ?, ?)').run(input.weekStart, input.name.trim(), input.amount, input.unit.trim(), input.aisle);
        return sendJson(response, 201, { id: Number(result.lastInsertRowid) });
      }
      if (request.method === 'DELETE' && shoppingManualMatch) {
        if (db.prepare('DELETE FROM shopping_manual WHERE id = ?').run(Number(shoppingManualMatch[1])).changes === 0) throw new Error('Article inconnu');
        return sendJson(response, 200, {});
      }

      if (request.method === 'POST' && url.pathname === '/api/recipes') {
        return sendJson(response, 201, saveRecipe(db, validateRecipe(await readJson(request, 600000))));
      }

      const recipeMatch = url.pathname.match(/^\/api\/recipes\/(\d+)$/);
      const favoriteMatch = url.pathname.match(/^\/api\/recipes\/(\d+)\/favorite$/);
      const notesMatch = url.pathname.match(/^\/api\/recipes\/(\d+)\/notes$/);
      if (request.method === 'PUT' && notesMatch) {
        const input = await readJson(request); const id = Number(notesMatch[1]);
        if (!input || !Number.isInteger(input.rating) || input.rating < 0 || input.rating > 5 || typeof input.note !== 'string' || input.note.length > 2000) throw new Error('Choisis une note de 0 à 5 et un commentaire de 2 000 caractères maximum.');
        if (!db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(id)) throw new Error('Recette inconnue');
        db.prepare('INSERT INTO recipe_notes (recipe_id, rating, note) VALUES (?, ?, ?) ON CONFLICT(recipe_id) DO UPDATE SET rating=excluded.rating, note=excluded.note').run(id, input.rating, input.note.trim());
        return sendJson(response, 200, { rating: input.rating, note: input.note.trim() });
      }
      if (request.method === 'PUT' && favoriteMatch) {
        const input = await readJson(request);
        const id = Number(favoriteMatch[1]);
        if (!input || typeof input.favorite !== 'boolean') throw new Error('Favori invalide');
        if (!db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(id)) throw new Error('Recette inconnue');
        if (input.favorite) db.prepare('INSERT INTO recipe_favorites (recipe_id) VALUES (?) ON CONFLICT DO NOTHING').run(id);
        else db.prepare('DELETE FROM recipe_favorites WHERE recipe_id = ?').run(id);
        return sendJson(response, 200, { favorite: input.favorite });
      }
      if (request.method === 'POST' && url.pathname === '/api/catalog/import') {
        const validated = catalog.map(validateRecipe);
        let added = 0;
        for (const recipe of validated) {
          if (!db.prepare('SELECT 1 FROM recipes WHERE title = ?').get(recipe.title)) {
            saveRecipe(db, recipe);
            added++;
          }
        }
        return sendJson(response, 200, { added });
      }
      if (request.method === 'PUT' && recipeMatch) {
        return sendJson(response, 200, saveRecipe(db, validateRecipe(await readJson(request, 600000)), Number(recipeMatch[1])));
      }
      if (request.method === 'DELETE' && recipeMatch) {
        const id = Number(recipeMatch[1]);
        const planned = db.prepare('SELECT 1 FROM meals WHERE recipe_id = ? UNION SELECT 1 FROM meal_dishes WHERE recipe_id = ?').get(id, id);
        if (planned) throw new Error('Cette recette est utilisée dans le planning');
        if (db.prepare('DELETE FROM recipes WHERE id = ?').run(id).changes === 0) throw new Error('Recette inconnue');
        return sendJson(response, 200, {});
      }

      const placementMatch = url.pathname.match(/^\/api\/meals\/(\d+)\/placement$/);
      if (request.method === 'POST' && placementMatch) {
        const input = await readJson(request); const id = Number(placementMatch[1]);
        if (!input || !['move', 'copy'].includes(input.action) || !isDateKey(input.date) || !['midi', 'soir'].includes(input.slot)) throw new Error('Date ou créneau invalide.');
        const source = db.prepare('SELECT * FROM meals WHERE id = ?').get(id);
        if (!source) throw new Error('Repas inconnu.');
        if (source.date !== input.sourceDate || source.slot !== input.sourceSlot) throw new Error('Le repas a été déplacé entre-temps. Recharge le planning.');
        if (db.prepare('SELECT 1 FROM meals WHERE date = ? AND slot = ?').get(input.date, input.slot)) throw new Error('Ce créneau est déjà occupé.');
        if (input.action === 'copy') {
          if (source.leftover_of) throw new Error('Pour prévoir plus de restes, pars du repas où tu cuisines.');
          const assignments = db.prepare('SELECT member_id AS memberId, protein_id AS proteinId, portions FROM meal_assignments WHERE meal_id = ?').all(id);
          const dishes = db.prepare('SELECT member_id AS memberId, recipe_id AS recipeId, portions, protein_id AS proteinId FROM meal_dishes WHERE meal_id = ?').all(id);
          upsertMeal(db, validateMeal({ ...source, recipeId: source.recipe_id, date: input.date, slot: input.slot, assignments, dishes }, db));
        } else {
          const earlier = (a, b) => a.date < b.date || (a.date === b.date && a.slot === 'midi' && b.slot === 'soir');
          if (source.leftover_of && !earlier(db.prepare('SELECT date, slot FROM meals WHERE id = ?').get(source.leftover_of), input)) throw new Error('Les restes doivent rester après le repas cuisiné.');
          const rest = db.prepare('SELECT date, slot FROM meals WHERE leftover_of = ?').all(id);
          if (rest.some(meal => !earlier(input, meal))) throw new Error('Le repas cuisiné doit rester avant ses restes.');
          db.prepare('UPDATE meals SET date = ?, slot = ? WHERE id = ?').run(input.date, input.slot, id);
        }
        return sendJson(response, 200, {});
      }
      if (request.method === 'POST' && url.pathname === '/api/meals/leftovers') {
        const input = await readJson(request);
        if (!input || !Number.isSafeInteger(input.sourceId) || !isDateKey(input.date) || !['midi', 'soir'].includes(input.slot)) throw new Error('Choisis une date et un créneau valides.');
        const source = db.prepare('SELECT * FROM meals WHERE id = ?').get(input.sourceId);
        const sourceDishes = source ? db.prepare('SELECT member_id AS memberId, recipe_id AS recipeId, protein_id AS proteinId FROM meal_dishes WHERE meal_id = ?').all(source.id) : [];
        if (source?.recipe_id && !sourceDishes.length) sourceDishes.push(...db.prepare('SELECT member_id AS memberId, protein_id AS proteinId FROM meal_assignments WHERE meal_id = ?').all(source.id).map(item => ({ ...item, recipeId: source.recipe_id })));
        if (!source || source.location !== 'home' || source.leftover_of || (!source.recipe_id && !sourceDishes.length)) throw new Error('Ce repas ne permet pas de prévoir des restes.');
        if (input.date < source.date || (input.date === source.date && (source.slot === 'soir' || input.slot === 'midi'))) throw new Error('Choisis un repas après celui où tu cuisines.');
        if (db.prepare('SELECT 1 FROM meals WHERE date = ? AND slot = ?').get(input.date, input.slot)) throw new Error('Ce créneau est déjà occupé.');
        const extra = db.prepare('SELECT COALESCE(SUM(people), 0) AS n FROM meals WHERE leftover_of = ?').get(source.id).n;
        let dishes = [], people = input.people;
        if (sourceDishes.length) {
          if (!Array.isArray(input.dishes) || !input.dishes.length || input.dishes.length > sourceDishes.length) throw new Error('Choisis au moins une assiette à conserver.');
          const seen = new Set();
          dishes = input.dishes.map(dish => {
            const original = sourceDishes.find(item => item.memberId === dish?.memberId);
            if (!original || seen.has(dish.memberId) || !Number.isInteger(dish.portions) || dish.portions < 1 || dish.portions > 20) throw new Error('Assiettes de restes invalides.');
            seen.add(dish.memberId); return { ...original, portions: dish.portions };
          });
          people = dishes.reduce((sum, dish) => sum + dish.portions, 0);
        } else if (!Number.isInteger(people) || people < 1 || people > 100) throw new Error('Choisis un nombre de portions valide.');
        if (source.people + extra + people > 100) throw new Error('Limite de 100 portions cuisinées par repas.');
        db.exec('BEGIN');
        try {
          const result = db.prepare('INSERT INTO meals (date, slot, location, occasion, people, recipe_id, title, leftover_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(input.date, input.slot, 'home', 'regular', people, sourceDishes.length ? null : source.recipe_id, source.title, source.id);
          const insert = db.prepare('INSERT INTO meal_dishes (meal_id, member_id, recipe_id, portions, protein_id) VALUES (?, ?, ?, ?, ?)');
          dishes.forEach(dish => insert.run(Number(result.lastInsertRowid), dish.memberId, dish.recipeId, dish.portions, dish.proteinId));
          db.exec('COMMIT');
        } catch (error) { db.exec('ROLLBACK'); throw error; }
        return sendJson(response, 201, {});
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
        if (db.prepare('SELECT 1 FROM meals rest JOIN meals source ON source.id = rest.leftover_of WHERE source.date = ? AND source.slot = ?').get(date, slot)) throw new Error('Retire d’abord les repas de restes liés à ce repas.');
        db.prepare('DELETE FROM meals WHERE date = ? AND slot = ?').run(date, slot);
        return sendJson(response, 200, {});
      }

      sendJson(response, 404, { error: 'Introuvable' });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    } finally { activeRequests--; }
  };
}

// Supplying a database is the isolated core-test harness; production always opens accounts.
function createApp(database, accounts, tls = tlsOptions(), mailer = null) {
  const production = database === undefined;
  if (production && storageEngine() === 'postgres') {
    const error = new Error('Portage PostgreSQL incomplet : lancement refusé, aucune base SQLite ouverte.');
    error.code = 'MANGER_POSTGRES_NOT_READY';
    throw error;
  }
  if (production) mailer = createInvitationMailer();
  database ||= createDatabase(process.env.MANGER_DB || join(__dirname, 'data', 'manger.db'));
  if (production) accounts = openAccounts();
  const handler = createHandler(database);
  const protectedHandler = accounts ? protectAccounts(accounts, handler, { secure: Boolean(tls) || process.env.MANGER_SECURE_COOKIE === '1', mailer, certificate: localCertificate(tls) }) : handler;
  const server = tls ? createHttpsServer(tls, protectedHandler) : createServer(protectedHandler);
  if (production) server.on('close', () => { accounts.close(); database.close(); });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.MANGER_PORT || 3000);
  const server = createApp();
  server.listen(port, '0.0.0.0', () => console.log(`Manger! écoute sur ${server.setSecureContext ? 'https' : 'http'}://localhost:${server.address().port}`));
}

module.exports = { addDays, calendar, createApp, createDatabase, dateKey, household, isCompatible, isDietCompatible, isDateKey, recipes, saveRecipe, shoppingList, suggestions, validateMeal, validateMember, validateProtein, validateRecipe };
