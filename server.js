const { createServer } = require('node:http');
const { readFileSync, mkdirSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const catalog = require('./catalog');
const { foodName, foodKey, inUnit, groupIngredients } = require('./ingredients');
const { downloadRecipePage, extractRecipeDraft } = require('./recipe-import');

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
  `);
  if (!db.prepare('PRAGMA table_info(recipes)').all().some(column => column.name === 'source_url')) db.exec('ALTER TABLE recipes ADD COLUMN source_url TEXT');
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
           meals.title, recipes.minutes, leftover_of AS leftoverOf,
           COALESCE((SELECT SUM(rest.people) FROM meals rest WHERE rest.leftover_of = meals.id), 0) AS extraPortions,
           EXISTS(SELECT 1 FROM meal_assignments WHERE meal_id = meals.id) AS hasVariants
    FROM meals LEFT JOIN recipes ON recipes.id = meals.recipe_id
    WHERE date BETWEEN ? AND ? ORDER BY date, slot
  `).all(start, addDays(start, 6)).map(meal => {
    const dishes = db.prepare('SELECT member_id AS memberId, recipe_id AS recipeId, portions, recipes.minutes FROM meal_dishes JOIN recipes ON recipes.id = meal_dishes.recipe_id WHERE meal_id = ?').all(meal.id);
    return dishes.length ? { ...meal, minutes: Math.max(...dishes.map(dish => dish.minutes)), dishes: dishes.map(({ minutes, ...dish }) => dish) } : meal;
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
  `).all(start, end, start, end, start, end));
}

function pantry(db) {
  const today = dateKey(new Date());
  return db.prepare('SELECT id, name, unit, amount, recorded_on AS recordedOn FROM pantry ORDER BY name').all().map(item => {
    const previous = item.recordedOn < today ? shoppingList(db, item.recordedOn, addDays(today, -1)).find(row => foodKey(row) === foodKey(item)) : null;
    return { ...item, remaining: Math.max(0, Math.round((item.amount - (previous ? inUnit(previous, item.unit) : 0)) * 100) / 100) };
  });
}

function pantryShopping(db, start) {
  const stocks = db.prepare('SELECT name, unit, amount, recorded_on AS recordedOn FROM pantry').all();
  // Planning is a forecast: an edited stock establishes a new quantity as of today.
  const ranges = new Map();
  const range = (from, to) => {
    const key = `${from}/${to}`;
    if (!ranges.has(key)) ranges.set(key, shoppingList(db, from, to));
    return ranges.get(key);
  };
  return shoppingList(db, start).map(item => {
    const stock = stocks.find(row => foodKey(row) === foodKey(item));
    if (!stock || stock.recordedOn > addDays(start, 6)) return item;
    const prior = stock.recordedOn < start ? range(stock.recordedOn, addDays(start, -1)).find(row => foodKey(row) === foodKey(item)) : null;
    const eligible = range(stock.recordedOn > start ? stock.recordedOn : start, addDays(start, 6)).find(row => foodKey(row) === foodKey(item));
    const available = Math.max(0, inUnit(stock, item.unit) - (prior ? inUnit(prior, item.unit) : 0));
    const used = Math.min(available, eligible ? inUnit(eligible, item.unit) : 0, item.amount);
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
    members: db.prepare('SELECT id, name, diet FROM members ORDER BY name').all(),
    proteins: db.prepare('SELECT id, name, category, amount, unit FROM proteins ORDER BY name').all()
  };
}

function restaurantResults(elements, latitude, longitude) {
  const radians = value => value * Math.PI / 180;
  return elements.flatMap(element => {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!element.tags?.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const a = Math.sin(radians(lat - latitude) / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(lat)) * Math.sin(radians(lon - longitude) / 2) ** 2;
    const address = [element.tags['addr:housenumber'], element.tags['addr:street'], element.tags['addr:postcode'], element.tags['addr:city']].filter(Boolean).join(' ');
    return [{ id: `${element.type}/${element.id}`, name: element.tags.name, address: address || null, mapUrl: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`, cuisine: element.tags.cuisine?.replace(/;/g, ', ') || null, distance: Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))), latitude: lat, longitude: lon }];
  }).sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name, 'fr')).slice(0, 8);
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
  const avoided = household(db).avoidedIngredients;
  const normalize = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  // ponytail: mots dans les noms déclarés, pas une détection d'allergènes ou des ingrédients cachés.
  const ranked = candidates.filter(recipe => !ingredientQuery.all(recipe.id).some(item => avoided.some(word => normalize(item.name).includes(normalize(word))))).map(recipe => ({
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
    const insertDish = db.prepare('INSERT INTO meal_dishes (meal_id, member_id, recipe_id, portions) VALUES (?, ?, ?, ?)');
    meal.dishes.forEach(dish => insertDish.run(mealId, dish.memberId, dish.recipeId, dish.portions));
    if (transactional) db.exec('COMMIT');
  } catch (error) {
    if (transactional) db.exec('ROLLBACK');
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

function createHandler(db, overpassUrl, communesUrl) {
  let importingUrl = false;
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
      if (request.method === 'GET' && url.pathname === '/api/pantry') return sendJson(response, 200, pantry(db));
      if (request.method === 'POST' && url.pathname === '/api/pantry') {
        const input = await readJson(request);
        if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.unit !== 'string' || !input.unit.trim() || input.unit.length > 24 || typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1000000) throw new Error('Indique un aliment, une unité et une quantité positive.');
        const item = { name: foodName(input.name), unit: input.unit.trim(), amount: input.amount };
        const key = foodKey(item);
        if (!db.prepare('SELECT 1 FROM pantry WHERE food_key = ?').get(key) && db.prepare('SELECT COUNT(*) AS n FROM pantry').get().n >= 500) throw new Error('Le placard peut contenir 500 aliments maximum.');
        db.prepare('INSERT INTO pantry (food_key, name, unit, amount, recorded_on) VALUES (?, ?, ?, ?, ?) ON CONFLICT(food_key) DO UPDATE SET name=excluded.name, unit=excluded.unit, amount=excluded.amount, recorded_on=excluded.recorded_on').run(key, item.name, item.unit, item.amount, dateKey(new Date()));
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
        return sendJson(response, 200, { recipes: validated, warnings: result.warnings });
      }

      if (request.method === 'GET' && url.pathname === '/api/calendar.ics') {
        const start = url.searchParams.get('start');
        if (!isDateKey(start)) throw new Error('Début de semaine invalide');
        const body = Buffer.from(calendar(db, start));
        response.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="manger-${start}.ics"`, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
        response.end(body);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/suggestions') {
        const start = url.searchParams.get('start');
        const maxMinutesValue = url.searchParams.get('maxMinutes');
        const maxMinutes = maxMinutesValue == null ? null : Number(maxMinutesValue);
        if (start != null && !isDateKey(start)) throw new Error('Début de semaine invalide');
        if (maxMinutes != null && (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 1440)) throw new Error('Temps disponible invalide');
        return sendJson(response, 200, suggestions(db, start, maxMinutes));
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

      if (request.method === 'GET' && url.pathname === '/api/places') {
        const query = url.searchParams.get('query')?.trim();
        if (!query || query.length < 2 || query.length > 80) throw new Error('Ville ou code postal invalide');
        const target = new URL(communesUrl);
        target.searchParams.set(/^\d{5}$/.test(query) ? 'codePostal' : 'nom', query);
        target.searchParams.set('fields', 'nom,code,codesPostaux,centre');
        target.searchParams.set('boost', 'population');
        target.searchParams.set('limit', '8');
        const result = await fetch(target, { signal: AbortSignal.timeout(10_000) });
        if (!result.ok) throw new Error('La recherche de communes est temporairement indisponible');
        const places = (await result.json()).filter(place => Array.isArray(place.centre?.coordinates)).slice(0, 8).map(place => ({ name: place.nom, code: place.code, postalCodes: place.codesPostaux, longitude: place.centre.coordinates[0], latitude: place.centre.coordinates[1] }));
        return sendJson(response, 200, places);
      }

      if (request.method === 'POST' && url.pathname === '/api/restaurants') {
        const { latitude, longitude } = await readJson(request);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Position invalide');
        const query = `[out:json][timeout:8];nwr["amenity"="restaurant"](around:3000,${latitude},${longitude});out center;`;
        const overpass = await fetch(overpassUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Manger/0.1' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(10_000) });
        if (!overpass.ok) throw new Error('La recherche de restaurants est temporairement indisponible');
        return sendJson(response, 200, restaurantResults((await overpass.json()).elements || [], latitude, longitude));
      }

      if (request.method === 'POST' && url.pathname === '/api/members') {
        const member = validateMember(await readJson(request));
        const id = Number(db.prepare('INSERT INTO members (name, diet) VALUES (?, ?)').run(member.name, member.diet).lastInsertRowid);
        return sendJson(response, 201, { id, ...member });
      }

      const memberMatch = url.pathname.match(/^\/api\/members\/(\d+)$/);
      if (request.method === 'PUT' && memberMatch) {
        const id = Number(memberMatch[1]);
        const member = validateMember(await readJson(request));
        if (db.prepare('UPDATE members SET name = ?, diet = ? WHERE id = ?').run(member.name, member.diet, id).changes === 0) throw new Error('Membre inconnu');
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
        const diets = db.prepare('SELECT members.diet FROM meal_assignments JOIN members ON members.id = meal_assignments.member_id WHERE protein_id = ?').all(id);
        if (diets.some(member => !isCompatible(member.diet, protein.category))) throw new Error('Cette catégorie est incompatible avec un repas déjà planifié');
        if (db.prepare('UPDATE proteins SET name = ?, category = ?, amount = ?, unit = ? WHERE id = ?').run(protein.name, protein.category, protein.amount, protein.unit, id).changes === 0) throw new Error('Protéine inconnue');
        return sendJson(response, 200, { id, ...protein });
      }
      if (request.method === 'DELETE' && proteinMatch) {
        const id = Number(proteinMatch[1]);
        if (db.prepare('SELECT 1 FROM meal_assignments WHERE protein_id = ?').get(id)) throw new Error('Cette protéine est utilisée dans le planning');
        if (db.prepare('DELETE FROM proteins WHERE id = ?').run(id).changes === 0) throw new Error('Protéine inconnue');
        return sendJson(response, 200, {});
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
          if (!Number.isSafeInteger(input.manualId) || !isDateKey(input.weekStart) || db.prepare('UPDATE shopping_manual SET aisle = ? WHERE id = ? AND week_start = ?').run(input.aisle || 'Autres', input.manualId, input.weekStart).changes === 0) throw new Error('Article inconnu');
        } else {
          for (const item of db.prepare('SELECT name, unit FROM shopping_aisles').all()) {
            if (foodKey(item) === foodKey(input)) db.prepare('DELETE FROM shopping_aisles WHERE name = ? AND unit = ?').run(item.name, item.unit);
          }
          if (input.aisle) db.prepare('INSERT INTO shopping_aisles (name, unit, aisle) VALUES (?, ?, ?)').run(input.name, input.unit, input.aisle);
        }
        return sendJson(response, 200, {});
      }
      if (request.method === 'POST' && url.pathname === '/api/shopping-manual') {
        const input = await readJson(request);
        if (!input || !isDateKey(input.weekStart) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.unit !== 'string' || !input.unit.trim() || input.unit.length > 24 || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 10000 || !['Fruits et légumes', 'Frais', 'Épicerie', 'Surgelés', 'Maison', 'Autres'].includes(input.aisle)) throw new Error('Article invalide');
        const result = db.prepare('INSERT INTO shopping_manual (week_start, name, amount, unit, aisle) VALUES (?, ?, ?, ?, ?)').run(input.weekStart, input.name.trim(), input.amount, input.unit.trim(), input.aisle);
        return sendJson(response, 201, { id: Number(result.lastInsertRowid) });
      }
      const shoppingManualMatch = url.pathname.match(/^\/api\/shopping-manual\/(\d+)$/);
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
          const dishes = db.prepare('SELECT member_id AS memberId, recipe_id AS recipeId, portions FROM meal_dishes WHERE meal_id = ?').all(id);
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
        if (!input || !Number.isSafeInteger(input.sourceId) || !isDateKey(input.date) || !['midi', 'soir'].includes(input.slot) || !Number.isInteger(input.people) || input.people < 1 || input.people > 100) throw new Error('Choisis une date, un créneau et un nombre de portions valide.');
        const source = db.prepare('SELECT * FROM meals WHERE id = ?').get(input.sourceId);
        if (!source || source.location !== 'home' || !source.recipe_id || source.leftover_of || db.prepare('SELECT 1 FROM meal_dishes WHERE meal_id = ? UNION SELECT 1 FROM meal_assignments WHERE meal_id = ?').get(input.sourceId, input.sourceId)) throw new Error('Les restes se prévoient depuis une recette commune sans variantes individuelles.');
        if (input.date < source.date || (input.date === source.date && (source.slot === 'soir' || input.slot === 'midi'))) throw new Error('Choisis un repas après celui où tu cuisines.');
        if (db.prepare('SELECT 1 FROM meals WHERE date = ? AND slot = ?').get(input.date, input.slot)) throw new Error('Ce créneau est déjà occupé.');
        const extra = db.prepare('SELECT COALESCE(SUM(people), 0) AS n FROM meals WHERE leftover_of = ?').get(source.id).n;
        if (source.people + extra + input.people > 100) throw new Error('Limite de 100 portions cuisinées par repas.');
        db.prepare('INSERT INTO meals (date, slot, location, occasion, people, recipe_id, title, leftover_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(input.date, input.slot, 'home', 'regular', input.people, source.recipe_id, source.title, source.id);
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
    }
  };
}

function createApp(database = createDatabase(process.env.MANGER_DB || join(__dirname, 'data', 'manger.db')), overpassUrl = process.env.MANGER_OVERPASS_URL || 'https://overpass-api.de/api/interpreter', communesUrl = process.env.MANGER_COMMUNES_URL || 'https://geo.api.gouv.fr/communes') {
  return createServer(createHandler(database, overpassUrl, communesUrl));
}

if (require.main === module) {
  const port = Number(process.env.MANGER_PORT || 3000);
  const server = createApp();
  server.listen(port, '0.0.0.0', () => console.log(`Manger! écoute sur http://localhost:${port}`));
}

module.exports = { addDays, calendar, createApp, createDatabase, dateKey, household, isCompatible, isDietCompatible, isDateKey, recipes, restaurantResults, saveRecipe, shoppingList, suggestions, validateMeal, validateMember, validateProtein, validateRecipe };
