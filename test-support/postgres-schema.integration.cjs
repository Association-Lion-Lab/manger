const test = require('node:test');
const assert = require('node:assert/strict');
const { postgresFixture } = require('./postgres');
const { migrateSchema } = require('../db/postgres-schema');
const initial = require('../db/migrations/001-initial');
const { createDatabase } = require('../server');
const { openAccounts } = require('../accounts');

function intercept(pool, transform) {
  return {connect(callback){pool.connect((error,client)=>{
    if(error){callback(error);return;}
    callback(null,{query:(...args)=>transform(client,...args),on:(...args)=>client.on(...args),off:(...args)=>client.off(...args),release:error=>client.release(error)});
  });}};
}

test('schéma PostgreSQL : initialisation atomique, concurrence et parité structurelle', { timeout: 90000 }, async t => {
  const fixture = await postgresFixture(t);
  const owner = fixture.migrationPool, app = fixture.pool;
  await t.test('une cible non reconnue est refusée sans toucher son contenu', async () => {
    await owner.query('CREATE TABLE public.unknown(value integer); INSERT INTO public.unknown VALUES(42)');
    await assert.rejects(migrateSchema(owner, 'manger_test_app'), /cible non vide/);
    assert.equal((await owner.query('SELECT value FROM public.unknown')).rows[0].value, 42);
    await owner.query('DROP TABLE public.unknown');
    await owner.query('CREATE COLLATION public.unknown FROM pg_catalog."C"');
    try { await assert.rejects(migrateSchema(owner, 'manger_test_app'), /cible non vide/); }
    finally { await owner.query('DROP COLLATION public.unknown'); }
  });
  await t.test('un échec après le DDL annule tables, métadonnées et version, puis libère le client', async () => {
    let injected = false;
    const faulty = intercept(owner, (client, sql, values) => {
      if (sql === initial.sql) { injected = true; return client.query(sql + '; SELECT 1/0'); }
      return client.query(sql, values);
    });
    await assert.rejects(migrateSchema(faulty, 'manger_test_app'), { code: '22012' });
    assert.equal(injected, true);
    const { rows: [state] } = await owner.query("SELECT to_regnamespace('household') AS household, to_regnamespace('auth') AS auth, to_regnamespace('manger_meta') AS meta");
    assert.deepEqual(state, { household: null, auth: null, meta: null });
  });
  await t.test('deux initialisations réellement en attente ne livrent qu’une migration, même depuis repeatable read', async () => {
    await owner.query('GRANT ALL ON DATABASE manger_test TO PUBLIC; GRANT ALL ON SCHEMA public TO PUBLIC');
    await owner.query('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO PUBLIC, manger_test_app');
    const blocker = await app.connect(), isolation = [];
    await blocker.query('BEGIN; SELECT pg_advisory_xact_lock(1296125511,1)');
    const concurrent = intercept(owner, async (client, sql, values) => {
      if (sql.startsWith('BEGIN')) await client.query("SET default_transaction_isolation='repeatable read'");
      const result = await client.query(sql, values);
      if (sql.startsWith('BEGIN')) isolation.push((await client.query('SHOW transaction_isolation')).rows[0].transaction_isolation);
      return result;
    });
    const first = migrateSchema(concurrent, 'manger_test_app'), second = migrateSchema(concurrent, 'manger_test_app');
    const results = Promise.allSettled([first, second]);
    try {
      let waiting = 0;
      for (let tries = 0; tries < 100 && waiting < 2; tries++) {
        waiting = (await app.query("SELECT count(*)::integer AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=1296125511 AND objid=1")).rows[0].n;
        if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(waiting, 2, 'Deux connexions doivent attendre le verrou en base');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    const completed = await results;
    for (const item of completed) assert.equal(item.status, 'fulfilled', item.reason?.message);
    assert.deepEqual(completed.map(item => item.value.applied).sort((a,b) => a.length-b.length), [[],[1,2]]);
    assert.deepEqual(isolation, ['read committed','read committed']);
    assert.equal((await owner.query('SELECT count(*)::integer AS n FROM manger_meta.schema_migrations')).rows[0].n, 2);
  });
  await t.test('les 22 tables/colonnes de SQLite existent sans aucune donnée amorcée', async () => {
  const tables = await fixture.pool.query(`SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_schema IN ('household','auth') ORDER BY table_schema,table_name`);
  assert.equal(tables.rowCount, 22);
  for (const [schema, open] of [['household', createDatabase], ['auth', openAccounts]]) {
    const sqlite = open(':memory:');
    try {
      const names = sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
      assert.deepEqual(tables.rows.filter(row => row.table_schema === schema).map(row => row.table_name), names);
      for (const name of names) {
        const columns = (await app.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', [schema,name])).rows.map(row => row.column_name).filter(name => name !== 'sort_order').sort();
        assert.deepEqual(columns, sqlite.prepare(`PRAGMA table_info(${name})`).all().map(row => row.name).sort(), name);
        assert.equal((await app.query(`SELECT count(*)::integer AS n FROM ${schema}.${name}`)).rows[0].n, 0, name);
      }
    } finally { sqlite.close(); }
  }
  assert.deepEqual(await migrateSchema(owner, 'manger_test_app'), { version: 2, applied: [] });
  });
  await t.test('grands identifiants, Unicode, précision, JSON texte, dates et binaires sont conservés', async () => {
    const id = '4294967297', title = 'Œufs 🥣 été', bytes = Buffer.from([255,216,0,127,255,217]);
    await app.query('INSERT INTO household.recipes(id,title,minutes,servings) VALUES($1,$2,15,2)', [id,title]);
    await app.query('INSERT INTO household.recipe_photos VALUES($1,$2)', [id,bytes]);
    const ingredient = (await app.query("INSERT INTO household.ingredients(name,unit) VALUES('citron','g') RETURNING id")).rows[0].id;
    await app.query('INSERT INTO household.recipe_ingredients VALUES($1,$2,$3,$4)', [id,ingredient,0.123456789123,'raw']);
    assert.deepEqual((await app.query('SELECT id,title,source_url FROM household.recipes WHERE id=$1', [id])).rows[0], { id,title,source_url: null });
    assert.deepEqual((await app.query('SELECT data FROM household.recipe_photos WHERE recipe_id=$1', [id])).rows[0].data, bytes);
    assert.equal((await app.query('SELECT amount FROM household.recipe_ingredients WHERE recipe_id=$1', [id])).rows[0].amount, 0.123456789123);
    const key = Buffer.from('pois chiches\0g');
    await app.query("INSERT INTO household.pantry(food_key,name,unit,amount,recorded_on) VALUES($1,'Pois chiches','g',100,'2026-12-31')", [key]);
    assert.deepEqual((await app.query('SELECT food_key,recorded_on,use_by FROM household.pantry')).rows[0], { food_key:key, recorded_on:'2026-12-31', use_by:null });
    const tastes = '[ { "name": "tomate", "preparation": "raw" } ]';
    await app.query("INSERT INTO household.members(name,diet,avoided_ingredients) VALUES('Profil de test','omnivore',$1)", [tastes]);
    assert.equal((await app.query('SELECT avoided_ingredients FROM household.members')).rows[0].avoided_ingredients, tastes);
    await app.query("INSERT INTO household.recipes(title,minutes,servings) VALUES('e',1,1),('É',1,1),('E',1,1)");
    assert.deepEqual((await app.query("SELECT title FROM household.recipes WHERE title IN ('e','É','E') ORDER BY title")).rows.map(row => row.title), ['E','e','É']);
  });
  await t.test('contraintes numériques et ordre des rayons restent explicites sans arrondir les données', async () => {
    for (const id of ['9007199254740992','-9007199254740992']) {
      await assert.rejects(app.query("INSERT INTO household.recipes(id,title,minutes,servings) VALUES($1,'hors limite',1,1)", [id]), { code:'23514' });
    }
    for (const amount of [0,-1,Infinity,NaN]) {
      await assert.rejects(app.query("INSERT INTO household.proteins(name,category,amount,unit) VALUES('refus','plant',$1,'g')", [amount]), { code:'23514' });
    }
    await app.query("INSERT INTO household.shopping_manual(week_start,name,amount,unit,aisle) VALUES('2026-10-19','Valeur historique',-1,'g','autres')");
    assert.equal((await app.query('SELECT amount,checked FROM household.shopping_manual')).rows[0].amount, -1);
    await assert.rejects(app.query('UPDATE household.shopping_manual SET checked=2'), { code:'23514' });
    const first = (await app.query("INSERT INTO household.shopping_aisles(name,unit,aisle) VALUES('Pomme','g','fruits') RETURNING sort_order")).rows[0].sort_order;
    await app.query("INSERT INTO household.shopping_aisles(name,unit,aisle) VALUES('pomme','g','autres')");
    await app.query("UPDATE household.shopping_aisles SET aisle='légumes' WHERE name='Pomme'");
    assert.deepEqual((await app.query('SELECT name FROM household.shopping_aisles ORDER BY sort_order')).rows.map(row => row.name), ['Pomme','pomme']);
    assert.equal((await app.query("SELECT sort_order FROM household.shopping_aisles WHERE name='Pomme'")).rows[0].sort_order, first);
    await assert.rejects(app.query("INSERT INTO household.shopping_aisles VALUES('dupliqué','g','autres',$1)", [first]), { code:'23505' });
    await assert.rejects(app.query("INSERT INTO household.shopping_aisles VALUES('nul','g','autres',NULL)"), { code:'23502' });
    await assert.rejects(app.query("INSERT INTO household.shopping_aisles VALUES('trop grand','g','autres',9007199254740992)"), { code:'23514' });
  });
  await t.test('droits publics et droits par défaut ne donnent ni DDL ni métadonnées ni recalage des séquences', async () => {
    const { rows:[rights] } = await app.query(`SELECT
      has_database_privilege(current_user,current_database(),'CREATE') AS create_db,
      has_database_privilege(current_user,current_database(),'TEMP') AS temp,
      has_schema_privilege(current_user,'public','CREATE') AS public_create,
      has_schema_privilege(current_user,'household','CREATE') AS household_create,
      has_schema_privilege(current_user,'manger_meta','USAGE') AS metadata`);
    assert.deepEqual(rights, { create_db:false,temp:false,public_create:false,household_create:false,metadata:false });
    for (const sql of ['CREATE SCHEMA forbidden', 'CREATE TABLE household.forbidden(id integer)',
      'ALTER TABLE household.recipes ADD COLUMN forbidden integer', 'DROP TABLE household.recipe_photos',
      'TRUNCATE household.shopping_manual', 'SELECT * FROM manger_meta.schema_migrations',
      'UPDATE manger_meta.schema_migrations SET version=99', 'SET ROLE manger_test_migrator',
      "SELECT setval('household.recipes_id_seq',1)"]) await assert.rejects(app.query(sql), { code:'42501' }, sql);
    await app.query("UPDATE household.shopping_manual SET aisle='modifié'");
    assert.equal((await app.query('DELETE FROM household.shopping_manual RETURNING aisle')).rows[0].aisle, 'modifié');
    await assert.rejects(migrateSchema(app,'manger_test_app'), /Rôles PostgreSQL/);
    await assert.rejects(migrateSchema(owner,'manger_test_migrator'), /Rôles PostgreSQL/);
    assert.equal((await owner.query("SELECT has_table_privilege('public','household.recipes','SELECT') AS allowed")).rows[0].allowed, false);
    await owner.query('CREATE SCHEMA extra; GRANT CREATE ON SCHEMA extra TO manger_test_app');
    try { await assert.rejects(migrateSchema(owner,'manger_test_app'), /Rôles PostgreSQL/); }
    finally { await owner.query('DROP SCHEMA extra'); }
  });
  await t.test('suppression en cascade, SET NULL, recette protégée et source de restes RESTRICT sont distincts', async () => {
    const recipe = (await app.query("INSERT INTO household.recipes(title,minutes,servings) VALUES('cascade',5,1) RETURNING id")).rows[0].id;
    await app.query("INSERT INTO household.recipe_steps(recipe_id,position,kind,instruction) VALUES($1,1,'prep','Préparer')", [recipe]);
    await app.query('INSERT INTO household.recipe_favorites VALUES($1)', [recipe]);
    await app.query("INSERT INTO household.recipe_notes VALUES($1,4,'note')", [recipe]);
    await app.query('INSERT INTO household.recipe_photos VALUES($1,$2)', [recipe,Buffer.from([0,1])]);
    const meal = (await app.query("INSERT INTO household.meals(date,slot,location,occasion,people,recipe_id,title) VALUES('2026-10-22','midi','home','regular',1,$1,'repas') RETURNING id", [recipe])).rows[0].id;
    const member = (await app.query("INSERT INTO household.members(name,diet) VALUES('Cascade','omnivore') RETURNING id")).rows[0].id;
    const protein = (await app.query("INSERT INTO household.proteins(name,category,amount,unit) VALUES('Protéine de test','plant',100,'g') RETURNING id")).rows[0].id;
    await app.query('INSERT INTO household.meal_dishes VALUES($1,$2,$3,1,$4)', [meal,member,recipe,protein]);
    await app.query('INSERT INTO household.meal_assignments VALUES($1,$2,$3,1)', [meal,member,protein]);
    await assert.rejects(app.query('DELETE FROM household.recipes WHERE id=$1', [recipe]), { code:'23503' });
    await assert.rejects(app.query('DELETE FROM household.proteins WHERE id=$1', [protein]), { code:'23503' });
    await app.query('DELETE FROM household.members WHERE id=$1', [member]);
    for (const table of ['meal_dishes','meal_assignments']) assert.equal((await app.query(`SELECT count(*)::integer AS n FROM household.${table}`)).rows[0].n, 0);
    await app.query('DELETE FROM household.recipes WHERE id=$1', [recipe]);
    assert.equal((await app.query('SELECT recipe_id FROM household.meals WHERE id=$1', [meal])).rows[0].recipe_id, null);
    for (const table of ['recipe_steps','recipe_photos','recipe_notes','recipe_favorites']) assert.equal((await app.query(`SELECT count(*)::integer AS n FROM household.${table} WHERE recipe_id=$1`, [recipe])).rows[0].n, 0);
    const leftover = (await app.query("INSERT INTO household.meals(date,slot,location,occasion,people,title,leftover_of) VALUES('2026-10-22','soir','home','regular',1,'restes',$1) RETURNING id", [meal])).rows[0].id;
    await assert.rejects(app.query('DELETE FROM household.meals WHERE id=$1', [meal]), { code:'23001' });
    await assert.rejects(app.query("INSERT INTO household.meals(date,slot,location,occasion,people,title) VALUES('2026-10-22','soir','home','regular',1,'doublon')"), { code:'23505' });
    await app.query('DELETE FROM household.meals WHERE id=$1', [leftover]);
    await app.query('DELETE FROM household.meals WHERE id=$1', [meal]);
    const account = (await app.query("INSERT INTO auth.accounts(username,password) VALUES('admin','synthetic-scrypt-fixture') RETURNING id")).rows[0].id;
    await app.query("INSERT INTO auth.sessions VALUES('synthetic-session',$1,1800000000000)", [account]);
    await app.query("INSERT INTO auth.invitations VALUES(1,'synthetic-invitation',$1,1800000000000)", [account]);
    await assert.rejects(app.query('DELETE FROM auth.accounts WHERE id=$1', [account]), { code:'23503' });
    await assert.rejects(app.query("INSERT INTO auth.invitations VALUES(2,'synthetic-other',$1,1800000000000)", [account]), { code:'23514' });
    await app.query('DELETE FROM auth.invitations WHERE id=1');
    await app.query('DELETE FROM auth.accounts WHERE id=$1', [account]);
    assert.equal((await app.query('SELECT count(*)::integer AS n FROM auth.sessions')).rows[0].n, 0);
  });
  await t.test('version future, historique vide, nom et empreinte modifiés bloquent sans perdre les données', async () => {
    const original = (await owner.query('SELECT version,name,checksum,structure_checksum FROM manger_meta.schema_migrations ORDER BY version')).rows;
    for (const change of ['UPDATE manger_meta.schema_migrations SET version=version+100',
      "UPDATE manger_meta.schema_migrations SET name='autre'",
      "UPDATE manger_meta.schema_migrations SET checksum=repeat('0',64)", 'DELETE FROM manger_meta.schema_migrations']) {
      try {
        await owner.query(change);
        await assert.rejects(migrateSchema(owner,'manger_test_app'), /incompatible|incomplet/);
        assert.equal((await app.query('SELECT title FROM household.recipes WHERE id=$1', ['4294967297'])).rows[0].title, 'Œufs 🥣 été');
      } finally {
        await owner.query('DELETE FROM manger_meta.schema_migrations');
        for(const row of original)await owner.query('INSERT INTO manger_meta.schema_migrations(version,name,checksum,structure_checksum) VALUES($1,$2,$3,$4)', [row.version,row.name,row.checksum,row.structure_checksum]);
      }
    }
    await fixture.stop(); await fixture.start();
    assert.deepEqual(await migrateSchema(owner,'manger_test_app'), { version:2,applied:[] });
    assert.equal((await app.query('SELECT count(*)::integer AS n FROM household.recipes')).rows[0].n, 4);
    for (const code of fixture.connectionErrors) assert.ok(['57P01','ECONNRESET','EPIPE'].includes(code), code);
    assert.equal(owner.totalCount, owner.idleCount);
    assert.equal(app.totalCount, app.idleCount);
  });
});
