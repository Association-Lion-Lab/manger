const assert=require('node:assert/strict');

async function householdHttp(t,server) {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,method='GET',value,cookie,origin=base,raw)=>fetch(base+path,{method,signal:AbortSignal.timeout(8000),
    headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:raw??(value===undefined?undefined:JSON.stringify(value))});
  const login=async(name='member')=>{const r=await request('/api/account/login','POST',{username:name,password:'long-password-member'});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  return {request,login};
}
module.exports={householdHttp};
