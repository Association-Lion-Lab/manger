const { createServer } = require('node:http');
const { createServer: createHttpsServer } = require('node:https');
const { tlsOptions, localCertificate } = require('./tls');
const { mkdirSync, createReadStream } = require('node:fs');
const { mkdtemp, rm, stat } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { pipeline } = require('node:stream/promises');
const { dirname, join } = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const catalog = require('./catalog');
const { createRestore } = require('./restore');
const { openAccounts, protectAccounts } = require('./accounts');
const { createInvitationMailer } = require('./invitation-mail');
const { storageEngine } = require('./db/storage');
const { isCompatible, isDietCompatible, validateMember, validateProtein } = require('./household');
const { sqliteHousehold } = require('./db/household-sqlite');
const { householdRoutes } = require('./household-http');
const { validateRecipe, checkedRecipe } = require('./recipe');
const { sqliteRecipes } = require('./db/recipes-sqlite');
const { recipeRoutes } = require('./recipe-http');
const { recipeExtraRoutes } = require('./recipe-extras-http');
const { dateKey,addDays,isDateKey } = require('./dates');
const { validateMealInput,checkMealReferences,calendarMeals } = require('./meal');
const { sqliteMeals } = require('./db/meals-sqlite');
const { mealRoutes } = require('./meal-http');
const { planningRoutes } = require('./planning-http');
const {sqliteCalculations}=require('./db/calculations-sqlite');
const {sqlitePantry}=require('./db/pantry-sqlite');
const {calculationRoutes}=require('./calculation-http');
const {sqliteShopping}=require('./db/shopping-sqlite');
const {shoppingRoutes}=require('./shopping-http');
const {backupRoutes}=require('./backup-http');
const {publicRoutes}=require('./public-http');


function createDatabase(filename,{seedData=true}={}) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
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
  if(seedData)seed(db);
  if (db.prepare('PRAGMA user_version').get().user_version < 1) {
    db.exec(`
      UPDATE recipes SET diet = 'vegetarian'
      WHERE diet = 'omnivore'
        AND (tags LIKE '%végétarien%' OR title = 'Gnocchis aux légumes');
      PRAGMA user_version = 1;
    `);
  }
  if(seedData)seedProteins(db);
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
  }catch(error){db.close();throw error;}
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

function recipes(db) { return sqliteRecipes(db).read(); }

function saveRecipe(db, recipe, id = null) { return checkedRecipe(sqliteRecipes(db).save(recipe, id)); }

function meals(db,start) { return sqliteMeals(db).read(start); }

function shoppingList(db,...args){return sqliteCalculations(db).shoppingList(...args);}
function household(db) {
  return sqliteHousehold(db).read();
}



function suggestions(db,...args){return sqliteCalculations(db).suggestions(...args);}

function validateMeal(input,db) { return checkMealReferences(validateMealInput(input),sqliteMeals(db).references()); }

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function calendar(db,start) { return calendarMeals(meals(db,start)); }

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
  const handleHousehold = householdRoutes(sqliteHousehold(db), sendJson);
  const handleRecipes = recipeRoutes(sqliteRecipes(db), sendJson);
  const handleRecipeExtras = recipeExtraRoutes(sqliteRecipes(db), sendJson);
  const handleMeals = mealRoutes(sqliteMeals(db), sendJson);
  const handlePlanning = planningRoutes(sqliteMeals(db), sendJson);
  const handleCalculations=calculationRoutes(sqliteCalculations(db),sqlitePantry(db),sendJson);
  const handleShopping=shoppingRoutes(sqliteShopping(db),sendJson);
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
      if(publicRoutes(request,response))return;

      if (await handleShopping(request,response)) return;
      if (await handleCalculations(request,response)) return;
      if (await handleRecipeExtras(request, response)) return;
      if (await handleMeals(request, response)) return;
      if (await handlePlanning(request, response)) return;

      if (await handleHousehold(request, response)) return;

      if (await handleRecipes(request, response)) return;


      sendJson(response, 404, { error: 'Introuvable' });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    } finally { activeRequests--; }
  };
}

// Internal candidate harness only; callers must wrap this with protectAccounts.
function createHouseholdHandler(home) {
  const handle = householdRoutes(home, sendJson);
  return async (request, response) => {
    if (!await handle(request, response)) sendJson(response, 503, { error: 'Parcours PostgreSQL non porté.' });
  };
}

// Internal candidate harness only; callers must wrap this with protectAccounts.
function createRecipeHandler(store, options = {}) {
  const handle = recipeRoutes(store, sendJson);
  const extras = recipeExtraRoutes(store, sendJson, options);
  return async (request, response) => {
    if (await handle(request, response)) return;
    if (!await extras(request, response)) sendJson(response, 503, { error: 'Parcours PostgreSQL non porté.' });
  };
}

