(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MangerFdl=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function create({account,recipes,fetch:request,escape:e,reload,navigate=url=>location.assign(url),confirm:ask=message=>confirm(message)}){
    let status=null,admin=false,busy=false,next=null,mine=false,query='',items=[],visible=20,refreshVersion=0;
    const action=(name,text,extra='')=>`<button type="button" class="secondary" data-fdl="${name}" ${extra}>${text}</button>`;
    async function json(path,options={}){
      const response=await request('/api/fdl/'+path,{...options,signal:AbortSignal.timeout(15000)});
      const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error||'FDL est indisponible.'),{status:response.status});return value;
    }
    const post=(path,value={})=>json(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
    function message(text){for(const node of [account,recipes]){const output=node.querySelector('[data-fdl-message]');if(output)output.textContent=text;}}
    function lock(value){busy=value;for(const root of [account,recipes]){root.setAttribute('aria-busy',String(value));root.querySelectorAll('button,input').forEach(n=>n.disabled=value);}}
    function render(){
      const expanded=recipes.querySelector('[data-fdl-browser]')?.open;
      account.hidden=!status||!admin;recipes.hidden=!status;if(!status)return;
      account.innerHTML=`<h2 class="account-heading">Faim de Lion</h2><div class="fdl-card"><p>${status.linked?'Compte FDL relié au foyer.':'Relie ton compte pour importer des recettes FDL.'}</p><p class="muted">Les membres du foyer pourront aussi consulter et importer les recettes privées de ce compte.</p>${action(status.linked?'unlink':'link',status.linked?'Délier le compte FDL':'Relier un compte FDL')}<p data-fdl-message role="status"></p></div>`;
      const updates=status.updates||[],notices=status.notices||[];
      recipes.innerHTML=`${updates.length?`<details class="fdl-card"><summary>${updates.length} nouvelle${updates.length>1?'s':''} version${updates.length>1?'s':''} sur FDL</summary>${updates.map(u=>`<div class="fdl-result"><strong>${e(u.title)}</strong>${u.modified?'<p class="muted">Tes modifications locales seront remplacées.</p>':''}<div class="fdl-actions">${action('update','Mettre à jour',`data-id="${u.recipeId}"`)}${action('skip','Ignorer',`data-id="${u.recipeId}"`)}</div></div>`).join('')}</details>`:''}
        ${notices.length?`<details class="fdl-card"><summary>${notices.length} retrait${notices.length>1?'s':''} par la modération FDL</summary>${notices.map(n=>`<p>« ${e(n.title)} » a été retirée de FDL.</p>`).join('')}${action('notice','J’ai compris')}</details>`:''}
        <details class="fdl-card"><summary>Recettes de Faim de Lion</summary>${status.linked?`<form data-fdl-search><label class="field"><span>Chercher sur FDL</span><input name="q" type="search" value="${e(query)}" placeholder="Un plat, un ingrédient…" maxlength="200"></label><div class="fdl-actions"><button class="secondary" type="submit">Rechercher</button>${action('mine','Mes recettes FDL')}</div></form><div data-fdl-results></div><form data-fdl-import><label class="field"><span>Ou coller un lien FDL</span><input name="lien" type="text" placeholder="Lien ou identifiant FDL" maxlength="2000" required></label><button class="secondary" type="submit">Importer la recette</button></form>`:'<p class="muted">Un administrateur peut relier un compte FDL depuis Compte.</p>'}<p data-fdl-message role="status"></p></details>`;
      const browser=recipes.querySelector('details:last-of-type');if(browser){browser.dataset.fdlBrowser='';browser.open=Boolean(expanded);}
      renderResults();lock(busy);
    }
    function renderResults(){
      const root=recipes.querySelector('[data-fdl-results]');if(!root)return;
      root.innerHTML=items.slice(0,visible).map(item=>`<div class="fdl-result"><strong>${e(item.title)}</strong>${item.minutes?`<small class="muted">${item.minutes} min</small>`:''}${item.imported?'<span class="muted">Déjà importée</span>':action('import','Importer',`data-id="${e(String(item.id))}"`)}</div>`).join('')+((next||visible<items.length)?action('more','Voir la suite'):'');
    }
    async function refresh(){
      const version=++refreshVersion;
      try{
        const value=await json('etat');
        const response=await request('/api/account',{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Reconnecte-toi pour consulter FDL.');
        const user=await response.json();if(version!==refreshVersion)return;
        status=value;admin=Boolean(user.admin);render();
      }catch(error){if(version!==refreshVersion)return;if(error.status===404){status=null;account.hidden=true;recipes.hidden=true;}else message(error.message);}
    }
    async function search(append=false){
      const params=new URLSearchParams(mine?{}:{q:query});if(append&&next)params.set('apres',next);
      const value=await json((mine?'mes-recettes':'recettes')+'?'+params);
      items=value.items;visible=20;next=value.next||null;renderResults();
      if(!items.length)message('Aucune recette trouvée sur FDL.');
    }
    async function run(work){
      if(busy)return;lock(true);message('');
      try{await work();}catch(error){message(['TypeError','TimeoutError'].includes(error.name)?'Confirmation indisponible. Vérifie tes recettes avant de réessayer.':error.message);}
      finally{lock(false);}
    }
    async function importRecipe(lien){
      await post('import',{lien});
      await reload();await refresh();if(items.length)await search();message('Recette importée dans le foyer.');
    }
    async function click(event){
      const node=event.target.closest('[data-fdl]');if(!node||busy)return;
      await run(async()=>{
        const name=node.dataset.fdl,id=Number(node.dataset.id);
        if(name==='link'){const result=await post('relier');navigate(result.url);}
        if(name==='unlink'){
          if(!ask('Délier le compte FDL pour tout le foyer ? Les copies sont conservées.'))return;
          await json('lien',{method:'DELETE'});items=[];next=null;await refresh();message('Liaison oubliée ici. Retire aussi cet accès dans la page Sécurité de FDL.');
        }
        if(name==='mine'){mine=true;next=null;await search();}
        if(name==='more'){if(visible<items.length){visible+=20;renderResults();}else await search(true);}
        if(name==='import')await importRecipe(node.dataset.id);
        if(name==='update'){
          if(!ask('Remplacer cette recette par la version FDL ? Les modifications locales du texte et des ingrédients seront perdues.'))return;
          await post('mettre-a-jour',{recipeId:id});await reload();await refresh();message('Recette mise à jour.');
        }
        if(name==='skip'){await post('ignorer',{recipeId:id});await refresh();}
        if(name==='notice'){await post('avis/vu');await refresh();}
      });
    }
    account.addEventListener('click',click);recipes.addEventListener('click',click);
    recipes.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      await run(async()=>{
        if(event.target.matches('[data-fdl-search]')){query=event.target.querySelector('[name="q"]').value;mine=false;next=null;await search();}
        if(event.target.matches('[data-fdl-import]'))await importRecipe(event.target.querySelector('[name="lien"]').value);
      });
    });
    return {refresh};
  }
  return {create};
});
