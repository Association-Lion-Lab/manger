const test=require('node:test');
const assert=require('node:assert/strict');
const {createDatabase}=require('./server');
const {sqliteMeals}=require('./db/meals-sqlite');
const {mealDraft,plain}=require('./test-support/meal-store');
test('SQLite : lot, liens, modèle, déplacement et restes annulés après mutation native',async()=>{
  const db=createDatabase(':memory:'),store=sqliteMeals(db),start='2026-11-02';
  try {
    const member=Number(db.prepare("INSERT INTO members(name,diet) VALUES('admin','omnivore')").run().lastInsertRowid);
    store.save(mealDraft({date:start,recipeId:1}));const source=store.read(start)[0];store.leftovers({sourceId:source.id,date:'2026-11-03',slot:'midi',people:2});
    store.save(mealDraft({date:'2026-11-04',slot:'soir',dishes:[{memberId:member,recipeId:1,portions:2}]}));
    const named=store.read(start).find(r=>r.dishes?.length),snapshot=JSON.stringify(store.read(start)),template=store.saveTemplate({name:'Source',start});
    const before=()=>plain({source:store.read(start),target:store.read('2026-11-09'),copy:store.read('2026-11-16'),apply:store.read('2026-11-23'),rest:store.read('2026-11-30'),previous:store.read('2026-10-26'),templates:store.templates()});
    const initial=before();
    db.exec("CREATE TEMP TRIGGER fail_batch AFTER INSERT ON meals WHEN NEW.date='2026-11-09' AND NEW.slot='soir' BEGIN SELECT RAISE(ABORT,'synthetic-batch'); END");
    assert.throws(()=>store.planWeek({start:'2026-11-09',meals:[mealDraft({date:'2026-11-09',recipeId:1}),mealDraft({date:'2026-11-09',slot:'soir',recipeId:1})]}),/synthetic-batch/);db.exec('DROP TRIGGER fail_batch');
    db.exec("CREATE TEMP TRIGGER fail_link AFTER UPDATE OF leftover_of ON meals WHEN NEW.date>='2026-11-16' AND NEW.leftover_of IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic-link'); END");
    assert.throws(()=>store.copyWeek({sourceStart:start,targetStart:'2026-11-16',sourceSnapshot:snapshot}),/synthetic-link/);
    assert.throws(()=>store.applyTemplate(template.id,{targetStart:'2026-11-23'}),/synthetic-link/);db.exec('DROP TRIGGER fail_link');
    db.exec("CREATE TEMP TRIGGER fail_rest AFTER INSERT ON meal_dishes BEGIN SELECT RAISE(ABORT,'synthetic-rest'); END");
    assert.throws(()=>store.leftovers({sourceId:named.id,date:'2026-12-01',slot:'midi',dishes:[{memberId:member,portions:1}]}),/synthetic-rest/);db.exec('DROP TRIGGER fail_rest');
    db.exec("CREATE TEMP TRIGGER fail_move AFTER UPDATE OF date ON meals BEGIN SELECT RAISE(ABORT,'synthetic-move'); END");
    assert.throws(()=>store.place(source.id,{action:'move',sourceDate:start,sourceSlot:'midi',date:'2026-11-01',slot:'soir'}),/synthetic-move/);db.exec('DROP TRIGGER fail_move');
    db.exec("CREATE TEMP TRIGGER fail_template AFTER INSERT ON week_templates BEGIN SELECT RAISE(ABORT,'synthetic-template'); END");
    assert.throws(()=>store.saveTemplate({name:'Annulé',start}),/synthetic-template/);db.exec('DROP TRIGGER fail_template');
    db.exec("CREATE TEMP TRIGGER fail_remove AFTER DELETE ON week_templates BEGIN SELECT RAISE(ABORT,'synthetic-template-remove'); END");
    assert.throws(()=>store.removeTemplate(template.id),/synthetic-template-remove/);db.exec('DROP TRIGGER fail_remove');
    assert.deepEqual(before(),initial);
  }finally{db.close();}
});
