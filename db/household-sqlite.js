const {isCompatible}=require('../household');

function sqliteHousehold(db) {
  function write(work) {
    db.exec('BEGIN IMMEDIATE');
    try {const result=work();db.exec('COMMIT');return result;}
    catch(error) {
      db.exec('ROLLBACK');
      if(error.errcode===2067&&error.message==='UNIQUE constraint failed: members.name')return 'duplicate-member';
      if(error.errcode===2067&&error.message==='UNIQUE constraint failed: proteins.name')return 'duplicate-protein';
      throw error;
    }
  }
  const read=()=>({
    avoidedIngredients:db.prepare('SELECT name FROM avoided_ingredients ORDER BY name').all().map(item=>item.name),
    members:db.prepare('SELECT id,name,diet,avoided_ingredients FROM members ORDER BY name').all().map(({avoided_ingredients,...member})=>({...member,avoidedIngredients:JSON.parse(avoided_ingredients)})),
    proteins:db.prepare('SELECT id,name,category,amount,unit FROM proteins ORDER BY name').all()
  });
  const setPreferences=names=>write(()=>{
    db.exec('DELETE FROM avoided_ingredients');const insert=db.prepare('INSERT INTO avoided_ingredients(name) VALUES(?)');
    names.forEach(name=>insert.run(name));return true;
  });
  const addMember=member=>write(()=>Number(db.prepare('INSERT INTO members(name,diet,avoided_ingredients) VALUES(?,?,?)').run(member.name,member.diet,JSON.stringify(member.avoidedIngredients||[])).lastInsertRowid));
  const editMember=(id,member)=>write(()=>db.prepare('UPDATE members SET name=?,diet=?,avoided_ingredients=COALESCE(?,avoided_ingredients) WHERE id=?')
    .run(member.name,member.diet,member.avoidedIngredients===undefined?null:JSON.stringify(member.avoidedIngredients),id).changes?true:'unknown-member');
  const removeMember=id=>write(()=>db.prepare('DELETE FROM members WHERE id=?').run(id).changes?true:'unknown-member');
  const addProtein=protein=>write(()=>Number(db.prepare('INSERT INTO proteins(name,category,amount,unit) VALUES(?,?,?,?)').run(protein.name,protein.category,protein.amount,protein.unit).lastInsertRowid));
  const editProtein=(id,protein)=>write(()=>{
    const diets=db.prepare('SELECT m.diet FROM meal_assignments a JOIN members m ON m.id=a.member_id WHERE a.protein_id=? UNION ALL SELECT m.diet FROM meal_dishes d JOIN members m ON m.id=d.member_id WHERE d.protein_id=?').all(id,id);
    if(diets.some(member=>!isCompatible(member.diet,protein.category)))return 'incompatible-protein';
    return db.prepare('UPDATE proteins SET name=?,category=?,amount=?,unit=? WHERE id=?').run(protein.name,protein.category,protein.amount,protein.unit,id).changes?true:'unknown-protein';
  });
  const removeProtein=id=>write(()=>{
    if(db.prepare('SELECT 1 FROM meal_assignments WHERE protein_id=? UNION ALL SELECT 1 FROM meal_dishes WHERE protein_id=? LIMIT 1').get(id,id))return 'used-protein';
    return db.prepare('DELETE FROM proteins WHERE id=?').run(id).changes?true:'unknown-protein';
  });
  return Object.freeze({engine:'sqlite',read,setPreferences,addMember,editMember,removeMember,addProtein,editProtein,removeProtein});
}
module.exports={sqliteHousehold};
