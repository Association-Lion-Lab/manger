const test=require('node:test');
const assert=require('node:assert/strict');
const {validateMember,validateProtein,isCompatible}=require('./server');
const {validatePreferences}=require('./household');
const {postgresHousehold}=require('./db/household');

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
