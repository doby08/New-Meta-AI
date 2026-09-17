/* STEPS 1-3: Field survey — language toggle, topic auto-load, AI questions,
   Dexie offline save + auto-sync. Role selection removed — direct to topic + question count. */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { lang: 'Tagalog', role: '', category: '', surveyTitle: '', workerRole: '', locked: false, topic: null, questions: [], engine: '', qCount: 3 };
const T = {
  Tagalog: { sub: 'Piliin ang wika, paksa, at ilang tanong.', subLocked: 'Naka-lock ang detalye mula sa QR — piliin lang ang wika at simulan.', role: 'Ano ang iyong Stakeholder Category?', topic: 'Paksa / Topic', start: '▶ Simulan ang Interview', ansPh: 'Isulat po ang inyong sagot dito…', submit: '✅ Isumite ang mga Sagot', saving: 'Sine-save…', kTitle: 'Pamagat', kCat: 'Kategorya', kRole: 'Role', qrHint: '🔒 Naka-lock mula sa QR code. Ang Language Toggle lang ang puwedeng baguhin.' },
  English: { sub: 'Choose your language, topic, and how many questions.', subLocked: 'Details are locked from the QR — just pick a language and start.', role: 'What is your Stakeholder Category?', topic: 'Topic', start: '▶ Start Interview', ansPh: 'Type your answer here…', submit: '✅ Submit Answers', saving: 'Saving…', kTitle: 'Title', kCat: 'Category', kRole: 'Role', qrHint: '🔒 Locked from the QR code. Only the Language Toggle can be changed.' }
};
async function api(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || ('HTTP ' + r.status));
  return j;
}
function applyLang() {
  const t = T[S.lang];
  $('#tSub').textContent = S.locked ? t.subLocked : t.sub;
  $('#tTopic').textContent = t.topic;
  $('#tQrHint').textContent = S.locked ? t.qrHint : (S.lang === 'Tagalog' ? 'Na-scan ang QR? Awtomatikong napili ang inyong kategorya. Maaari pa rin itong palitan.' : 'Scanned a QR? Your category is auto-selected but can still be changed.');
  const bl = document.querySelector('#startBtn .btn-label'); if (bl) bl.textContent = S.locked ? (S.lang === 'Tagalog' ? '▶ Simulan ang Interview' : '▶ Start Interview') : t.start;
  $('#langTl').classList.toggle('on', S.lang === 'Tagalog');
  $('#langEn').classList.toggle('on', S.lang === 'English');
  renderQrBadges();
}
/* Parse ?title=&category=&role= (new) with ?role= legacy fallback. Malformed → safe defaults. */
function parseQrParams() {
  const qp = (k) => { try { const v = new URLSearchParams(location.search).get(k); return (v === null ? '' : String(v)).trim().slice(0, 200); } catch { return ''; } };
  const title = qp('title');
  const category = qp('category') || qp('role'); // legacy: ?role=Farmer meant category
  const workerRole = qp('role') && qp('category') ? qp('role') : (qp('category') ? '' : qp('role'));
  // New-style QR carries title+category+workerRole. Legacy ?role=X stays editable.
  if (title && category && workerRole) {
    S.locked = true; S.surveyTitle = title; S.category = category; S.workerRole = workerRole; S.role = category;
    S.topic = { id: null, topic: title, description: '' };
  } else if (category && !title && !qp('category')) {
    S.locked = false; S.role = category; // legacy single-param preselect
  } else if (title || category || workerRole) {
    // Partial/malformed new-style QR → lock what we have, default the rest.
    S.locked = true;
    S.surveyTitle = title || 'General Survey';
    S.category = category || 'General'; S.role = S.category;
    S.workerRole = workerRole || 'Respondent';
    S.topic = { id: null, topic: S.surveyTitle, description: '' };
  }
  if (qp('lang') === 'English' || qp('lang') === 'Tagalog') S.lang = qp('lang');
}
function renderQrBadges() {
  const box = $('#qrCtx'); if (!box) return;
  if (!S.locked) { box.classList.add('hidden'); box.innerHTML = ''; const m = $('#manualCtx'); if (m) m.classList.remove('hidden'); return; }
  const t = T[S.lang];
  box.classList.remove('hidden');
  box.innerHTML = '<div class="qr-badge"><span class="k">' + esc(t.kTitle) + '</span><span class="v">' + esc(S.surveyTitle) + '</span><span class="lock">🔒</span></div>'
    + '<div class="qr-badge"><span class="k">' + esc(t.kCat) + '</span><span class="v">' + esc(S.category) + '</span><span class="lock">🔒</span></div>'
    + '<div class="qr-badge"><span class="k">' + esc(t.kRole) + '</span><span class="v">' + esc(S.workerRole) + '</span><span class="lock">🔒</span></div>';
  const m = $('#manualCtx'); if (m) m.classList.add('hidden');
}
async function loadTopics() {
  let topics = [];
  try {
    topics = (await api('/api/survey/topics?stakeholder=' + encodeURIComponent(S.role || '') + '&language=' + S.lang)).topics || [];
    try { if (topics.length) await localDb.topicsCache.bulkPut(topics.map(t => ({ ...t }))); } catch {}
  } catch {
    try { const c = await localDb.topicsCache.toArray(); topics = c.filter(t => (!S.role || t.stakeholder === S.role) && t.language === S.lang); } catch {}
  }
  // If a role-specific search yields nothing, fall back to ALL topics in this language.
  if (!topics.length && S.role) {
    try { topics = (await api('/api/survey/topics?language=' + S.lang)).topics || []; } catch {}
  }
  if (!topics.length) topics = [{ id: null, topic: S.lang === 'Tagalog' ? 'Pangkalahatang Survey' : 'General Survey', description: '' }];
  S.topic = topics[0];
  $('#topicSel').innerHTML = topics.map((t, i) => '<option value="' + i + '">' + esc(t.topic) + '</option>').join('');
  $('#topicSel').onchange = (e) => { S.topic = topics[+e.target.value]; };
}
async function startInterview() {
  const btn = $('#startBtn'); btn.disabled = true;
  const bl = btn.querySelector('.btn-label');
  if (bl) bl.textContent = S.lang === 'Tagalog' ? '⏳ Gumagawa ng tanong…' : '⏳ Generating questions…';
  try {
    if (!S.topic) throw new Error(S.lang === 'Tagalog' ? 'Sandali lang po, naglo-load pa ang paksa…' : 'Please wait, topics are still loading…');
    let count = parseInt($('#qCount').value, 10);
    if (!count || count < 1) count = 3;
    if (count > 10) count = 10;
    S.qCount = count;
    let qs = [];
    try {
      const j = await api('/api/ai/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stakeholder: S.role, language: S.lang, topic: S.topic.topic, count: S.qCount }) });
      qs = j.questions; S.engine = j.source;
      try { await localDb.questionsCache.put({ key: S.role + '|' + S.lang + '|' + S.topic.topic + '|' + S.qCount, questions: qs, updatedAt: new Date().toISOString() }); } catch {}
    } catch {
      const c = await localDb.questionsCache.get(S.role + '|' + S.lang + '|' + S.topic.topic + '|' + S.qCount).catch(() => null);
      if (c && c.questions) { qs = c.questions; S.engine = 'offline-cache'; }
      else {
        // Fallback: generate if count not cached
        try {
          const j2 = await api('/api/ai/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stakeholder: S.role, language: S.lang, topic: S.topic.topic, count: S.qCount }) });
          qs = j2.questions; S.engine = j2.source;
        } catch { throw new Error(S.lang === 'Tagalog' ? 'Walang internet at walang naka-cache na tanong. Buksan muna ito nang online bago pumunta sa field.' : 'No internet and no cached questions. Open this page online once before field work.'); }
      }
    }
    S.questions = qs;
    const t = T[S.lang];
    $('#qWrap').innerHTML = '<div class="card"><div class="card-head"><div><h2>' + esc(S.topic.topic) + '</h2><p class="muted">' + esc(S.role) + ' · ' + esc(S.lang) + ' · ' + S.qCount + ' tanong</p></div></div>'
      + qs.map((q, i) => '<div class="q-card"><b>' + (i + 1) + '. ' + esc(q.question) + '</b><textarea data-i="' + i + '" placeholder="' + esc(t.ansPh) + '"></textarea></div>').join('')
      + '<button class="btn btn-primary btn-block" id="submitBtn">' + esc(t.submit) + '</button></div>';
    $('#submitBtn').onclick = submitAnswers;
    $('#qWrap').scrollIntoView({ behavior: 'smooth' });
  } catch (err) { alert(err.message); }
  btn.disabled = false; applyLang(); // label only — do NOT reload topics (preserves in-progress Q&A)
}
async function submitAnswers() {
  const t = T[S.lang];
  const answers = Array.from(document.querySelectorAll('#qWrap textarea'))
    .map((ta, i) => ({ question: S.questions[i].question, answer: ta.value.trim() }))
    .filter(a => a.answer);
  if (!answers.length) { alert(S.lang === 'Tagalog' ? 'Pakilagyan po ng kahit isang sagot.' : 'Please answer at least one question.'); return; }
  const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = t.saving;
  const payload = { stakeholder: S.role, language: S.lang, topic: S.topic.topic, topicId: S.topic.id, answers, clientId: 'c_' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36), createdAt: new Date().toISOString() };
  // STEP 3: save locally FIRST (offline-ready), then try to push.
  const local = await SyncManager.saveLocal(payload);
  let report = null;
  if (navigator.onLine) {
    try {
      const j = await api('/api/survey/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      report = j.report;
      try { await localDb.outbox.update(local.localId, { synced: 1, syncedAt: new Date().toISOString() }); } catch {}
      await SyncManager.refreshBadge();
    } catch { await SyncManager.trySync(); }
  }
  if (report) showReport(report);
  else $('#resultWrap').innerHTML = '<div class="card"><div class="alert alert-ok">' + esc(S.lang === 'Tagalog' ? '📴 Walang internet — na-save sa device. Awtomatikong ise-sync kapag online.' : '📴 No internet — saved on device. Will auto-sync when online.') + '</div><p class="muted"><a href="/public/dashboard">📊 ' + esc(S.lang === 'Tagalog' ? 'Tingnan ang dashboard →' : 'View dashboard →') + '</a></p></div>';
  btn.disabled = false; btn.textContent = t.submit;
  $('#resultWrap').scrollIntoView({ behavior: 'smooth' });
}
function scoreColor(s) { return s >= 5 ? '#059669' : s === 4 ? '#16a34a' : s === 3 ? '#d97706' : s === 2 ? '#ea580c' : '#dc2626'; }
function showReport(r) {
  const tl = S.lang === 'Tagalog';
  $('#resultWrap').innerHTML = '<div class="card"><div class="alert alert-ok">' + esc(tl ? '✅ Na-save at na-evaluate na!' : '✅ Saved and evaluated!') + '</div>'
    + '<div class="score-hero" style="background:linear-gradient(135deg,' + scoreColor(r.score) + ',' + scoreColor(r.score) + 'cc)"><div class="n">' + r.score + ' / 5</div><b>' + esc(r.level) + '</b><div>' + esc(r.meaning || '') + '</div></div>'
    + (r.summary ? '<p>' + esc(r.summary) + '</p>' : '')
    + (r.recommendations && r.recommendations.length ? '<h3>💡 ' + esc(tl ? 'Rekomendasyon' : 'Recommendations') + '</h3><ul>' + r.recommendations.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '')
    + '<p><a href="/public/dashboard">📊 ' + esc(tl ? 'Tingnan ang Public Dashboard →' : 'View Public Dashboard →') + '</a></p></div>';
}
document.addEventListener('DOMContentLoaded', () => {
  parseQrParams();                       // NEW: auto-detect ?title=&category=&role=&lang=
  $('#langTl').onclick = () => { S.lang = 'Tagalog'; applyLangAndReload(); };
  $('#langEn').onclick = () => { S.lang = 'English'; applyLangAndReload(); };
  $('#startBtn').onclick = startInterview;
  $('#qCount').oninput = () => {
    const v = parseInt($('#qCount').value, 10);
    if (v >= 1 && v <= 10) S.qCount = v;
  };
  applyLang();
  loadTopics();
  // Init default qCount
  const qc = $('#qCount'); if (qc) S.qCount = parseInt(qc.value, 10) || 3;
});
/* Persist the chosen language in the URL so the next reload keeps it (incl. after Start). */
function applyLangAndReload() {
  const q = new URLSearchParams(location.search);
  q.set('lang', S.lang);
  history.replaceState(null, '', '?' + q.toString());
  applyLang();
  loadTopics();
}

