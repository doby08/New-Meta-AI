/* Isolated QR draft route smoke test. Run: node test_qr_routes.cjs
   Uses a temporary database; never loads the workspace .env or live data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

async function main() {
  const files = ['server.js', 'db.js', 'ai.js', 'qr_survey_routes.js'];
  for (const file of files) {
    const check = spawnSync(process.execPath, ['--check', path.join(__dirname, file)], { encoding: 'utf8' });
    assert.equal(check.status, 0, file + ': ' + check.stderr);
    console.log('PASS syntax: ' + file);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aais-qr-test-'));
  let child;
  let output = '';
  try {
    files.forEach(file => fs.copyFileSync(path.join(__dirname, file), path.join(dir, file)));
    const probe = net.createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    child = spawn(process.execPath, [path.join(dir, 'server.js')], {
      cwd: dir,
      env: { ...process.env, PORT: String(port), NODE_PATH: path.join(__dirname, 'node_modules'),
        ADMIN_PASSWORD: 'isolated-test-password', SESSION_SECRET: 'isolated-test-session', OPENAI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timeout\n' + output)), 15000);
      child.stdout.on('data', data => {
        output += data;
        if (output.includes('System running:')) { clearTimeout(timer); resolve(); }
      });
      child.stderr.on('data', data => { output += data; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited ' + code + '\n' + output)); });
    });
    console.log('PASS actual server startup');
    const post = async (url, body, cookie) => {
      const response = await fetch('http://127.0.0.1:' + port + url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(body), signal: AbortSignal.timeout(5000)
      });
      return { status: response.status, data: await response.json(), cookie: (response.headers.get('set-cookie') || '').split(';')[0] };
    };
    const draft = { title: 'Flood Control Project', stakeholder: 'Farmer', language: 'Tagalog', questionCount: 20 };
    assert.equal((await post('/api/qr-surveys', draft)).status, 401);
    console.log('PASS unauthenticated POST rejected (401)');
    const login = await post('/api/login', { username: 'Dan', password: 'isolated-test-password' });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
    assert.equal((await post('/api/qr-surveys', {}, login.cookie)).status, 400);
    assert.equal((await post('/api/qr-surveys', { ...draft, stakeholder: {} }, login.cookie)).status, 400);
    console.log('PASS required input validation (400)');
    const created = await post('/api/qr-surveys', draft, login.cookie);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.survey.title, draft.title);
    assert.equal(created.data.survey.questionCount, 20);
    assert.equal(created.data.survey.status, 'draft');
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'db.json'), 'utf8'));
    assert.equal(stored.qr_surveys.length, 1);
    assert.equal(stored.qr_surveys[0].id, created.data.survey.id);
    console.log('PASS authenticated POST creates draft in centralized test database');
    const registered = await post('/api/register', { name: 'Test Member', email: 'member@example.test', password: 'member-password' });
    assert.ok(registered.status >= 200 && registered.status < 300, JSON.stringify(registered.data));
    const member = await post('/api/login', { username: 'member@example.test', password: 'member-password' });
    assert.equal(member.status, 200);
    assert.equal((await post('/api/qr-surveys', draft, member.cookie)).status, 403);
    console.log('PASS non-administrator rejected (403)');
    console.log('ALL QR DRAFT ROUTE CHECKS PASSED');
  } finally {
    if (child && child.exitCode === null) {
      await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
