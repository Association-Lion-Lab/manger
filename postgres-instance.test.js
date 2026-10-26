const test=require('node:test'),assert=require('node:assert/strict');
const {connectionString,passwordLine}=require('./db/instance-tools');
test('outils administratifs : connexion libpq littérale, sans mot de passe dans les arguments',()=>{
  const config={host:'127.0.0.1',port:5432,user:'migration',password:'privé:secret\\fin',database:"a' dbname=elsewhere",ssl:false};
  const value=connectionString(config,{passfile:'C:/private/pgpass',ca:null});
  assert.match(value,/dbname='a\\' dbname=elsewhere'/);assert.doesNotMatch(value,/privé|secret/);assert.match(value,/gssencmode='disable'/);assert.match(value,/sslcertmode='disable'/);
  assert.equal(passwordLine(config),'127.0.0.1:5432:a\' dbname=elsewhere:migration:privé\\:secret\\\\fin\n');
  for(const key of ['host','database','user','password'])assert.throws(()=>passwordLine({...config,[key]:'a\nb'}));
});