// Internal candidate harness only; callers must wrap this with protectAccounts.
function createMealHandler(store) {
  const handle=mealRoutes(store,sendJson),planning=planningRoutes(store,sendJson);
  return async(request,response)=>{if(await handle(request,response))return;if(!await planning(request,response))sendJson(response,503,{error:'Parcours PostgreSQL non porté.'});};
}

// Internal candidate harness only; callers must wrap this with protectAccounts.
function createCalculationHandler(calc,pantry){
  const handle=calculationRoutes(calc,pantry,sendJson);
  return async(request,response)=>{if(!await handle(request,response))sendJson(response,503,{error:'Parcours PostgreSQL non porté.'});};
}

// Internal candidate harness only; callers must wrap this with protectAccounts.
function createBusinessHandler(stores){
  const routes=[householdRoutes(stores.home,sendJson),recipeRoutes(stores.recipes,sendJson),recipeExtraRoutes(stores.recipes,sendJson),mealRoutes(stores.meals,sendJson),planningRoutes(stores.meals,sendJson),calculationRoutes(stores.calc,stores.pantry,sendJson),shoppingRoutes(stores.shopping,sendJson)];
  if(stores.backup)routes.push(backupRoutes(stores.backup,sendJson));
  let restoring=false,activeRequests=0;
  return async(request,response,context)=>{
    if(restoring)return sendJson(response,503,{error:'Restauration en cours. Réessaie dans un instant.'});
    activeRequests++;
    try{
      const path=new URL(request.url,'http://localhost').pathname;
      if(stores.restoration&&request.method==='POST'&&['/api/restore/preview','/api/restore/apply'].includes(path)){
        if(request.headers['x-manger-restore']!=='1')return sendJson(response,403,{error:'Utilise la restauration dans Mon foyer.'});
        if(activeRequests!==1)return sendJson(response,409,{error:'Une opération est en cours. Réessaie dans un instant.'});
        restoring=true;
        try{
          const value=path.endsWith('/preview')?await stores.restoration.preview(request):await stores.restoration.apply((await readJson(request))?.token,{authorize:tx=>stores.auth.authorizeRestore(tx,context?.user)});
          return sendJson(response,200,value);
        }catch(error){
          if(error.code==='POSTGRES_COMMIT_UNCERTAIN')return sendJson(response,503,{error:'Impossible de confirmer la restauration. Recharge la page et vérifie le foyer avant toute nouvelle restauration.',recovery:error.recovery});
          const input=['MANGER_RESTORE_INPUT','MANGER_RESTORE_EXPIRED','MANGER_BACKUP_INPUT','MANGER_SOURCE_INVALID','MANGER_TRANSFER_INVALID'].includes(error.code);
          return sendJson(response,error.code==='MANGER_RESTORE_FORBIDDEN'?403:error.code==='MANGER_RESTORE_SIZE'?413:input?400:503,{error:input?'Sauvegarde invalide, incompatible ou aperçu expiré. Vérifie à nouveau le fichier.':'Restauration indisponible. Aucune réussite confirmée ; vérifie le foyer avant de recommencer.'});
        }finally{restoring=false;}
      }
      for(const route of routes)if(await route(request,response))return;
      sendJson(response,404,{error:'Introuvable'});
    }finally{activeRequests--;}
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
  (async()=>{
    const port=Number(process.env.MANGER_PORT||3000);
    if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Port invalide.');
    const runtime=storageEngine()==='postgres'?await require('./postgres-app').createPostgresRuntime():{server:createApp()};
    const {server}=runtime;
    if(runtime.close)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
      // HTTP and database work drain first; terminate remaining outbound transports afterwards.
      runtime.close().then(()=>process.exit(0),()=>{console.error('Arrêt du candidat non confirmé.');process.exit(1);});
    });
    server.once('error',()=>{runtime.close?.().catch(()=>{});console.error('Écoute du serveur impossible.');process.exitCode=1;});
    try{server.listen(port,'0.0.0.0',()=>console.log(`Manger! écoute sur ${server.setSecureContext?'https':'http'}://localhost:${server.address().port}`));}
    catch(error){await runtime.close?.();throw error;}
  })().catch(()=>{console.error('Démarrage refusé. Vérifie le moteur, les secrets et la préparation de la base. Aucune base SQLite de repli ouverte.');process.exitCode=1;});
}

module.exports = { addDays, calendar, createApp, createHouseholdHandler, createRecipeHandler, createMealHandler, createCalculationHandler, createBusinessHandler, createDatabase, dateKey, household, isCompatible, isDietCompatible, isDateKey, recipes, saveRecipe, shoppingList, suggestions, validateMeal, validateMember, validateProtein, validateRecipe };
