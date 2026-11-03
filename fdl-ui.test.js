const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('./public/fdl-ui');
function fixture({enabled=true,admin=true}={}){
  function root(){const events={},nodes=new Map();return {events,hidden:true,innerHTML:'',setAttribute(){},querySelectorAll:()=>[],querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',dataset:{}});return nodes.get(selector);},addEventListener:(name,fn)=>events[name]=fn};}
  const account=root(),recipes=root(),calls=[],state={linked:true,updates:[{recipeId:1,title:'<script>indésirable</script>',modified:true}],notices:[]};
  let imports=0,release,hold=false,reloads=0;
  const request=async(path,options={})=>{
    calls.push({path,options});
    if(path==='/api/fdl/import'){imports++;if(hold)await new Promise(r=>release=r);return new Response('{}');}
    if(path==='/api/account')return Response.json({admin});
    if(path==='/api/fdl/etat')return enabled?Response.json(state):Response.json({error:'Route inconnue'},{status:404});
    return Response.json({items:[],next:null});
  };
  const ui=create({account,recipes,fetch:request,escape:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),reload:async()=>{reloads++;},navigate(){},confirm:()=>true});
  return {ui,account,recipes,calls,hold(){hold=true;},release(){release();},imports:()=>imports,reloads:()=>reloads};
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
