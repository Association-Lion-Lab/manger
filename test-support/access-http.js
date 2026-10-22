const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { protectAccounts } = require('../accounts');

async function accessHttp(t, auth, protect = protectAccounts) {
  const sent = []; let send = async (...args) => { sent.push(args); };
  const server = createServer(protect(null, (_req,res) => {res.writeHead(404);res.end('{}');}, {auth,mailer:{send:(...args)=>send(...args)}}));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => {server.closeAllConnections();return new Promise(resolve => server.close(resolve));});
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path,method='GET',value,cookie,origin=base) => fetch(base+path,{method,signal:AbortSignal.timeout(8000),
    headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:value===undefined?undefined:JSON.stringify(value)});
  const login = async (username='admin',password=`long-password-${username}`) => {
    const response = await request('/api/account/login','POST',{username,password});
    assert.equal(response.status,200,await response.clone().text()); return response.headers.get('set-cookie').split(';')[0];
  };
  const issue = async cookie => {
    const response = await request('/api/accounts/invitation','POST',{},cookie);
    assert.equal(response.status,201,await response.clone().text()); return response.json();
  };
  return {request,login,issue,sent,setSend(value){send=value;}};
}

module.exports = { accessHttp };
