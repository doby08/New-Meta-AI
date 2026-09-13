'use strict';
const cp = require('child_process');
const http = require('http');
const ROOT = __dirname;
const SRV = cp.spawn('node', ['server.js'], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
function req(method, url, body, cookies) {
  return new Promise((resolve, reject) => {
    const tr = http.request(url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookies || '' } }, res => {
      const data = []; res.on('data', c => data.push(c));
      res.on('end', () => { const buf = Buffer.concat(data); let body; try { body = JSON.parse(buf.toString()); } catch { body = buf.toString(); } resolve({ status: res.statusCode, body, headers: res.headers }); });
    });
    tr.on('error', reject); tr.setTimeout(10000, () => { tr.destroy(); reject(new Error('timeout')); });
    if (body !== undefined) tr.write(JSON.stringify(body));
    tr.end();
  });
}
const get = (u, c) => req('GET', u, undefined, c);
const post = (u, b, c) => req('POST', u, b, c);
const put = (u, b, c) => req('PUT', u, b, c);
const del = (u, c) => req('DELETE', u, undefined, c);
function cookiesOf(j){ if(!j||!j.headers||!j.headers['set-cookie']) return ''; return j.headers['set-cookie'].map(c=>{const m=c.match(/^([^=;]+)=([^;]+)/); return m?m[1]+'='+m[2]:'';}).join('; '); }
const R=[];
function check(n,ok,note){R.push({n,ok:!!ok,note:String(note||'')});}
function logResults(){console.log('\n=== RESULTS ===');for(const r of R) console.log(`[${r.ok?'PASS':'FAIL'}] ${r.n} ${r.note?'— '+r.note:''}`);const f=R.filter(x=>!x.ok).length;console.log(`\nTotal: ${R.length}, passed: ${R.length-f}, failed: ${f}`);return f;}
async function wait(){console.log('Waiting for server...');return new Promise((resolve,reject)=>{const t=setInterval(()=>{http.get('http://localhost:3000/api/site',r=>{if(200===r.statusCode){clearInterval(t);resolve();}}).on('error',()=>{});},300);setTimeout(()=>{clearInterval(t);reject(new Error('server not started'));},15000);});}
