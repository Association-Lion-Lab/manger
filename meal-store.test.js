const test=require('node:test');
const assert=require('node:assert/strict');
const {createDatabase}=require('./server');
const {sqliteMeals}=require('./db/meals-sqlite');
const {sqliteRecipes}=require('./db/recipes-sqlite');
const {sqliteHousehold}=require('./db/household-sqlite');
const {mealStoreContract,mealDraft,plain}=require('./test-support/meal-store');
test('contrat repas SQLite',async t=>{
  const db=createDatabase(':memory:');t.after(()=>db.close());
  await mealStoreContract(t,{store:sqliteMeals(db),home:sqliteHousehold(db),recipes:sqliteRecipes(db),
    linkRest:(id,date,people)=>db.prepare("INSERT INTO meals(date,slot,location,occasion,people,title,leftover_of) VALUES(?,'midi','home','regular',?,'Restes',?)").run(date,people,id)});
});

test('SQLite : erreur native après enfants et cascade de retrait annule le repas entier',async()=>{
  const db=createDatabase(':memory:'),store=sqliteMeals(db);
  try {
    const member=Number(db.prepare("INSERT INTO members(name,diet) VALUES('admin','omnivore')").run().lastInsertRowid);
    const initial=mealDraft({recipeId:1,assignments:[{memberId:member,proteinId:1,portions:2}]});await store.save(initial);
    const before=plain(store.read(initial.date));
    db.exec("CREATE TEMP TRIGGER fail_dish AFTER INSERT ON meal_dishes BEGIN SELECT RAISE(ABORT,'synthetic-after-dish'); END");
    const changed=mealDraft({dishes:[{memberId:member,recipeId:2,portions:1}]});
    for(const date of [changed.date,'2026-10-27'])assert.throws(()=>store.save({...changed,date}),/synthetic-after-dish/);
    assert.deepEqual(plain(store.read(initial.date)),before);db.exec('DROP TRIGGER fail_dish');
    db.exec("CREATE TEMP TRIGGER fail_remove AFTER DELETE ON meals BEGIN SELECT RAISE(ABORT,'synthetic-after-remove'); END");
    assert.throws(()=>store.remove(initial.date,initial.slot),/synthetic-after-remove/);assert.deepEqual(plain(store.read(initial.date)),before);db.exec('DROP TRIGGER fail_remove');
    await store.save(changed);assert.equal(store.read(initial.date)[0].dishes.length,1);
  } finally {db.close();}
});

test('SQLite : la réutilisation d’un ID supprimé reste une limite du contrôle de valeur',()=>{
  const db=createDatabase(':memory:'),store=sqliteMeals(db);
  try {
    const draft=mealDraft();store.save(draft,null);const id=store.read(draft.date)[0].id;store.remove(draft.date,draft.slot,id);
    store.save({...draft,title:'Nouveau'},null);assert.equal(store.read(draft.date)[0].id,id);
    store.save({...draft,title:'Même valeur d’ID'},id);assert.equal(store.read(draft.date)[0].title,'Même valeur d’ID');
  } finally {db.close();}
});
