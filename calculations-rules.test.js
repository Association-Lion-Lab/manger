const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {shoppingList,pantryShopping,pantry,previewMenu}=require('./calculations');
test('arrondi après somme compensée de la période, distinct de la réservation par jour',()=>{
  const db=new DatabaseSync(':memory:');try{
    db.exec('CREATE TABLE items(amount REAL)');
    for(const values of [[.0044,.0044],[.01,.02,.005],[1000000,.005,-1000000,.02]]){
      db.exec('DELETE FROM items');for(const value of values)db.prepare('INSERT INTO items VALUES(?)').run(value);
      const data={items:values.map((amount,i)=>({date:`2026-11-0${i+2}`,name:'riz',unit:'g',amount}))};
      const expected=Math.round(db.prepare('SELECT SUM(amount) AS n FROM items').get().n*100)/100;
      assert.equal(shoppingList(data,'2026-11-02')[0].amount,expected);
    }
  }finally{db.close();}
});
test('la réservation ne modifie pas la photographie réutilisée',()=>{
  const data={items:[{date:'2026-11-02',name:'riz',unit:'g',amount:100}],meals:[{date:'2026-11-02'}],stocks:[{id:1,name:'riz',unit:'g',amount:80,recordedOn:'2026-01-01',useBy:null,explicitLot:1}]};
  const before=structuredClone(data);assert.deepEqual(pantryShopping(data,'2026-11-02'),[{name:'riz',unit:'g',amount:20,fromPantry:80}]);assert.deepEqual(data,before);assert.deepEqual(pantry(data),pantry(data));assert.deepEqual(data,before);
});
test('les titres identiques sont départagés par ID, indépendamment de l’ordre physique',()=>{
  const recipe=id=>({id,title:'Même titre',minutes:10,servings:1,diet:'vegan',ingredients:[{name:'riz',unit:'g',amount:100}]});
  const data={recipes:[recipe(2),recipe(1)],home:{members:[],avoidedIngredients:[]},stocks:[],items:[],meals:[]};
  assert.equal(previewMenu(data,{start:'2026-11-02',maxMinutes:15,people:1,memberIds:[],slots:[{day:0,slot:'midi'}]})[0].recipeId,1);
});
