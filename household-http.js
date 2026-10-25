const {validateMember,validateProtein,validatePreferences,inputError}=require('./household');

function checked(result) {
  const errors={
    'duplicate-member':'Ce membre existe déjà','unknown-member':'Membre inconnu',
    'duplicate-protein':'Cette protéine existe déjà','unknown-protein':'Protéine inconnue',
    'used-protein':'Cette protéine est utilisée dans le planning',
    'incompatible-protein':'Cette catégorie est incompatible avec un repas déjà planifié'
  };
  if(typeof result==='string'&&Object.hasOwn(errors,result))throw inputError(errors[result]);
  return result;
}
async function body(request) {
  const chunks=[];let size=0;
  for await(const chunk of request) {
    size+=chunk.length;if(size>32768)throw inputError('Requête trop volumineuse');chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw inputError('JSON invalide');}
}
function householdRoutes(home,sendJson) {
  return async(request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname,method=request.method;
    const collection=path.match(/^\/api\/(members|proteins)(?:\/(\d+))?$/);
    const read=path==='/api/household'&&method==='GET';
    const preferences=path==='/api/household/preferences'&&method==='PUT';
    const mutation=collection&&(collection[2]===undefined?method==='POST':['PUT','DELETE'].includes(method));
    if(!read&&!preferences&&!mutation)return false;
    try {
      if(read)sendJson(response,200,await home.read());
      else if(preferences) {
        const names=validatePreferences(await body(request));checked(await home.setPreferences(names));
        sendJson(response,200,{avoidedIngredients:names});
      } else {
        const kind=collection[1]==='members'?'Member':'Protein';
        const id=collection[2]===undefined?undefined:Number(collection[2]);
        if(id!==undefined&&(!Number.isSafeInteger(id)||id<1))throw inputError('Identifiant invalide');
        if(method==='DELETE') {checked(await home[`remove${kind}`](id));sendJson(response,200,{});}
        else {
          const value=(kind==='Member'?validateMember:validateProtein)(await body(request));
          if(method==='POST')sendJson(response,201,{id:checked(await home[`add${kind}`](value)),...value});
          else {checked(await home[`edit${kind}`](id,value));sendJson(response,200,{id,...value});}
        }
      }
    } catch(error) {
      const input=error?.code==='MANGER_HOUSEHOLD_INPUT';
      sendJson(response,input?400:503,{error:input?error.message:'Le foyer est temporairement indisponible. Aucune réussite n’a pu être confirmée.'});
    }
    return true;
  };
}
module.exports={householdRoutes};
