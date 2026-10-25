const test=require('node:test');
const assert=require('node:assert/strict');
const {validateMember,validateProtein,isCompatible}=require('./server');
const {validatePreferences}=require('./household');
const {postgresHousehold}=require('./db/household');
const {sqliteHousehold}=require('./db/household-sqlite');
const {createDatabase}=require('./server');

test('construction du dépôt foyer sans requête, amorçage ni connexion à l’import',()=>{
  let calls=0;
  const db={query(){calls++;throw new Error('Aucune requête attendue.');},transaction(){calls++;throw new Error('Aucune transaction attendue.');}};
  const home=postgresHousehold(db);assert.equal(calls,0);assert.equal(home.engine,'postgres');assert.ok(Object.isFrozen(home));
});
test('mêmes normalisations et frontière stricte des régimes/protéines',()=>{
  assert.deepEqual(validateMember({name:' Camille ',diet:'vegetarian',avoidedIngredients:[' TOMATE Crue ','tomate crue','tomate cuite']}),
    {name:'Camille',diet:'vegetarian',avoidedIngredients:['tomate crue','tomate cuite']});
  assert.deepEqual(validateMember({name:'Camille',diet:'vegan'}),{name:'Camille',diet:'vegan'});
  assert.deepEqual(validateProtein({name:' ŒUF ',category:'egg',amount:1.25,unit:' pièce '}),{name:'œuf',category:'egg',amount:1.25,unit:'pièce'});
  const allowed={vegan:['plant'],vegetarian:['plant','egg'],pescetarian:['plant','egg','fish'],omnivore:['plant','egg','fish','meat']};
  for(const diet of Object.keys(allowed))for(const category of ['plant','egg','fish','meat'])assert.equal(isCompatible(diet,category),allowed[diet].includes(category));
});
test('NUL refusé dans les champs SQL texte, conservé dans les goûts personnels JSON',()=>{
  assert.throws(()=>validateMember({name:'Cam\0ille',diet:'vegan'}));
  assert.deepEqual(validateMember({name:'Camille',diet:'vegan',avoidedIngredients:['tomate\0crue']}).avoidedIngredients,['tomate\0crue']);
  for(const patch of [{name:'to\0fu'},{unit:'g\0'}])assert.throws(()=>validateProtein({name:'tofu',category:'plant',amount:100,unit:'g',...patch}));
  assert.throws(()=>validatePreferences({avoidedIngredients:['tomate\0crue']}));
  assert.deepEqual(validatePreferences({avoidedIngredients:[' ŒUF ','œuf','tomate crue']}),['œuf','tomate crue']);
});
test('SQLite : remplacement des goûts et retrait avec cascades restent atomiques après erreur',()=>{
  const db=createDatabase(':memory:'),home=sqliteHousehold(db);
  try {
    home.setPreferences(['avant']);
    db.exec("CREATE TRIGGER reject_preferences BEFORE INSERT ON avoided_ingredients BEGIN SELECT RAISE(ABORT,'injected'); END");
    assert.throws(()=>home.setPreferences(['après']));assert.deepEqual(home.read().avoidedIngredients,['avant']);
    db.exec('DROP TRIGGER reject_preferences');home.setPreferences(['reprise']);assert.deepEqual(home.read().avoidedIngredients,['reprise']);
    const member=home.addMember({name:'Camille',diet:'vegan'}),p=home.read().proteins[0].id;
    db.exec("INSERT INTO meals(id,date,slot,location,occasion,people,title) VALUES(1,'2026-10-25','midi','home','regular',3,'fixture')");
    db.prepare('INSERT INTO meal_assignments VALUES(1,?,?,1)').run(member,p);
    const recipe=db.prepare('SELECT id FROM recipes LIMIT 1').get().id;
    db.prepare('INSERT INTO meal_dishes(meal_id,member_id,recipe_id,portions,protein_id) VALUES(1,?,?,1,NULL)').run(member,recipe);
    db.exec("CREATE TRIGGER reject_member AFTER DELETE ON members BEGIN SELECT RAISE(ABORT,'injected'); END");
    assert.throws(()=>home.removeMember(member));
    for(const table of ['members','meal_assignments','meal_dishes'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,1);
    db.exec('DROP TRIGGER reject_member');assert.equal(home.removeMember(member),true);
    for(const table of ['meal_assignments','meal_dishes'])assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n,0);
    assert.equal(db.prepare('SELECT people FROM meals').get().people,3);assert.ok(db.prepare('SELECT id FROM recipes WHERE id=?').get(recipe));
  } finally {db.close();}
});
