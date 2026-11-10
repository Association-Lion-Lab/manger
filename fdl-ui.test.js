const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('./public/fdl-ui');
function fixture({enabled=true,admin=true,active='recipes',items=[]}={}){
  function root(panel){const events={},nodes=new Map();return {events,hidden:true,innerHTML:'',getClientRects:()=>active===panel?[{}]:[],setAttribute(){},querySelectorAll:()=>[],querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',dataset:{},getClientRects:()=>[]});return nodes.get(selector);},addEventListener:(name,fn)=>events[name]=fn};}
  const account=root('account'),recipes=root('recipes'),calls=[],state={linked:true,updates:[{recipeId:1,title:'<script>indésirable</script>',modified:true}],notices:[]};
  let imports=0,release,hold=false,reloads=0,importFailure=false;
  const request=async(path,options={})=>{
    calls.push({path,options});
    if(path==='/api/fdl/import'){imports++;if(hold)await new Promise(r=>release=r);return importFailure?Response.json({error:'FDL indisponible.'},{status:502}):new Response('{}');}
    if(path==='/api/account')return Response.json({admin});
    if(path==='/api/fdl/etat')return enabled?Response.json(state):Response.json({error:'Route inconnue'},{status:404});
    return Response.json({items,next:null});
  };
  const ui=create({account,recipes,fetch:request,escape:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),reload:async()=>{reloads++;},navigate(){},confirm:()=>true});
  return {ui,account,recipes,calls,hold(){hold=true;},release(){release();},imports:()=>imports,reloads:()=>reloads,activate(panel){active=panel;},failImport(){importFailure=true;}};
}
test('FDL interface : absence 404 masquée, administration réservée, titres échappés',async()=>{
  const absent=fixture({enabled:false});await absent.ui.refresh();assert.equal(absent.account.hidden,true);assert.equal(absent.recipes.hidden,true);assert.equal(absent.calls.length,1);
  const member=fixture({admin:false});await member.ui.refresh();assert.equal(member.account.hidden,true);assert.equal(member.recipes.hidden,false);
  assert.ok(member.recipes.innerHTML.includes('&lt;script&gt;'));assert.ok(!member.recipes.innerHTML.includes('<script>'));
  assert.match(member.recipes.innerHTML,/modifications locales/);
  const admin=fixture();await admin.ui.refresh();assert.equal(admin.account.hidden,false);assert.match(admin.account.innerHTML,/recettes privées/);
});
test('FDL interface : double appui sur import ne crée qu’une demande',async()=>{
  const form=fixture();await form.ui.refresh();form.hold();
  const event={target:{closest:()=>({dataset:{fdl:'import',id:'12'}})}};
  const first=form.recipes.events.click(event);await form.recipes.events.click(event);
  assert.equal(form.imports(),1);form.release();await first;
  assert.equal(form.imports(),1);assert.equal(form.reloads(),1);
});

test('FDL interface : succès et erreur annoncés uniquement dans la section visible',async()=>{
  const form=fixture();await form.ui.refresh();
  const event={target:{closest:()=>({dataset:{fdl:'import',id:'12'}})}};
  await form.recipes.events.click(event);
  assert.equal(form.recipes.querySelector('[data-fdl-message]').textContent,'Recette importée dans le foyer.');
  assert.equal(form.account.querySelector('[data-fdl-message]').textContent,'');
  form.failImport();await form.recipes.events.click(event);
  assert.equal(form.recipes.querySelector('[data-fdl-message]').textContent,'FDL indisponible.');
  assert.equal(form.account.querySelector('[data-fdl-message]').textContent,'');
});

test('FDL interface : déliaison annoncée dans Compte, ancien message Recettes effacé',async()=>{
  const form=fixture();await form.ui.refresh();
  await form.recipes.events.click({target:{closest:()=>({dataset:{fdl:'import',id:'12'}})}});
  form.activate('account');await form.account.events.click({target:{closest:()=>({dataset:{fdl:'unlink'}})}});
  assert.match(form.account.querySelector('[data-fdl-message]').textContent,/Liaison oubliée ici/);
  assert.equal(form.recipes.querySelector('[data-fdl-message]').textContent,'');
});

test('FDL interface : un résultat tardif rejoint la section actuellement visible',async()=>{
  const form=fixture();await form.ui.refresh();form.hold();
  const pending=form.recipes.events.click({target:{closest:()=>({dataset:{fdl:'import',id:'12'}})}});
  form.activate('account');form.release();await pending;
  assert.equal(form.account.querySelector('[data-fdl-message]').textContent,'Recette importée dans le foyer.');
  assert.equal(form.recipes.querySelector('[data-fdl-message]').textContent,'');
});

test('FDL interface : aucune annonce dans les sections masquées',async()=>{
  const form=fixture({active:'week'});await form.ui.refresh();
  await form.recipes.events.click({target:{closest:()=>({dataset:{fdl:'import',id:'12'}})}});
  assert.equal(form.account.querySelector('[data-fdl-message]').textContent,'');
  assert.equal(form.recipes.querySelector('[data-fdl-message]').textContent,'');
});

test('FDL interface : Mes recettes affiche une durée reçue, sans durée fictive si absente',async()=>{
  for(const minutes of [undefined,25]){
    const form=fixture({items:[{id:12,title:'Soupe',state:'published',version:1,...(minutes===undefined?{}:{minutes})}]});await form.ui.refresh();
    await form.recipes.events.click({target:{closest:()=>({dataset:{fdl:'mine'}})}});
    const html=form.recipes.querySelector('[data-fdl-results]').innerHTML;
    assert.ok(html.includes('Soupe'));assert.equal(html.includes('25 min'),minutes===25);
    assert.doesNotMatch(html,/undefined|null|0 min/);
    assert.equal(form.calls.filter(c=>c.path.startsWith('/api/fdl/mes-recettes')).length,1);
    assert.ok(!form.calls.some(c=>c.path.startsWith('/api/fdl/recette?')));
  }
});
