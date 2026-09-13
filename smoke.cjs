'use strict';
const http = require('http');
const R = [];
function check(name, ok, note){ R.push({ name, ok: !!ok, note: String(note || '') }); }
function req(method, path, body, cookies){
  return new Promise((resolve,reject)=>{
    const url = new URL(path, 'http://localhost:3000');
    const headers = { 'Content-Type':'application/json' };
    if(cookies) headers['Cookie'] = cookies;
    const r = http.request({ hostname:'localhost', port:3000, path: url.pathname+url.search, method, headers }, res=>{
      const data=[];
      res.on('data', c=>data.push(c));
      res.on('end', ()=>{
        const buf = Buffer.concat(data);
        let body;
        try{ body = JSON.parse(buf.toString()); }catch(e){ body = buf.toString(); }
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    r.setTimeout(14000, ()=>{ r.destroy(); reject(new Error('timeout')); });
    r.on('error', reject);
    if(body!==undefined) r.write(JSON.stringify(body));
    r.end();
  });
}
function cookiesOf(j){ if(!j || !j.headers || !j.headers['set-cookie']) return ''; return j.headers['set-cookie'].map(c=>{ const m=c.match(/^([^=;]+)=([^;]+)/); return m?m[1]+'='+m[2]:''; }).join('; '); }
async function run(){
  try{
    const site = await req('GET','/api/site');
    check('1 site ok', site.status===200 && site.body.ok===true);
    const loginAdmin = await req('POST','/api/login', { username:'Dan', password:'10231998' });
    check('2 admin login', loginAdmin.status===200 && loginAdmin.body.ok===true && loginAdmin.body.user && loginAdmin.body.user.role==='Administrator');
    const adminCookies = cookiesOf(loginAdmin.headers);
    const reg = await req('POST','/api/register', { name:'Test User', email:'testuser2@wpu.edu.ph', password:'testpass1' });
    check('3 register', reg.status===201 && reg.body.ok===true && reg.body.user);
    const loginTest = await req('POST','/api/login', { username:'testuser2@wpu.edu.ph', password:'testpass1' });
    check('4 login by email', loginTest.status===200 && loginTest.body.ok===true && loginTest.body.user);
    const testCookies = cookiesOf(loginTest.headers);
    const profGet1 = await req('GET','/api/profile', testCookies);
    check('5 profile ok', profGet1.status===200 && profGet1.body.ok===true && profGet1.body.user);
    const profPut = await req('PUT','/api/profile', { avatar:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }, testCookies);
    check('6 avatar put', profPut.status===200 && profPut.body.ok===true);
    const profGet2 = await req('GET','/api/profile', testCookies);
    check('7 avatar returned', profGet2.body.ok===true && profGet2.body.user && profGet2.body.user.avatar && profGet2.body.user.avatar.startsWith('data:image'));
    const users = await req('GET','/api/admin/users', adminCookies);
    check('8 admin list users', users.status===200 && users.body.ok===true && Array.isArray(users.body.users));
    const testUser = users.body.ok===true ? users.body.users.find(u=>u.email==='testuser2@wpu.edu.ph') : null;
    if(testUser){
      check('9 test user has avatar', testUser.avatar && testUser.avatar.startsWith('data:image'));
      const upd = await req('PUT','/api/admin/users/'+testUser.id, { displayName:'Test User Updated' }, adminCookies);
      check('10 admin edit ok', upd.status===200 && upd.body.ok===true && upd.body.user.displayName==='Test User Updated');
      const del = await req('DELETE','/api/admin/users/'+testUser.id, adminCookies);
      check('11 admin delete ok', del.status===200 && del.body.ok===true);
      const after = await req('GET','/api/admin/users', adminCookies);
      check('12 gone after delete', after.body.ok===true && !after.body.users.some(u=>u.email==='testuser2@wpu.edu.ph'));
      const loginAfter = await req('POST','/api/login', { username:'testuser2@wpu.edu.ph', password:'testpass1' });
      check('13 login after delete fails', loginAfter.status===401 && loginAfter.body.ok===false);
    } else { check('9 test user found', false, 'no test user in list'); }
    const adminId = loginAdmin.body.user.id;
    const self = await req('DELETE','/api/admin/users/'+adminId, adminCookies);
    check('14 self delete blocked', self.status!==200 || (self.body.ok!==true));
    const st = await req('GET','/api/settings');
    check('15 settings ok', st.status===200 && st.body.ok===true);
    console.log(JSON.stringify(R, null, 2));
    const fail = R.filter(x=>!x.ok);
    process.exit(fail.length?1:0);
  }catch(e){ check('fatal', false, e && e.message ? e.message : String(e)); console.log(JSON.stringify(R,null,2)); process.exit(1); }
}
run();
