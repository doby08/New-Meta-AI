/* E2E: shared visibility, ownership guards, simpler questions, analysis quality */
delete process.env.OPENAI_API_KEY;
const { spawn } = require('child_process');
const BASE = 'http://localhost:3998';
let cookie = '';

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(opts.headers || {}) } });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

(async () => {
  const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: '3998', OPENAI_API_KEY: '' }, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) { await new Promise(r => setTimeout(r, 500)); up = await fetch(BASE + '/api/stats').then(r => r.status === 401 || r.ok).catch(() => false); }
  if (!up) { srv.kill(); throw new Error('Server did not start'); }

  /* 1. Admin creates an interview with answers + report */
  let login = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: 'Dan', password: process.env.ADMIN_PASSWORD || '10231998' }) });
  if (!login.body.ok) throw new Error('Admin login failed');
  const iv = (await api('/api/interviews', { method: 'POST', body: JSON.stringify({ title: 'Barangay Permit & Licensing System', stakeholders: 'Barangay Captain, Clerk', interviewMethod: 'Semi-Structured' }) })).body.interview;
  const gen = await api('/api/interviews/' + iv.id + '/generate', { method: 'POST', body: JSON.stringify({ count: 4 }) });
  console.log('1. Admin questions (SIMPLER?):');
  gen.body.questions.forEach((q, i) => console.log('   ' + (i + 1) + '. ' + q.text));
  const qs = (await api('/api/interviews/' + iv.id + '/questions')).body.questions;
  await api('/api/questions/' + qs[0].id + '/answer', { method: 'POST', body: JSON.stringify({ answer: 'We record permits manually in logbooks. Encoding takes too much time and forms often get lost during peak days.' }) });
  await api('/api/questions/' + qs[2].id + '/answer', { method: 'POST', body: JSON.stringify({ answer: 'Applicants complain about the long queue. We have no way to track the status of each application.' }) });
  const an = await api('/api/interviews/' + iv.id + '/analyze', { method: 'POST', body: '{}' });
  const sg = an.body.suggestion;
  console.log('\n2. Pain Points (from ACTUAL answers?):');
  sg.painPoints.forEach(p => console.log('   - ' + p));
  console.log('   Recommendations (mapped?):');
  (sg.recommendations || []).slice(0, 3).forEach(r => console.log('   - ' + r));
  await api('/api/logout', { method: 'POST' });

  /* 2. New non-admin user registers and views admin's interview + report */
  const reg = await api('/api/register', { method: 'POST', body: JSON.stringify({ username: 'stafftest', password: 'Test1234!', displayName: 'Staff Tester', email: 'staff@test.com' }) });
  if (!reg.body.ok) { // maybe register endpoint differs; try login
    const lg = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: 'stafftest', password: 'Test1234!' }) });
    if (!lg.body.ok) throw new Error('Register/login failed: ' + JSON.stringify(reg.body) + JSON.stringify(lg.body));
  }
  const list = (await api('/api/interviews')).body.interviews;
  console.log('\n3. SHARED VISIBILITY — staff sees', list.length, 'interview(s):');
  list.forEach(i => console.log('   - ' + i.title + ' (owner: ' + (i.ownerName || '?') + ')'));
  const other = list.find(x => x.id === iv.id);
  if (!other) throw new Error('FAIL: staff cannot see admin interview');
  const oq = await api('/api/interviews/' + iv.id + '/questions');
  const osg = await api('/api/interviews/' + iv.id + '/suggestion');
  console.log('   Staff can view questions:', oq.status === 200, '| view report:', osg.status === 200 && !!osg.body.suggestion);

  /* 3. Ownership guard — staff cannot delete/edit admin interview */
  const del = await api('/api/interviews/' + iv.id, { method: 'DELETE' });
  const put = await api('/api/interviews/' + iv.id, { method: 'PUT', body: JSON.stringify({ title: 'Hacked' }) });
  console.log('\n4. OWNERSHIP GUARD — staff delete blocked:', del.status === 403, '| edit blocked:', put.status === 403);

  /* 4. Staff can still answer (stakeholder use-case) */
  const ans = await api('/api/questions/' + qs[1].id + '/answer', { method: 'POST', body: JSON.stringify({ answer: 'Processing is okay but could be faster.' }) });
  console.log('   Staff can answer questions:', ans.status === 200);

  /* 5. Owner (admin) can still delete own */
  cookie = '';
  await api('/api/login', { method: 'POST', body: JSON.stringify({ username: 'Dan', password: process.env.ADMIN_PASSWORD || '10231998' }) });
  const selfDel = await api('/api/interviews/' + iv.id, { method: 'DELETE' });
  console.log('   Owner can delete own interview:', selfDel.status === 200);

  srv.kill(); process.exit(0);
})().catch(e => { console.error('E2E FAILED:', e.message); process.exit(1); });
