/* AI Assistance Interview System — frontend SPA */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = () => $('#view');

const S = { user: null, aiMode: 'local-smart', aiModel: '', settings: { theme: 'light', itemsPerPage: 8, defaultQuestionCount: 20 }, route: 'home', charts: [], qa: { id: null, list: [], idx: 0, dirty: false }, sliderT: null };

const TITLES = { home: ['Home', 'AI Assistance Interview System · WPU Main Campus'], dashboard: ['Dashboard', 'System overview & activity'], create: ['Create Interview', 'Start a new stakeholder interview'], my: ['My Interviews', 'Answer questions & manage interviews'], bank: ['Questions Bank', 'Search, filter & manage questions'], results: ['Results & Suggestions', 'Patterns, insights & graph line analysis'], history: ['History', 'All saved interviews'], report: ['Summary Report', 'Cards per interview + printable report'], profile: ['Profile', 'Account information'], settings: ['Settings', 'Theme, preferences & AI configuration'] };
const MENU = [['home', '🏠', 'Home'], ['dashboard', '📊', 'Dashboard'], ['create', '➕', 'Create Interview'], ['my', '🎙', 'My Interviews'], ['bank', '📚', 'Questions Bank'], ['results', '💡', 'Results & Suggestions'], ['history', '🕘', 'History'], ['report', '📄', 'Summary Report'], ['profile', '👤', 'Profile'], ['settings', '⚙', 'Settings']];

/* ---------- tiny helpers ---------- */
function toast(msg, type) {
  if (S.settings && S.settings.notifications === false && type === 'ok') return;
  const t = document.createElement('div');
  t.className = 'toast ' + (type === 'error' ? 'err' : type === 'warning' ? 'warn' : 'ok');
  t.innerHTML = '<span>' + (type === 'error' ? '⛔' : type === 'warning' ? '⚠' : '✅') + '</span><span>' + esc(msg) + '</span>';
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '.4s'; setTimeout(() => t.remove(), 400); }, 3400);
}
async function api(url, opts) {
  opts = opts || {};
  opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({ ok: false, error: 'Network error. Please try again.' }));
  if (r.status === 401) { showLogin(); throw new Error('Session expired. Please log in again.'); }
  if (!j.ok) throw new Error(j.error || 'Request failed.');
  return j;
}
function btnLoading(btn, on, label) {
  if (!btn) return;
  if (on) { btn.disabled = true; btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span> ' + esc(label || 'Working…'); }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}
function modal(html, wide) {
  $('#modalRoot').innerHTML = '<div class="modal-scrim" id="mScrim"><div class="modal' + (wide ? ' wide' : '') + '">' + html + '</div></div>';
  $('#mScrim').addEventListener('click', (e) => { if (e.target.id === 'mScrim') closeModal(); });
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
function confirmDlg(title, text, okLabel, onOk) {
  modal('<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-danger" id="mOk">' + esc(okLabel || 'Delete') + '</button></div>');
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async (e) => { btnLoading(e.target, true, 'Deleting…'); try { await onOk(); closeModal(); } catch (err) { btnLoading(e.target, false); toast(err.message, 'error'); } };
}
const badge = (s) => '<span class="badge b-' + esc(s) + '">' + esc(s) + '</span>';
const skel = (n) => Array.from({ length: n || 3 }, () => '<div class="skel" style="margin-bottom:12px"></div>').join('');
/* ---------- auth & shell ---------- */
function showLogin() {
  S.user = null;
  $('#appShell').classList.add('hidden');
  $('#loginScreen').classList.remove('hidden');
  $('#loginError').classList.add('hidden');
}
function showApp() {
  $('#loginScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');
  $('#sideUser').textContent = S.user.displayName || S.user.username;
  $('#sideRole').textContent = S.user.role || 'User';
  $('#sideAvatar').textContent = (S.user.displayName || S.user.username || 'U').slice(0, 1).toUpperCase();
  $('#aiBadge').textContent = S.aiMode === 'openai' ? '✨ AI: ' + (S.aiModel || 'OpenAI') : '🧠 AI: Built-in Smart';
  renderNav();
}
function renderNav() {
  $('#sideNav').innerHTML = MENU.map(m =>
    '<button class="side-link' + (S.route === m[0] ? ' active' : '') + '" data-r="' + m[0] + '"><span class="ic">' + m[1] + '</span>' + m[2] + '</button>').join('')
    + '<button class="side-link" id="navLogout"><span class="ic">🚪</span>Logout</button>';
  $$('#sideNav .side-link[data-r]').forEach(b => b.onclick = () => go(b.dataset.r));
  $('#navLogout').onclick = askLogout;
}
function destroyCharts() { S.charts.forEach(c => { try { c.destroy(); } catch {} }); S.charts = []; if (S.sliderT) { clearInterval(S.sliderT); S.sliderT = null; } }
function go(route, param) {
  if (S.qa.dirty && S.route === 'my' && route !== 'my') {
    modal('<h3>Unsaved answer?</h3><p>You have an unsaved answer. Leave without saving?</p><div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Stay</button><button class="btn btn-primary" id="mOk">Leave</button></div>');
    $('#mCancel').onclick = closeModal;
    $('#mOk').onclick = () => { S.qa.dirty = false; closeModal(); go(route, param); };
    return;
  }
  destroyCharts();
  S.route = route; document.body.classList.remove('nav-open');
  $('#pageTitle').textContent = (TITLES[route] || TITLES.home)[0];
  $('#pageSub').textContent = (TITLES[route] || TITLES.home)[1];
  renderNav();
  ({ home: pHome, dashboard: pDashboard, create: pCreate, my: pMy, bank: pBank, results: pResults, history: pHistory, report: pReport, profile: pProfile, settings: pSettings })[route](param);
}
/* ---------- theme (night / light, always readable) ---------- */
function applyTheme(t) {
  S.settings.theme = t;
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : 'light';
  const b = $('#themeBtn'); if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('aais-theme', t); } catch {}
}
async function toggleTheme() {
  const next = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark';
  applyTheme(next);
  try { S.settings = (await api('/api/settings', { method: 'PUT', body: JSON.stringify({ theme: next }) })).settings; } catch {}
}
function askLogout() {
  modal('<h3>Log out?</h3><p>Are you sure you want to end your session?</p><div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Cancel</button><button class="btn btn-primary" id="mOk">Logout</button></div>');
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); closeModal(); showLogin(); toast('Logged out successfully.'); };
}

