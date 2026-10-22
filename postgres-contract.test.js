const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase, createApp, recipes, saveRecipe, validateRecipe, household } = require('./server');
const { openAccounts } = require('./accounts');
const { foodKey } = require('./ingredients');

// SQLite reference contracts, not proof that PostgreSQL is already supported.
const householdColumns = {
  avoided_ingredients: 'name',
  ingredients: 'id name unit',
  meal_assignments: 'meal_id member_id protein_id portions',
  meal_dishes: 'meal_id member_id recipe_id portions protein_id',
  meals: 'id date slot location occasion people recipe_id title leftover_of',
  members: 'id name diet avoided_ingredients',
  pantry: 'id food_key name unit amount recorded_on use_by explicit_lot',
  proteins: 'id name category amount unit',
  recipe_favorites: 'recipe_id',
  recipe_ingredients: 'recipe_id ingredient_id amount preparation',
  recipe_notes: 'recipe_id rating note',
  recipe_photos: 'recipe_id data',
  recipe_steps: 'id recipe_id position kind instruction minutes',
  recipes: 'id title minutes servings tags diet instructions source_url',
  shopping_aisles: 'name unit aisle',
  shopping_checks: 'week_start name unit',
  shopping_manual: 'id week_start name amount unit aisle checked',
  week_templates: 'id name source_start meals_json created_at',
};
const accountColumns = {
  accounts: 'id username password admin active', attempts: 'key count expires',
  invitations: 'id token creator expires', sessions: 'token account_id expires',
};

function memory(t, open = createDatabase) {
  const db = open(':memory:'); t.after(() => db.close()); return db;
}

test('référence de migration : les 18 tables du foyer et les 4 tables des accès sont inventoriées', t => {
  for (const [open, expected] of [[createDatabase, householdColumns], [openAccounts, accountColumns]]) {
    const db = memory(t, open);
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    assert.deepEqual(tables.map(row => row.name), Object.keys(expected).sort());
    for (const [table, columns] of Object.entries(expected)) {
      assert.deepEqual(db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name), columns.split(' '), table);
    }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  }
});

test('référence de migration : recette, grand identifiant, précision, photo et alias de sortie préservés', async t => {
  const db = memory(t);
  const previousId = 2 ** 32;
  db.prepare('INSERT INTO recipes(id,title,minutes,servings) VALUES (?,?,?,?)').run(previousId, 'Référence', 10, 1);
  const photo = Buffer.from([255, 216, 0, 127, 255, 217]);
  const draft = {
    title: 'Œufs, été & citron 🥣', minutes: 15, servings: 2, diet: 'vegetarian', tags: ['Japon', 'été'],
    sourceUrl: 'https://example.org/recette', photo: `data:image/jpeg;base64,${photo.toString('base64')}`,
    ingredients: [{ name: 'citron', unit: 'g', amount: 0.123456789123, preparation: 'raw' }],
    steps: [{ kind: 'prep', instruction: 'Préparer le citron.', minutes: null }, { kind: 'serve', instruction: 'Servir.', minutes: 0 }],
  };
  const saved = JSON.parse(JSON.stringify(await saveRecipe(db, validateRecipe(draft))));
  assert.equal(saved.id, previousId + 1); assert.ok(Number.isSafeInteger(saved.id));
  assert.deepEqual(Object.keys(saved).sort(), ['id', 'title', 'minutes', 'servings', 'tags', 'diet', 'sourceUrl', 'hasPhoto', 'favorite', 'ingredients', 'steps'].sort());
  assert.equal(saved.title, draft.title); assert.deepEqual(saved.tags, ['japon', 'été']);
  assert.equal(saved.sourceUrl, draft.sourceUrl); assert.equal(saved.hasPhoto, true); assert.equal(saved.favorite, false);
  assert.deepEqual(saved.ingredients, draft.ingredients);
  assert.deepEqual(saved.steps, draft.steps.map((step, index) => ({ position: index + 1, ...step })));
  assert.deepEqual(Buffer.from(db.prepare('SELECT data FROM recipe_photos WHERE recipe_id=?').get(saved.id).data), photo);
  assert.deepEqual(JSON.parse(JSON.stringify((await recipes(db)).find(item => item.id === saved.id))), saved);
});

test('référence de migration : les clés opaques du placard conservent leur séparateur NUL', t => {
  const db = memory(t), key = foodKey({ name: 'Pois chiches', unit: 'kg' });
  assert.equal(key, 'pois chiches\0g');
  db.prepare('INSERT INTO pantry(food_key,name,unit,amount,recorded_on) VALUES (?,?,?,?,?)').run(key, 'pois chiches', 'kg', 0.125, '2026-12-31');
  const row = db.prepare('SELECT CAST(food_key AS BLOB) AS bytes, use_by AS useBy, explicit_lot AS explicitLot FROM pantry').get();
  assert.deepEqual(Buffer.from(row.bytes), Buffer.from(key, 'utf8'));
  assert.equal(row.useBy, null); assert.equal(row.explicitLot, 0);
});

test('référence de migration : tri binaire, accents, casse et JSON du foyer ne sont pas réinterprétés', async t => {
  const db = memory(t), titles = ['été', 'Eté', 'ete', 'Été'];
  for (const title of titles) db.prepare('INSERT INTO recipes(title,minutes,servings) VALUES (?,?,?)').run(title, 10, 1);
  const listed = (await recipes(db)).filter(item => titles.includes(item.title));
  assert.deepEqual(listed.map(item => item.title), ['Eté', 'ete', 'Été', 'été']);
  const avoided = ['tomate crue', 'œuf'];
  db.prepare('INSERT INTO members(name,diet,avoided_ingredients) VALUES (?,?,?)').run('Admin', 'vegetarian', JSON.stringify(avoided));
  const member = JSON.parse(JSON.stringify(await household(db))).members[0];
  assert.deepEqual(member, { id: 1, name: 'Admin', diet: 'vegetarian', avoidedIngredients: avoided });
});

test('référence HTTP : dates sans fuseau, valeurs nulles et identifiants camelCase restent stables', async t => {
  const db = createDatabase(':memory:'), server = createApp(db, undefined, null);
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const meal = { date: '2027-01-01', slot: 'soir', location: 'restaurant', occasion: 'regular', people: 2, recipeId: null, title: 'Chez Admin' };
  const response = await fetch(base + '/api/meals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meal) });
  assert.equal(response.status, 200);
  const weekResponse = await fetch(base + '/api/week?start=2026-12-28');
  assert.equal(weekResponse.status, 200);
  const week = await weekResponse.json();
  assert.equal(week.meals.length, 1); const saved = week.meals[0];
  assert.equal(saved.date, meal.date); assert.equal(saved.recipeId, null); assert.equal(saved.leftoverOf, null);
  assert.equal(saved.minutes, null); assert.equal(saved.extraPortions, 0); assert.ok(Number.isSafeInteger(saved.id));
  assert.ok(!Object.hasOwn(saved, 'recipeid')); assert.deepEqual(saved.assignments, []);
});
