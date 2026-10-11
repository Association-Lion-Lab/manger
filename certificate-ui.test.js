const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script } = require('node:vm');
const html = readFileSync(join(__dirname, 'public/accounts.html'), 'utf8');

function fixture() {
  const nodes=new Map(), requests=[], shares=[], copies=[], timeouts=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,textContent:'',value:'',children:[],
      addEventListener(){},focus(){this.focused=true;},select(){this.selected=true;}});
    return nodes.get(id);
  };
  node('certificate-steps').children=Array.from(html.matchAll(/<li>(.*?)<\/li>/g),match=>({textContent:match[1]}));
  const response={ok:true,headers:new Headers({'Content-Type':'application/pkix-cert'}),arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};
  const context={ $:node,me:{admin:true,localCertificate:{fingerprint:'AA:BB'}},location:{protocol:'https:',origin:'https://manger.test'},File,
    navigator:{canShare:()=>true,share:async content=>shares.push(content),clipboard:{writeText:async text=>copies.push(text)}},
    AbortSignal:{timeout(ms){timeouts.push(ms);return new AbortController().signal;}},
    fetch:async(path,options)=>{requests.push({path,options});return response;} };
  const start=html.indexOf('function certificateInstructions()'), end=html.indexOf("$('share-invitation').hidden");
  const actions=new Script(html.slice(start,end)+';({certificateInstructions,prepareCertificateShare})').runInNewContext(context);
  return {node,context,requests,shares,copies,timeouts,response,...actions};
}

test('certificate : contextual, authenticated download and iPhone trust instructions without a public bootstrap link',()=>{
  assert.match(html,/<details id="certificate-options" hidden>/);
  assert.match(html,/href="\/api\/accounts\/certificate" download="manger-ca.cer"/);
  assert.match(html,/me.admin&&me.localCertificate&&location.protocol==='https:'/);
  const form=fixture(), text=form.certificateInstructions();
  assert.match(text,/VPN et gestion de l’appareil/);
  assert.match(text,/Informations → Réglages des certificats/);
  assert.match(text,/AA:BB/);assert.match(text,/d’autres sites/);assert.match(text,/https:\/\/manger.test/);
  assert.doesNotMatch(text,/invite=|\.key/);
});

test('certificate : preload one bounded read, then share the prepared file directly on the user gesture',async()=>{
  const form=fixture();let resolve;
  form.context.fetch=(path,options)=>{form.requests.push({path,options});return new Promise(yes=>resolve=yes);};
  const pending=form.prepareCertificateShare();await form.prepareCertificateShare();
  assert.equal(form.requests.length,1);assert.equal(form.requests[0].path,'/api/accounts/certificate');
  assert.deepEqual(form.timeouts,[10000]);resolve(form.response);await pending;
  assert.equal(form.node('share-certificate').hidden,false);
  let finish;form.context.navigator.share=content=>{form.shares.push(content);return new Promise(yes=>finish=yes);};
  const sharing=form.node('share-certificate').onclick();await form.node('share-certificate').onclick();
  assert.equal(form.shares.length,1);assert.equal(form.node('share-certificate').disabled,true);
  assert.equal(form.shares[0].files[0].name,'manger-ca.cer');assert.equal(form.shares[0].files[0].type,'application/pkix-cert');
  assert.deepEqual([...new Uint8Array(await form.shares[0].files[0].arrayBuffer())],[1,2,3]);
  finish();await sharing;assert.equal(form.node('share-certificate').disabled,false);
  await form.prepareCertificateShare();assert.equal(form.requests.length,1);
});

test('certificate : no preload on HTTP, missing CA or unsupported share API',async()=>{
  for(const scenario of ['http','missing','unsupported']){
    const form=fixture();
    if(scenario==='http')form.context.location.protocol='http:';
    if(scenario==='missing')form.context.me.localCertificate=null;
    if(scenario==='unsupported')delete form.context.navigator.canShare;
    await form.prepareCertificateShare();assert.equal(form.requests.length,0);assert.equal(form.node('share-certificate').hidden,true);
  }
});

test('certificate : failures, empty/non-certificate bodies and unsupported files leave download available, with voluntary retry',async()=>{
  for(const scenario of ['network','timeout','denied','json','empty','large','unsupported-file']){
    const form=fixture();
    if(scenario==='network'||scenario==='timeout')form.context.fetch=async()=>{throw new DOMException('Failed',scenario==='timeout'?'TimeoutError':'NetworkError');};
    if(scenario==='denied')form.response.ok=false;
    if(scenario==='json')form.response.headers.set('content-type','application/json');
    if(scenario==='empty'||scenario==='large')form.response.arrayBuffer=async()=>new ArrayBuffer(scenario==='empty'?0:32769);
    if(scenario==='unsupported-file')form.context.navigator.canShare=()=>false;
    await form.prepareCertificateShare();assert.equal(form.node('share-certificate').hidden,true);
    assert.equal(form.node('download-certificate').disabled,false);assert.equal(form.shares.length,0);
    if(scenario!=='unsupported-file')assert.match(form.node('certificate-status').textContent,/Télécharge/);
    form.context.fetch=async()=>({ok:true,headers:new Headers({'Content-Type':'application/pkix-cert'}),arrayBuffer:async()=>new Uint8Array([1]).buffer});
    form.context.navigator.canShare=()=>true;await form.prepareCertificateShare();assert.equal(form.node('share-certificate').hidden,false);
  }
});

test('certificate : cancelled share neither copies nor sends an invitation, other failures allow download',async()=>{
  for(const name of ['AbortError','NotAllowedError']){
    const form=fixture();await form.prepareCertificateShare();form.context.navigator.share=async()=>{throw new DOMException('Failed',name);};
    await form.node('share-certificate').onclick();
    assert.match(form.node('certificate-status').textContent,name==='AbortError'?/annulé/:/Télécharge/);
    assert.equal(form.copies.length,0);assert.equal(form.requests.length,1);assert.equal(form.node('share-certificate').disabled,false);
  }
});

test('certificate : copy guide and manual selection fallback keep the fingerprint, without touching login or invitations',async()=>{
  const form=fixture();await form.node('copy-certificate-guide').onclick();
  assert.match(form.copies[0],/AA:BB/);assert.equal(form.node('certificate-guide-label').hidden,true);
  form.context.navigator.clipboard.writeText=async()=>{throw new Error('denied');};
  await form.node('copy-certificate-guide').onclick();
  assert.equal(form.node('certificate-guide-label').hidden,false);assert.equal(form.node('certificate-guide').selected,true);
  assert.match(form.node('certificate-guide').value,/AA:BB/);assert.equal(form.node('copy-certificate-guide').disabled,false);
  assert.equal(form.requests.length,0);
});