async function boot() {
  try { applyTheme(localStorage.getItem('aais-theme') || 'light'); } catch { applyTheme('light'); }
  $('#pwToggle').onclick = () => { const p = $('#loginPass'); p.type = p.type === 'password' ? 'text' : 'password'; $('#pwToggle').textContent = p.type === 'password' ? '👁' : '🙈'; };
  $('#menuBtn').onclick = () => document.body.classList.toggle('nav-open');
  $('#sideScrim').onclick = () => document.body.classList.remove('nav-open');
  $('#logoutBtnTop').onclick = askLogout;
  $('#themeBtn').onclick = toggleTheme;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#loginUser').value.trim(), p = $('#loginPass').value;
    const err = $('#loginError');
    if (!u || !p) { err.textContent = 'Please enter both username and password.'; err.classList.remove('hidden'); return; }
    const btn = $('#loginBtn');
    btn.disabled = true; btn.querySelector('.btn-label').textContent = 'Logging in…'; btn.querySelector('.spinner').classList.remove('hidden');
    try {
      const j = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
      S.user = j.user;
      const me = await api('/api/me'); S.aiMode = me.aiMode; S.aiModel = me.aiModel;
      S.settings = (await api('/api/settings')).settings;
      applyTheme(S.settings.theme || localStorage.getItem('aais-theme') || 'light');
      err.classList.add('hidden'); $('#loginPass').value = '';
      showApp(); go('home'); toast('Welcome back, ' + S.user.displayName + '!');
    } catch (ex) { err.textContent = ex.message; err.classList.remove('hidden'); }
    btn.disabled = false; btn.querySelector('.btn-label').textContent = 'Sign in'; btn.querySelector('.spinner').classList.add('hidden');
  });
  try {
    const me = await api('/api/me');
    if (me.user) { S.user = me.user; S.aiMode = me.aiMode; S.aiModel = me.aiModel; S.settings = (await api('/api/settings')).settings; applyTheme(S.settings.theme || 'light'); showApp(); go('home'); }
    else showLogin();
  } catch { showLogin(); }
}
document.addEventListener('DOMContentLoaded', boot);
/* ---------- HOME (landing) ---------- */
function pHome() {
  const slides = [
    ['a1', '🤖', 'AI-Generated Interview Questions', 'Type any project title + stakeholders — the AI instantly builds tailored stakeholder questions. No templates to memorize.'],
    ['a2', '📈', 'Graph-Line Insights & Patterns', 'Watch answers, response volume and completion trend upward on a live line graph. Pain points and key findings update automatically.'],
    ['a3', '💡', 'Recommended Solutions', 'After every interview the AI proposes concrete, phased solutions — digitize records, automate approvals, add dashboards.'],
    ['a4', '🖨️', 'Printable Summary Cards', 'Each finished interview becomes a card with name, date and auto-detected time. One click prints a clean WPU report.']
  ];
  view().innerHTML =
    '<div class="hero"><span class="hero-kicker">🎓 Western Philippines University · Main Campus</span>'
    + '<h2>AI Assistance Interview System</h2>'
    + '<p>Conduct stakeholder interviews faster: generate smart questions, capture answers, uncover pain points with graph-line insights, and print professional summary reports — all in one place.</p>'
    + '<div class="hero-cta no-print"><button class="btn btn-light" id="hStart">➕ Start New Interview</button><button class="btn btn-outline-w" id="hHow">▶ How it works</button><button class="btn btn-outline-w" id="hDash">📊 Go to Dashboard</button></div>'
    + '<div class="hero-badges"><span>🧠 Built-in Smart AI</span><span>🌙 Night / ☀️ Light mode</span><span>📈 Line-graph insights</span><span>🖨️ One-click print</span></div></div>'
    + '<div class="slider no-print" id="slider">' + slides.map((s, i) => '<div class="slide' + (i === 0 ? ' on' : '') + '"><div class="slide-art ' + s[0] + '"><span class="orb" style="width:90px;height:90px;left:12%;top:18%"></span><span class="orb" style="width:50px;height:50px;right:16%;top:30%;animation-delay:1s"></span><span class="orb" style="width:70px;height:70px;left:40%;bottom:20%;animation-delay:2s"></span><div style="font-size:64px;z-index:2">' + s[1] + '</div><small>✨ AI-generated visual · ' + esc(s[2]) + '</small></div><div class="slide-body"><h3>' + esc(s[2]) + '</h3><p>' + esc(s[3]) + '</p><button class="btn btn-primary btn-sm" data-go="create">Try it now →</button></div></div>').join('') + '<div class="slide-dots" id="sDots">' + slides.map((_, i) => '<i data-i="' + i + '" class="' + (i === 0 ? 'on' : '') + '"></i>').join('') + '</div></div>'
    + '<div class="card" id="howSec" style="margin-top:18px"><h3>How AI interview works</h3><p class="sub">Four simple steps from idea to printable insight.</p><div class="how-grid">'
    + [['1', '📝', 'Create', 'Enter title, stakeholders & interviewee name. Date & time are auto-detected by AI.'], ['2', '⚡', 'Generate', 'AI builds tailored questions per stakeholder and category.'], ['3', '🎙️', 'Answer', 'Capture answers live — progress, pain points & patterns update.'], ['4', '📄', 'Report', 'Get key findings, solutions & print the summary card.']].map(h => '<div class="how"><span class="n">STEP ' + h[0] + '</span><b>' + h[1] + ' ' + h[2] + '</b><p>' + h[3] + '</p></div>').join('')
    + '</div></div>'
    + '<div class="grid g2" style="margin-top:18px"><div class="card"><h3>How AI interview helps you</h3><p class="sub">Built for WPU researchers, analysts & students.</p>'
    + [['🎯', 'linear-gradient(135deg,#3b6ef6,#6366f1)', 'Always relevant questions', 'Adapts to ANY title — enrollment, hospital, library, retail…'], ['⏱️', 'linear-gradient(135deg,#059669,#34d399)', 'Saves hours', 'No manual questionnaires; answers auto-track date & time.'], ['🔍', 'linear-gradient(135deg,#d97706,#f59e0b)', 'Finds real pain points', 'Line-graph trends + AI key findings reveal bottlenecks.'], ['🖨️', 'linear-gradient(135deg,#7c3aed,#ec4899)', 'Ready to submit', 'Clean printable report with WPU Main Campus header.']].map(b => '<div class="benefit"><div class="ic" style="background:' + b[1] + '">' + b[0] + '</div><div><b>' + b[2] + '</b><br><small style="color:var(--muted)">' + b[3] + '</small></div></div>').join('')
    + '</div><div class="card"><h3>Live snapshot</h3><p class="sub">Your current progress at a glance.</p><div id="homeStats">' + skel(1) + '</div><div class="uni-banner"><div style="font-size:30px">🎓</div><div><b>Western Philippines University · Main Campus</b><br><small>AI Assistance Interview System — stakeholder research, digitized.</small></div></div></div></div>';
  $('#hStart').onclick = () => go('create');
  $('#hHow').onclick = () => $('#howSec').scrollIntoView({ behavior: 'smooth' });
  $('#hDash').onclick = () => go('dashboard');
  $$('#view [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  let idx = 0;
  const show = (n) => { idx = (n + slides.length) % slides.length; $$('#slider .slide').forEach((el, i) => el.classList.toggle('on', i === idx)); $$('#sDots i').forEach((d, i) => d.classList.toggle('on', i === idx)); };
  $$('#sDots i').forEach(d => d.onclick = () => show(parseInt(d.dataset.i)));
  S.sliderT = setInterval(() => { if (S.route === 'home') show(idx + 1); }, 4500);
  api('/api/stats').then(st => {
    const el = $('#homeStats'); if (!el) return;
    el.innerHTML = '<div class="grid g3"><div class="stat" style="--stripe:linear-gradient(#3b6ef6,#7c3aed)"><small>Interviews</small><b>' + st.cards.totalInterviews + '</b><span>saved</span></div><div class="stat" style="--stripe:linear-gradient(#06b6d4,#16a34a)"><small>Answers</small><b>' + (st.cards.answersCollected || 0) + '</b><span>collected</span></div><div class="stat" style="--stripe:linear-gradient(#f59e0b,#ef4444)"><small>Completed</small><b>' + st.cards.completedInterviews + '</b><span>finished</span></div></div>';
  }).catch(() => { const el = $('#homeStats'); if (el) el.innerHTML = ''; });
}
/* ---------- dashboard ---------- */
async function pDashboard() {
  view().innerHTML = skel(4);
  try {
    const [st, rc] = await Promise.all([api('/api/stats'), api('/api/recent')]);
    const c = st.cards;
    const cards = [
      ['Total Interviews', c.totalInterviews, 'All saved interviews', 'linear-gradient(#3b6ef6,#7c3aed)'],
      ['Questions Generated', c.questionsGenerated, 'Across all interviews', 'linear-gradient(#7c3aed,#06b6d4)'],
      ['Answers Collected', c.answersCollected || 0, 'Responses saved', 'linear-gradient(#0ea5e9,#10b981)'],
      ['Completed Interviews', c.completedInterviews, 'Fully answered', 'linear-gradient(#06b6d4,#16a34a)'],
      ['Suggestions Generated', c.suggestionsGenerated, 'AI analyses saved', 'linear-gradient(#f59e0b,#ef4444)'],
      ['Active Users', c.activeUsers, 'Registered accounts', 'linear-gradient(#0ea5e9,#6366f1)']
    ];
    view().innerHTML =
      '<div class="grid g5">' + cards.map(k => '<div class="stat" style="--stripe:' + k[3] + '"><small>' + k[0] + '</small><b>' + k[1] + '</b><span>' + k[2] + '</span></div>').join('') + '</div>'
      + '<div class="card" style="margin-top:18px"><h3>Activity — last 14 days</h3><p class="sub">Live data from your database. Hover any point for details.</p>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px" id="toggles"></div>'
      + '<div style="height:300px"><canvas id="chart"></canvas></div></div>'
      + '<div class="card"><h3>Quick actions</h3><p class="sub">Jump straight into your workflow.</p><div class="grid g3">'
      + [['➕', 'Create New Interview', 'create'], ['⚡', 'Generate Questions', 'my'], ['📚', 'View Question Bank', 'bank'], ['💡', 'View Results', 'results'], ['🕘', 'View History', 'history'], ['📄', 'View Summary Report', 'report']].map(a => '<button class="btn btn-ghost" data-go="' + a[2] + '" style="padding:16px;font-size:14px"><span style="font-size:20px">' + a[0] + '</span> ' + a[1] + '</button>').join('')
      + '</div></div>'
      + '<div class="card"><h3>Recent interviews</h3><p class="sub">Your latest saved work.</p>' + (rc.interviews.length ? '<div class="table-wrap"><table><tr><th>Title</th><th>Status</th><th>Q&A</th><th></th></tr>' + rc.interviews.map(i => '<tr><td><b>' + esc(i.title) + '</b><br><small style="color:#64748b">' + esc(i.stakeholders) + '</small></td><td>' + badge(i.status) + '</td><td>' + i.answerCount + '/' + i.questionCount + '</td><td><button class="btn btn-ghost btn-sm" data-open="' + i.id + '">Open</button></td></tr>').join('') + '</table></div>' : '<div class="empty"><div class="big">📝</div><p>No interviews yet. Create your first one to see activity here.</p></div>') + '</div>';
    $$('#view [data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    $$('#view [data-open]').forEach(b => b.onclick = () => go('my', b.dataset.open));
    drawChart(st.series);
  } catch (e) { view().innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}
function drawChart(series) {
  const ctx = $('#chart'); if (!ctx || typeof Chart === 'undefined') return;
  destroyCharts();
  const dark = document.documentElement.dataset.theme === 'dark';
  const grid = dark ? 'rgba(255,255,255,.12)' : 'rgba(15,27,61,.08)';
  const tick = dark ? '#c6d2f0' : '#64748b';
  const labels = series.map(s => s.date.slice(5));
  const ds = (label, key, color) => ({ label, data: series.map(s => s[key] || 0), borderColor: color, backgroundColor: color + '22', tension: .35, fill: true, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2.5 });
  const ch = new Chart(ctx, { type: 'line', data: { labels, datasets: [ds('Interviews', 'interviews', '#3b6ef6'), ds('Questions', 'questions', '#7c3aed'), ds('Answers', 'answers', '#10b981'), ds('Completed', 'completed', '#06b6d4'), ds('Suggestions', 'suggestions', '#f59e0b')] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: tick } } }, scales: { x: { grid: { color: grid }, ticks: { color: tick } }, y: { beginAtZero: true, ticks: { precision: 0, color: tick }, grid: { color: grid } } } } });
  S.charts.push(ch);
  const tg = $('#toggles');
  ch.data.datasets.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'btn btn-ghost btn-sm'; b.textContent = d.label; b.style.borderColor = d.borderColor;
    b.onclick = () => { const v = ch.isDatasetVisible(i); v ? ch.hide(i) : ch.show(i); b.style.opacity = v ? '.45' : '1'; };
    tg.appendChild(b);
  });
}
/* ---------- create interview ---------- */
function pCreate() {
  view().innerHTML = '<div class="card"><h3>New interview</h3><p class="sub">Enter any project title and stakeholders — the AI adapts to whatever you type.</p>'
    + '<div class="grid g2"><label class="field"><span>Interview title *</span><input id="fTitle" placeholder="e.g. Web-Based Enrollment System"></label>'
    + '<label class="field"><span>Interview type</span><select id="fType"><option>Requirements Gathering</option><option>Feedback Review</option><option>Problem Discovery</option><option>User Research</option><option>System Evaluation</option><option>General</option></select></label></div>'
    + '<label class="field"><span>Description</span><textarea id="fDesc" style="min-height:80px" placeholder="Purpose and background…"></textarea></label>'
    + '<label class="field"><span>Stakeholders *</span><input id="fSh" placeholder="e.g. Students, Registrar, Teachers, IT Staff"></label>'
    + '<div class="grid g2"><label class="field"><span>Interviewee</span><input id="fWho" placeholder="Person interviewed (optional)"></label>'
    + '<label class="field"><span>Date</span><input id="fDate" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></label></div>'
    + '<label class="field"><span>How many AI questions? (max 50)</span><input id="fCount" type="number" min="5" max="50" value="' + (S.settings.defaultQuestionCount || 20) + '"></label>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-ghost" id="bBack">Back</button>'
    + '<button class="btn btn-primary" id="bSave" style="flex:1">Save interview & generate questions</button></div></div>';
  $('#bBack').onclick = () => go('dashboard');
  $('#bSave').onclick = async (e) => {
    const title = $('#fTitle').value.trim(), sh = $('#fSh').value.trim();
    if (!title || !sh) { toast('Please complete all required fields.', 'error'); return; }
    const btn = e.currentTarget; btnLoading(btn, true, 'Saving interview…');
    try {
      const j = await api('/api/interviews', { method: 'POST', body: JSON.stringify({ title, description: $('#fDesc').value, stakeholders: sh, interviewee: $('#fWho').value, date: $('#fDate').value, type: $('#fType').value }) });
      toast('Interview created successfully.');
      btnLoading(btn, true, 'Generating questions…');
      const g = await api('/api/interviews/' + j.interview.id + '/generate', { method: 'POST', body: JSON.stringify({ count: Math.min(50, Math.max(1, parseInt($('#fCount').value) || 20)) }) });
      toast('Questions generated successfully (' + g.questions.length + ').');
      go('my', j.interview.id);
    } catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
  };
}
/* ---------- my interviews list ---------- */
let myCache = [];
async function pMy(openId) {
  view().innerHTML = skel(3);
  try {
    myCache = (await api('/api/interviews')).interviews;
    if (openId) return pAnswer(openId);
    if (!myCache.length) { view().innerHTML = '<div class="card"><div class="empty"><div class="big">🎙</div><h3>No interviews yet</h3><p>Create your first interview to start generating AI questions.</p><button class="btn btn-primary" id="eCreate">Create interview</button></div></div>'; $('#eCreate').onclick = () => go('create'); return; }
    view().innerHTML = '<div class="card"><h3>My interviews</h3><p class="sub">Open an interview to answer questions or generate more.</p><div class="toolbar"><input id="q" placeholder="Search interviews…"></div><div id="list" class="grid g2"></div></div>';
    const draw = () => {
      const s = $('#q').value.toLowerCase();
      $('#list').innerHTML = myCache.filter(i => (i.title + ' ' + i.stakeholders).toLowerCase().includes(s)).map(i =>
        '<div class="qa-card"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="flex:1;min-width:150px">' + esc(i.title) + '</b>' + badge(i.status) + '</div>'
        + '<p style="color:#64748b;font-size:13px;margin:8px 0">' + esc(i.stakeholders) + ' · ' + esc(i.date) + ' · ' + i.answerCount + '/' + i.questionCount + ' answered</p>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-a="open" data-id="' + i.id + '">Open Q&A</button><button class="btn btn-ghost btn-sm" data-a="edit" data-id="' + i.id + '">Edit</button><button class="btn btn-ghost btn-sm" data-a="results" data-id="' + i.id + '">Results</button><button class="btn btn-ghost btn-sm" data-a="report" data-id="' + i.id + '">Report</button><button class="btn btn-danger btn-sm" data-a="del" data-id="' + i.id + '">Delete</button></div></div>').join('')
        || '<div class="empty">No matches.</div>';
      $$('#list [data-a]').forEach(b => b.onclick = () => myAction(b.dataset.a, b.dataset.id));
    };
    $('#q').oninput = draw; draw();
  } catch (e) { view().innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}
async function myAction(a, id) {
  if (a === 'open') go('my', id);
  else if (a === 'results') go('results', id);
  else if (a === 'report') go('report', id);
  else if (a === 'edit') editInterview(id, () => pMy());
  else if (a === 'del') confirmDlg('Delete interview?', 'Are you sure you want to delete this interview? This removes its questions, answers and suggestions.', 'Delete', async () => { await api('/api/interviews/' + id, { method: 'DELETE' }); toast('Interview deleted successfully.'); pMy(); });
}
/* ---------- edit interview modal (shared) ---------- */
async function editInterview(id, after) {
  try {
    const j = await api('/api/interviews/' + id); const iv = j.interview;
    modal('<h3>Edit interview</h3><p>Changes save directly to the database.</p>'
      + '<label class="field"><span>Title</span><input id="mTitle" value="' + esc(iv.title) + '"></label>'
      + '<label class="field"><span>Stakeholders</span><input id="mSh" value="' + esc(iv.stakeholders) + '"></label>'
      + '<label class="field"><span>Description</span><textarea id="mDesc">' + esc(iv.description || '') + '</textarea></label>'
      + '<div class="grid g2"><label class="field"><span>Interviewee</span><input id="mWho" value="' + esc(iv.interviewee || '') + '"></label>'
      + '<label class="field"><span>Date</span><input id="mDate" type="date" value="' + esc(iv.date || '') + '"></label></div>'
      + '<label class="field"><span>Status</span><select id="mStatus">' + ['draft', 'in-progress', 'completed'].map(s => '<option' + (iv.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>'
      + '<div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Back</button><button class="btn btn-primary" id="mOk">Save changes</button></div>', true);
    $('#mCancel').onclick = closeModal;
    $('#mOk').onclick = async (e) => {
      const btn = e.target; btnLoading(btn, true, 'Saving…');
      try {
        await api('/api/interviews/' + id, { method: 'PUT', body: JSON.stringify({ title: $('#mTitle').value, stakeholders: $('#mSh').value, description: $('#mDesc').value, interviewee: $('#mWho').value, date: $('#mDate').value, status: $('#mStatus').value }) });
        closeModal(); toast('Report updated successfully.'); if (after) after();
      } catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
    };
  } catch (e) { toast(e.message, 'error'); }
}
/* ---------- Q&A walkthrough ---------- */
async function pAnswer(id) {
  view().innerHTML = skel(2);
  try {
    const j = await api('/api/interviews/' + id);
    S.qa = { id, list: await api('/api/interviews/' + id + '/questions').then(r => r.questions), idx: 0, dirty: false, interview: j.interview };
    if (!S.qa.list.length) {
      view().innerHTML = '<div class="card"><button class="btn btn-ghost btn-sm no-print" id="aBack">← Back to interview</button>'
        + '<div class="empty"><div class="big">⚡</div><h3>No questions yet</h3><p>Generate AI questions tailored to “' + esc(j.interview.title) + '”.</p>'
        + '<div style="display:flex;gap:8px;justify-content:center;align-items:center;flex-wrap:wrap"><input id="gCount" type="number" min="5" max="50" value="20" style="width:90px;border:1.5px solid var(--line);border-radius:10px;padding:9px 12px"><button class="btn btn-primary" id="aGen">Generate questions</button></div></div></div>';
      $('#aBack').onclick = () => { S.qa.dirty = false; pMy(); };
      $('#aGen').onclick = async (e) => {
        const btn = e.target; btnLoading(btn, true, 'Generating…');
        try { const g = await api('/api/interviews/' + id + '/generate', { method: 'POST', body: JSON.stringify({ count: parseInt($('#gCount').value) || 20 }) }); toast('Questions generated successfully (' + g.questions.length + ').'); pAnswer(id); }
        catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
      };
      return;
    }
    drawQA();
  } catch (e) { view().innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}
function drawQA() {
  const { list, idx, interview } = S.qa;
  const q = list[idx];
  const done = list.filter(x => x.answer && x.answer.trim()).length;
  view().innerHTML = '<div class="qa-card"><div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button class="btn btn-ghost btn-sm" id="qBack">← Back to interview</button>'
    + '<span style="flex:1"></span><button class="btn btn-ghost btn-sm" id="qEdit">Edit interview</button>'
    + '<button class="btn btn-ghost btn-sm" id="qResults">Results</button></div>'
    + '<h3 style="margin:16px 0 2px">' + esc(interview.title) + '</h3>'
    + '<p style="color:#64748b;font-size:13px;margin:0">' + esc(interview.stakeholders) + '</p>'
    + '<div class="progress"><i style="width:' + Math.round(done / list.length * 100) + '%"></i></div>'
    + '<small style="color:#64748b">Question ' + (idx + 1) + ' of ' + list.length + ' · ' + done + ' answered</small>'
    + '<div class="qa-meta"><span class="chip">' + esc(q.stakeholder) + '</span><span class="chip cyan">' + esc(q.category) + '</span></div>'
    + '<p style="font-size:16.5px;font-weight:600;line-height:1.55">' + esc(q.text) + '</p>'
    + '<label class="field"><span>Your answer</span><textarea id="qAns" placeholder="Type the stakeholder’s answer here…">' + esc(q.answer || '') + '</textarea></label>'
    + '<div class="qa-nav"><button class="btn btn-ghost" id="qPrev"' + (idx === 0 ? ' disabled' : '') + '>← Previous</button>'
    + '<button class="btn btn-primary" id="qSave">Save answer</button>'
    + '<button class="btn btn-ghost" id="qNext"' + (idx === list.length - 1 ? ' disabled' : '') + '>Next →</button></div>'
    + '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" id="qMore">⚡ Generate more</button>'
    + '<button class="btn btn-ghost btn-sm" id="qJump">Jump to…</button></div></div>';
  $('#qBack').onclick = () => { S.qa.dirty = false; pMy(); };
  $('#qEdit').onclick = () => editInterview(S.qa.id, () => pAnswer(S.qa.id));
  $('#qResults').onclick = () => go('results', S.qa.id);
  $('#qPrev').onclick = () => { S.qa.idx = Math.max(0, S.qa.idx - 1); S.qa.dirty = false; drawQA(); };
  $('#qNext').onclick = () => { S.qa.idx = Math.min(S.qa.list.length - 1, S.qa.idx + 1); S.qa.dirty = false; drawQA(); };
  $('#qAns').oninput = () => { S.qa.dirty = $('#qAns').value !== (q.answer || ''); };
  $('#qSave').onclick = async (e) => {
    const btn = e.currentTarget; btnLoading(btn, true, 'Saving…');
    try {
      const r = await api('/api/questions/' + q.id + '/answer', { method: 'POST', body: JSON.stringify({ answer: $('#qAns').value }) });
      q.answer = r.question.answer; S.qa.dirty = false; S.qa.interview = r.interview;
      toast('Answers saved successfully.');
      if (S.qa.idx < S.qa.list.length - 1) { S.qa.idx++; }
      drawQA();
    } catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
  };
  $('#qMore').onclick = async (e) => {
    const btn = e.currentTarget; btnLoading(btn, true, 'Generating…');
    try { const g = await api('/api/interviews/' + S.qa.id + '/generate', { method: 'POST', body: JSON.stringify({ count: 10 }) }); toast('Questions generated successfully (+' + g.questions.length + ').'); pAnswer(S.qa.id); }
    catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
  };
  $('#qJump').onclick = () => {
    modal('<h3>Jump to question</h3><p>' + S.qa.list.length + ' questions in this interview.</p><div style="display:flex;gap:6px;flex-wrap:wrap;max-height:240px;overflow:auto">' + S.qa.list.map((x, i) => '<button class="btn btn-sm ' + (x.answer && x.answer.trim() ? 'btn-primary' : 'btn-ghost') + '" data-j="' + i + '">' + (i + 1) + '</button>').join('') + '</div><div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Close</button></div>');
    $('#mCancel').onclick = closeModal;
    $$('#modalRoot [data-j]').forEach(b => b.onclick = () => { S.qa.idx = parseInt(b.dataset.j); S.qa.dirty = false; closeModal(); drawQA(); });
  };
}
/* ---------- questions bank ---------- */
async function pBank() {
  view().innerHTML = skel(3);
  try {
    const j = await api('/api/bank');
    const shs = [...new Set(j.questions.map(q => q.stakeholder))].sort();
    view().innerHTML = '<div class="card"><h3>Questions bank</h3><p class="sub">' + j.questions.length + ' questions stored. Search, filter, edit or delete.</p>'
      + '<div class="toolbar"><input id="bSearch" placeholder="Search questions or answers…"><select id="bIv"><option value="">All interviews</option>' + j.interviews.map(i => '<option value="' + i.id + '">' + esc(i.title) + '</option>').join('') + '</select>'
      + '<select id="bSh"><option value="">All stakeholders</option>' + shs.map(s => '<option>' + esc(s) + '</option>').join('') + '</select></div>'
      + '<div id="bList"></div><div id="bPages" style="display:flex;gap:8px;margin-top:12px;align-items:center;flex-wrap:wrap"></div></div>';
    let page = 0;
    const per = S.settings.itemsPerPage || 8;
    const draw = async () => {
      const q = await api('/api/bank?search=' + encodeURIComponent($('#bSearch').value) + '&interviewId=' + $('#bIv').value + '&stakeholder=' + encodeURIComponent($('#bSh').value));
      const rows = q.questions;
      const pages = Math.max(1, Math.ceil(rows.length / per));
      page = Math.min(page, pages - 1);
      const slice = rows.slice(page * per, page * per + per);
      $('#bList').innerHTML = slice.length ? '<div class="table-wrap"><table><tr><th>#</th><th>Question</th><th>Stakeholder</th><th>Interview</th><th></th></tr>' + slice.map(x =>
        '<tr><td>' + x.number + '</td><td><b>' + esc(x.text) + '</b>' + (x.answer ? '<br><small style="color:#16a34a">✓ answered</small>' : '<br><small style="color:#94a3b8">no answer yet</small>') + '</td><td>' + esc(x.stakeholder) + '</td><td><small>' + esc(x.interviewTitle) + '</small></td>'
        + '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-e="' + x.id + '">Edit</button> <button class="btn btn-danger btn-sm" data-d="' + x.id + '">Delete</button></td></tr>').join('') + '</table></div>'
        : '<div class="empty"><div class="big">📚</div><p>No questions match your filters.</p></div>';
      $('#bPages').innerHTML = '<button class="btn btn-ghost btn-sm" id="pPrev">← Prev</button><small style="color:#64748b">Page ' + (page + 1) + ' of ' + pages + ' · ' + rows.length + ' results</small><button class="btn btn-ghost btn-sm" id="pNext">Next →</button>';
      $('#pPrev').onclick = () => { page = Math.max(0, page - 1); draw(); };
      $('#pNext').onclick = () => { page = Math.min(pages - 1, page + 1); draw(); };
      $$('#bList [data-e]').forEach(b => b.onclick = () => editQuestion(b.dataset.e, draw));
      $$('#bList [data-d]').forEach(b => b.onclick = () => confirmDlg('Delete question?', 'Are you sure you want to delete this question?', 'Delete', async () => { await api('/api/questions/' + b.dataset.d, { method: 'DELETE' }); toast('Question deleted.'); draw(); }));
    };
    let t; $('#bSearch').oninput = () => { clearTimeout(t); t = setTimeout(() => { page = 0; draw(); }, 300); };
    $('#bIv').onchange = () => { page = 0; draw(); }; $('#bSh').onchange = () => { page = 0; draw(); };
    draw();
  } catch (e) { view().innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}
async function editQuestion(qid, after) {
  modal('<h3>Edit question</h3><label class="field"><span>Question</span><textarea id="qText"></textarea></label><label class="field"><span>Stakeholder</span><input id="qSh"></label><label class="field"><span>Category</span><input id="qCat"></label><div class="modal-actions"><button class="btn btn-ghost" id="mCancel">Back</button><button class="btn btn-primary" id="mOk">Save</button></div>', true);
  $('#mCancel').onclick = closeModal;
  $('#mOk').onclick = async (e) => {
    const btn = e.target; btnLoading(btn, true, 'Saving…');
    try { await api('/api/questions/' + qid, { method: 'PUT', body: JSON.stringify({ text: $('#qText').value, stakeholder: $('#qSh').value, category: $('#qCat').value }) }); closeModal(); toast('Question saved.'); if (after) after(); }
    catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
  };
}
/* ---------- results & suggestions (insights + graph line) ---------- */
async function pResults(selId) {
  view().innerHTML = skel(3);
  try {
    const all = (await api('/api/interviews')).interviews;
    if (!all.length) { view().innerHTML = '<div class="card"><div class="empty"><div class="big">💡</div><p>No interviews yet.</p></div></div>'; return; }
    const id = selId || all[0].id;
    const d = await api('/api/interviews/' + id);
    const s = await api('/api/interviews/' + id + '/suggestion');
    const qa = (await api('/api/interviews/' + id + '/questions')).questions;
    const st = await api('/api/stats').catch(() => null);
    view().innerHTML = '<div class="card no-print"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
      + '<button class="btn btn-ghost btn-sm" id="rBack">← Back</button>'
      + '<select id="rSel" style="flex:1;min-width:200px;border:1.5px solid var(--line);border-radius:10px;padding:9px 12px;background:var(--card);color:var(--ink)">' + all.map(i => '<option value="' + i.id + '"' + (i.id === id ? ' selected' : '') + '>' + esc(i.title) + ' (' + i.answerCount + '/' + i.questionCount + ')</option>').join('') + '</select>'
      + '<button class="btn btn-primary btn-sm" id="rGen">Generate insights</button><button class="btn btn-ghost btn-sm" id="rPrint">🖨 Print</button></div></div><div id="rBody" style="margin-top:18px"></div>';
    $('#rBack').onclick = () => go('history');
    $('#rSel').onchange = (e) => pResults(e.target.value);
    $('#rPrint').onclick = () => doPrint('Insights — ' + d.interview.title);
    $('#rGen').onclick = async (e) => {
      const btn = e.currentTarget; btnLoading(btn, true, 'Analyzing answers…');
      try { await api('/api/interviews/' + id + '/analyze', { method: 'POST' }); toast('Insights generated successfully.'); pResults(id); }
      catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
    };
    const sg = s.suggestion;
    if (!sg) { $('#rBody').innerHTML = '<div class="card"><div class="empty"><div class="big">🔍</div><h3>No analysis yet</h3><p>Answer questions first, then click "Generate insights" — the AI builds the graph line, pain points, key findings & recommended solutions.</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn btn-ghost" id="rQa">Answer questions</button></div></div></div>'; $('#rQa').onclick = () => go('my', id); return; }
    const sec = (t, arr) => '<h4>' + t + '</h4><ul>' + (arr || []).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    const words = qa.filter(q => q.answer && q.answer.trim());
    const avgLen = words.length ? Math.round(words.reduce((n, q) => n + String(q.answer).trim().split(/\s+/).length, 0) / words.length) : 0;
    const rate = qa.length ? Math.round(words.length / qa.length * 100) : 0;
    $('#rBody').innerHTML = '<div class="grid g4">'
      + [['❓ Questions', qa.length, 'asked'], ['✍️ Answers', words.length, rate + '% response rate'], ['📝 Avg length', avgLen, 'words / answer'], ['🤖 Analyzed', sg.createdAt ? String(sg.createdAt).slice(0, 10) : 'today', 'via ' + esc(sg.source || 'AI')]].map(x => '<div class="stat" style="--stripe:linear-gradient(#3b6ef6,#7c3aed)"><small>' + x[0] + '</small><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></div>').join('')
      + '</div><div class="card" style="margin-top:18px"><h3>📈 Response pattern — graph line</h3><p class="sub">Answers, questions & completions across the last 14 days. Hover any point for exact values.</p><div class="chart-box"><canvas id="insightChart"></canvas></div><div style="margin-top:10px">' + topThemes(qa).map(t => '<span class="insight-tag">#' + esc(t) + '</span>').join('') + '</div></div>'
      + '<div class="card report" style="margin-top:18px"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h3 style="flex:1;min-width:200px">' + esc(d.interview.title) + '</h3>' + badge(d.interview.status) + '</div>'
      + '<p class="sub">' + esc(d.interview.stakeholders) + ' · Interviewee: <b>' + esc(d.interview.interviewee || '-') + '</b> · Date: <b>' + esc(d.interview.date || '-') + '</b> · Time taken: <b>' + esc(d.interview.takenTime || autoTime(d.interview)) + '</b> · source: ' + esc(sg.source || 'ai') + '</p>'
      + '<h4>📝 Executive summary</h4><p>' + esc(sg.summary || '') + '</p>'
      + sec('🔑 Key findings', sg.keyFindings) + sec('⚠ Pain points', sg.painPoints) + sec('🚨 Major issues', sg.majorIssues)
      + sec('✅ Recommended solutions', sg.recommendations) + sec('💡 Solution roadmap', sg.solutionIdeas) + sec('👁 Important observations & patterns', sg.observations) + sec('🎯 Priority areas', sg.priorities)
      + '<div class="no-print" style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="rPrint2">🖨 Print insights</button><button class="btn btn-ghost btn-sm" id="rReport">View summary report</button><button class="btn btn-ghost btn-sm" id="rHistory">Back to history</button></div></div>';
    $('#rReport').onclick = () => go('report', id);
    $('#rHistory').onclick = () => go('history');
    const p2 = $('#rPrint2'); if (p2) p2.onclick = () => doPrint('Insights — ' + d.interview.title);
    drawInsightChart(st ? st.series : [], qa);
  } catch (e) { view().innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}
/* ---------- shared insight helpers + printing ---------- */
function autoTime(iv) {
  try {
    const base = iv.takenAt || iv.createdAt || iv.date;
    if (!base) return '—';
    return new Date(base).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}
function topThemes(qa) {
  const stop = new Set(['that', 'this', 'with', 'have', 'from', 'they', 'them', 'there', 'their', 'about', 'because', 'would', 'could', 'should', 'system', 'interview']);
  const freq = {};
  (qa || []).forEach(q => String(q.answer || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 4 && !stop.has(w)).forEach(w => freq[w] = (freq[w] || 0) + 1));
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
}
function doPrint(title) {
  const m = $('#printMeta'); if (m) m.textContent = (title || 'Interview report') + ' · printed ' + new Date().toLocaleString('en-PH');
  setTimeout(() => window.print(), 60);
}
function drawInsightChart(series, qa) {
  const el = $('#insightChart'); if (!el || typeof Chart === 'undefined') return;
  const dark = document.documentElement.dataset.theme === 'dark';
  const grid = dark ? 'rgba(255,255,255,.12)' : 'rgba(15,27,61,.08)';
  const tick = dark ? '#c6d2f0' : '#64748b';
  const labels = (series || []).map(s => String(s.date).slice(5));
  const col = (k, c, fill) => ({ label: k, data: (series || []).map(s => s[c] || 0), borderColor: c === 'answers' ? '#10b981' : c === 'words' ? '#7c3aed' : '#3b6ef6', backgroundColor: (c === 'answers' ? '#10b981' : c === 'words' ? '#7c3aed' : '#3b6ef6') + '22', tension: .38, fill: !!fill, pointRadius: 3.5, borderWidth: 2.5 });
  const ch = new Chart(el, { type: 'line', data: { labels, datasets: [{ ...col('Answers', 'answers', true) }, { ...col('Questions', 'questions', true) }, { ...col('Completed', 'completed', false) }, { ...col('Answer words', 'words', false) }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: tick, usePointStyle: true } }, tooltip: { mode: 'index', intersect: false } }, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { color: grid }, ticks: { color: tick } }, y: { beginAtZero: true, ticks: { precision: 0, color: tick }, grid: { color: grid } } } } });
  S.charts.push(ch);
}
/* ---------- history ---------- */
async function pHistory() {
  view().innerHTML = skel(3);
  try {
    const all = (await api('/api/interviews')).interviews;
    view().innerHTML = '<div class="card"><h3>Interview history</h3><p class="sub">Every saved interview with view, edit and delete actions.</p>'
      + '<div class="toolbar"><input id="hSearch" placeholder="Search title, stakeholders…"><select id="hStatus"><option value="">All statuses</option><option>draft</option><option>in-progress</option><option>completed</option></select></div>'
      + '<div id="hList"></div></div>';
    const draw = async () => {
      const j = await api('/api/interviews?search=' + encodeURIComponent($('#hSearch').value) + '&status=' + $('#hStatus').value);
      $('#hList').innerHTML = j.interviews.length ? '<div class="table-wrap"><table><tr><th>Title</th><th>Stakeholders</th><th>Date</th><th>Status</th><th>Q&A</th><th>Actions</th></tr>' + j.interviews.map(i =>
        '<tr><td><b>' + esc(i.title) + '</b></td><td><small>' + esc(i.stakeholders) + '</small></td><td>' + esc(i.date) + '</td><td>' + badge(i.status) + '</td><td>' + i.answerCount + '/' + i.questionCount + '</td>'
        + '<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-a="view" data-id="' + i.id + '">View</button> <button class="btn btn-ghost btn-sm" data-a="edit" data-id="' + i.id + '">Edit</button> <button class="btn btn-danger btn-sm" data-a="del" data-id="' + i.id + '">Delete</button></td></tr>').join('') + '</table></div>'
        : '<div class="empty"><div class="big">🕘</div><p>No interviews found. History is loading from the database — try clearing filters.</p></div>';
      $$('#hList [data-a]').forEach(b => b.onclick = () => {
        const id = b.dataset.id, a = b.dataset.a;
        if (a === 'view') go('report', id);
        else if (a === 'edit') editInterview(id, () => pHistory());
        else confirmDlg('Delete interview?', 'Are you sure you want to delete this interview?', 'Delete', async () => { await api('/api/interviews/' + id, { method: 'DELETE' }); toast('Interview deleted successfully.'); pHistory(); });
      });
    };
    let t; $('#hSearch').oninput = () => { clearTimeout(t); t = setTimeout(draw, 300); };
    $('#hStatus').onchange = draw; draw();
  } catch (e) { view().innerHTML = '<div class="alert alert-error">Loading history… ' + esc(e.message) + '</div>'; }
}
/* ---------- summary report (cards per interview + functional print) ---------- */
async function pReport(selId) {
  view().innerHTML = skel(3);
  try {
    const all = (await api('/api/interviews')).interviews;
    if (!all.length) { view().innerHTML = '<div class="card"><div class="empty"><div class="big">📄</div><p>No interviews to report on yet.</p></div></div>'; return; }
    const id = selId || all[0].id;
    const d = await api('/api/interviews/' + id);
    const iv = d.interview;
    let sg = (await api('/api/interviews/' + id + '/suggestion')).suggestion;
    const qa = (await api('/api/interviews/' + id + '/questions')).questions;
    view().innerHTML = '<div class="card no-print"><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
      + '<button class="btn btn-ghost btn-sm" id="sBack">← Back</button>'
      + '<select id="sSel" style="flex:1;min-width:200px;border:1.5px solid var(--line);border-radius:10px;padding:9px 12px;background:var(--card);color:var(--ink)">' + all.map(i => '<option value="' + i.id + '"' + (i.id === id ? ' selected' : '') + '>' + esc(i.title) + '</option>').join('') + '</select>'
      + '<button class="btn btn-ghost btn-sm" id="sEdit">Edit</button><button class="btn btn-danger btn-sm" id="sDel">Delete</button>'
      + '<button class="btn btn-primary btn-sm" id="sGen">' + (sg ? 'Regenerate report' : 'Generate report') + '</button>'
      + '<button class="btn btn-ghost btn-sm" id="sPrint">🖨 Print / Export</button></div>'
      + '<p class="sub" style="margin:10px 0 0">📌 Each finished interview below is a summary card — name, date & time auto-detected by AI. “Print / Export” prints the detail + all cards.</p></div>'
      + '<h3 style="margin:20px 0 10px">🗂 Completed interview cards</h3><div class="grid g3" id="sumCards"></div><div id="sBody" style="margin-top:18px"></div>';
    $('#sBack').onclick = () => go('history');
    $('#sSel').onchange = (e) => pReport(e.target.value);
    $('#sEdit').onclick = () => editInterview(id, () => pReport(id));
    $('#sDel').onclick = () => confirmDlg('Delete interview?', 'Are you sure you want to delete this interview?', 'Delete', async () => { await api('/api/interviews/' + id, { method: 'DELETE' }); toast('Interview deleted successfully.'); go('history'); });
    $('#sPrint').onclick = () => doPrint('Summary report — ' + iv.title);
    $('#sGen').onclick = async (e) => {
      const btn = e.currentTarget; btnLoading(btn, true, 'Generating summary report…');
      try { await api('/api/interviews/' + id + '/analyze', { method: 'POST' }); toast('Summary report generated.'); pReport(id); }
      catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
    };
    // one card per interview: name + auto-detected date/time + details
    $('#sumCards').innerHTML = all.map(c => {
      const cls = c.status === 'completed' ? 'done' : c.status === 'in-progress' ? 'prog' : 'draft';
      return '<div class="sum-card"><div class="sum-top ' + cls + '"><b>' + esc(c.title) + '</b><small>' + esc(c.interviewee || c.stakeholders.split(',')[0] || '—') + ' · ' + badge(c.status) + '</small></div>'
        + '<div class="sum-body">'
        + '<div class="row"><small>👤 Name</small><span><b>' + esc(c.interviewee || '—') + '</b></span></div>'
        + '<div class="row"><small>📅 Date</small><span>' + esc(c.date || '—') + '</span></div>'
        + '<div class="row"><small>⏰ Time</small><span>' + esc(c.takenTime || autoTime(c)) + ' (auto-detected)</span></div>'
        + '<div class="row"><small>👥 Stakeholders</small><span>' + esc(c.stakeholders) + '</span></div>'
        + '<div class="row"><small>✅ Progress</small><span>' + c.answerCount + '/' + c.questionCount + ' answered</span></div>'
        + '</div><div class="sum-foot no-print"><button class="btn btn-primary btn-sm" data-v="' + c.id + '">Open</button><button class="btn btn-ghost btn-sm" data-p="' + c.id + '">🖨 Print</button></div></div>';
    }).join('');
    $$('#sumCards [data-v]').forEach(b => b.onclick = () => pReport(b.dataset.v));
    $$('#sumCards [data-p]').forEach(b => b.onclick = () => { const t = all.find(x => x.id === b.dataset.p); pReport(b.dataset.p); setTimeout(() => doPrint('Summary — ' + (t ? t.title : '')), 450); });
    const sec = (t, arr) => '<h4>' + t + '</h4><ul>' + (arr || []).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    const li = (arr) => (arr || []).map(x => '<li>' + esc(x) + '</li>').join('');
    const ansN = qa.filter(q => q.answer && q.answer.trim()).length;
    $('#sBody').innerHTML = '<div class="card report"><h3>' + esc(iv.title) + '</h3>'
      + '<p class="sub">👤 Interviewee: <b>' + esc(iv.interviewee || '-') + '</b> · 📅 Date: <b>' + esc(iv.date) + '</b> · ⏰ Time taken: <b>' + esc(iv.takenTime || autoTime(iv)) + '</b> (auto-detected by AI) · Type: ' + esc(iv.type || 'General') + ' · Status: ' + esc(iv.status) + '</p>'
      + (iv.description ? '<p>' + esc(iv.description) + '</p>' : '')
      + '<h4>Interview statistics</h4><ul><li>Questions: ' + qa.length + '</li><li>Answered: ' + ansN + '</li><li>Completion: ' + (qa.length ? Math.round(ansN / qa.length * 100) : 0) + '%</li></ul>'
      + (sg ? '<h4>📝 Interview summary</h4><p>' + esc(sg.summary || '') + '</p>' + sec('🔑 Key findings', sg.keyFindings) + sec('⚠ Pain points', sg.painPoints) + sec('🚨 Major issues', sg.majorIssues) + sec('✅ Recommended solutions', sg.recommendations) + sec('💡 AI-generated solution ideas', sg.solutionIdeas)
        : '<div class="alert alert-ok no-print">No AI report yet — click "Generate report" above.</div>')
      + '<h4>Question / answer summary</h4><ul>' + (qa.map(q => '<li><b>Q' + q.number + ':</b> ' + esc(q.text) + '<br><span style="color:var(--muted)">A: ' + esc(q.answer || '(no answer yet)') + '</span></li>').join('') || li(['No questions yet'])) + '</ul>'
      + '<div class="no-print" style="margin-top:14px"><button class="btn btn-primary btn-sm" id="sPrint2">🖨 Print this report</button></div></div>';
    const sp2 = $('#sPrint2'); if (sp2) sp2.onclick = () => doPrint('Summary report — ' + iv.title);
  } catch (e) { view().innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}
/* ---------- profile ---------- */
async function pProfile() {
  view().innerHTML = skel(2);
  try {
    const j = await api('/api/profile'); const u = j.user;
    view().innerHTML = '<div class="grid g2"><div class="card"><h3>Profile</h3><p class="sub">Your account information.</p>'
      + '<div style="display:flex;gap:14px;align-items:center;margin-bottom:16px"><div class="avatar" style="width:56px;height:56px;font-size:22px">' + esc((u.displayName || u.username).slice(0, 1).toUpperCase()) + '</div><div><b style="font-size:17px">' + esc(u.displayName || u.username) + '</b><br><small style="color:#64748b">' + esc(u.role) + ' · @' + esc(u.username) + '</small></div></div>'
      + '<label class="field"><span>Display name</span><input id="pfName" value="' + esc(u.displayName || '') + '"></label>'
      + '<label class="field"><span>Email</span><input id="pfEmail" value="' + esc(u.email || '') + '" placeholder="you@example.com"></label>'
      + '<button class="btn btn-primary" id="pfSave">Save profile</button></div>'
      + '<div class="card"><h3>Change password</h3><p class="sub">Passwords are hashed with bcrypt and never displayed.</p>'
      + '<label class="field"><span>Current password</span><span class="pw-wrap"><input id="pwCur" type="password"><button type="button" class="icon-btn" id="t1">👁</button></span></label>'
      + '<label class="field"><span>New password (min 6 chars)</span><span class="pw-wrap"><input id="pwNew" type="password"><button type="button" class="icon-btn" id="t2">👁</button></span></label>'
      + '<button class="btn btn-ghost" id="pwSave">Update password</button>'
      + '<p class="login-hint">Username: <b>' + esc(u.username) + '</b> · Member since ' + esc(String(u.createdAt || '').slice(0, 10)) + '</p></div></div>';
    const tg = (b, i) => $(b).onclick = () => { const p = $(i); p.type = p.type === 'password' ? 'text' : 'password'; };
    tg('#t1', '#pwCur'); tg('#t2', '#pwNew');
    $('#pfSave').onclick = async (e) => {
      const btn = e.currentTarget; btnLoading(btn, true, 'Saving…');
      try { const r = await api('/api/profile', { method: 'PUT', body: JSON.stringify({ displayName: $('#pfName').value, email: $('#pfEmail').value }) }); S.user = r.user; showApp(); toast('Profile updated.'); pProfile(); }
      catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
    };
    $('#pwSave').onclick = async (e) => {
      const btn = e.currentTarget; btnLoading(btn, true, 'Saving…');
      try { await api('/api/profile', { method: 'PUT', body: JSON.stringify({ currentPassword: $('#pwCur').value, newPassword: $('#pwNew').value }) }); toast('Password updated.'); $('#pwCur').value = ''; $('#pwNew').value = ''; btnLoading(btn, false); }
      catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
    };
  } catch (e) { view().innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}
/* ---------- settings ---------- */
async function pSettings() {
  view().innerHTML = skel(2);
  try {
    const j = await api('/api/settings'); const st = j.settings;
    const sw = (k, t, d, on) => '<div class="switch"><div><b>' + t + '</b><small>' + d + '</small></div><label class="tgl"><input type="checkbox" data-k="' + k + '"' + (on ? ' checked' : '') + '><i></i></label></div>';
    view().innerHTML = '<div class="grid g2"><div class="card"><h3>🌙 Night / ☀️ Light mode</h3><p class="sub">Readable in both modes — contrast checked. Takes effect instantly.</p>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px"><button class="btn btn-primary btn-sm" id="tLight">☀️ Light mode</button><button class="btn btn-ghost btn-sm" id="tDark">🌙 Night mode</button></div>'
      + '<h3>Interface preferences</h3><p class="sub">Every setting below takes effect immediately.</p>'
      + '<label class="field"><span>Accent theme</span><select id="sAccent">' + ['blue', 'purple', 'cyan'].map(a => '<option' + (st.accent === a ? ' selected' : '') + '>' + a + '</option>').join('') + '</select></label>'
      + '<label class="field"><span>Items per page (bank & lists)</span><input id="sPer" type="number" min="4" max="24" value="' + st.itemsPerPage + '"></label>'
      + '<label class="field"><span>Default question count</span><input id="sDef" type="number" min="5" max="50" value="' + st.defaultQuestionCount + '"></label>'
      + sw('notifications', 'Toast notifications', 'Success and info popups', st.notifications)
      + sw('compact', 'Compact cards', 'Tighter spacing on small screens', st.compact)
      + '<button class="btn btn-primary" id="sSave" style="margin-top:14px">Save settings</button></div>'
      + '<div class="card"><h3>AI configuration</h3><p class="sub">Status of the AI engine. The key stays on the server.</p>'
      + '<div class="alert ' + (S.aiMode === 'openai' ? 'alert-ok' : '') + '">Engine: <b>' + (S.aiMode === 'openai' ? 'OpenAI ' + esc(S.aiModel) : 'Built-in Smart Generator') + '</b><br><small>' + (S.aiMode === 'openai' ? 'Set OPENAI_API_KEY is configured. Questions and analysis use OpenAI.' : 'No OPENAI_API_KEY detected — the app uses its built-in adaptive generator. Add a key in .env to enable OpenAI.') + '</small></div>'
      + '<label class="field"><span>Preferred OpenAI model</span><input id="sModel" value="' + esc(st.aiModel || 'gpt-4o-mini') + '"></label>'
      + '<button class="btn btn-ghost" id="sModelSave">Save AI preference</button></div></div>';
    document.documentElement.style.setProperty('--accent', st.accent === 'purple' ? '#7c3aed' : st.accent === 'cyan' ? '#06b6d4' : '#3b6ef6');
    applyTheme(st.theme || 'light');
    const setT = async (t) => { applyTheme(t); S.settings = (await api('/api/settings', { method: 'PUT', body: JSON.stringify({ theme: t }) })).settings; toast(t === 'dark' ? '🌙 Night mode on — still fully readable.' : '☀️ Light mode on.'); };
    $('#tLight').onclick = () => setT('light');
    $('#tDark').onclick = () => setT('dark');
    $('#sSave').onclick = async (e) => {
      const btn = e.currentTarget; btnLoading(btn, true, 'Saving…');
      try {
        const patch = { accent: $('#sAccent').value, itemsPerPage: parseInt($('#sPer').value), defaultQuestionCount: parseInt($('#sDef').value) };
        $$('#view [data-k]').forEach(t => patch[t.dataset.k] = t.checked);
        patch.aiModel = $('#sModel').value;
        S.settings = (await api('/api/settings', { method: 'PUT', body: JSON.stringify(patch) })).settings;
        toast('Settings saved.'); btnLoading(btn, false); pSettings();
      } catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
    };
    $('#sModelSave').onclick = async (e) => {
      const btn = e.currentTarget; btnLoading(btn, true, 'Saving…');
      try { S.settings = (await api('/api/settings', { method: 'PUT', body: JSON.stringify({ aiModel: $('#sModel').value }) })).settings; toast('AI preference saved.'); btnLoading(btn, false); }
      catch (err) { btnLoading(btn, false); toast(err.message, 'error'); }
    };
  } catch (e) { view().innerHTML = '<div class="alert alert-error">' + esc(e.message) + '</div>'; }
}
