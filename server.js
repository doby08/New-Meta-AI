/* AI Assistance Interview System — Express server */
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const db = require('./db');
const ai = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(session({
  name: 'aais.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const me = (req) => req.session && req.session.userId ? db.getUserById(req.session.userId) : null;
const requireAuth = (req, res, next) => {
  const u = me(req);
  if (!u) return res.status(401).json({ ok: false, error: 'Not authenticated. Please log in.' });
  req.user = u; next();
};
const requireAdmin = (req, res, next) => {
  const u = me(req);
  if (!u) return res.status(401).json({ ok: false, error: 'Not authenticated. Please log in.' });
  if (u.role !== 'Administrator') return res.status(403).json({ ok: false, error: 'Administrator access required.' });
  req.user = u; next();
};
const clean = (v, n = 2000) => String(v === undefined || v === null ? '' : v).slice(0, n);
const isDataUrl = (v) => /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(String(v || ''));
/* administrator scope: ?scope=all lets the admin see & manage every account's interviews */
const scopeUid = (req) => (req.user.role === 'Administrator' && String(req.query.scope || '') === 'all') ? null : req.user.id;
const mkUsername = (email) => {
  let base = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24) || 'user';
  let un = base, n = 2;
  while (db.findUserByLogin(un)) un = base + n++;
  return un;
};

/* ---- auth ---- */
app.post('/api/login', async (req, res) => {
  try {
    await new Promise(r => setTimeout(r, 500)); // visible loading state
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'Please enter both username and password.' });
    const user = db.findUserByLogin(clean(username, 200));
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash)))
      return res.status(401).json({ ok: false, error: 'Invalid username or password.' });
    req.session.userId = user.id;
    res.json({ ok: true, user: db.safeUser(user) });
  } catch { res.status(500).json({ ok: false, error: 'Login failed. Please try again.' }); }
});
app.post('/api/register', async (req, res) => {
  try {
    await new Promise(r => setTimeout(r, 650)); // visible "creating account" state
    const { name, email, password } = req.body || {};
    const nm = clean(name, 120).trim(), em = String(clean(email, 200)).trim().toLowerCase();
    if (!nm) return res.status(400).json({ ok: false, error: 'Please enter your full name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    if (!String(password || '').length) return res.status(400).json({ ok: false, error: 'Please choose a password.' });
    if (String(password).length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters long.' });
    if (db.findUserByLogin(em)) return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
    const username = mkUsername(em);
    const user = db.createUser({ username, displayName: nm, email: em, passwordHash: await bcrypt.hash(String(password), 10) });
    res.json({ ok: true, user: db.safeUser(user) });
  } catch (e) { res.status(500).json({ ok: false, error: 'Unable to create your account. Please try again.' }); }
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => { const u = me(req); res.json({ ok: true, user: u ? db.safeUser(u) : null, aiMode: ai.hasOpenAI() ? 'openai' : 'local-smart', aiModel: ai.MODEL }); });

/* ---- site branding (public read, admin write) ---- */
app.get('/api/site', (req, res) => res.json({ ok: true, site: db.getSite() }));
app.put('/api/site', requireAdmin, (req, res) => {
  try {
    const patch = {};
    if (req.body.logo !== undefined) {
      const lg = clean(req.body.logo, 200000);
      if (lg && !isDataUrl(lg)) return res.status(400).json({ ok: false, error: 'Invalid image format for the logo.' });
      patch.logo = lg || null;
    }
    res.json({ ok: true, site: db.saveSite(patch) });
  } catch { res.status(500).json({ ok: false, error: 'Unable to save the logo. Please try again.' }); }
});

/* ---- admin: user management ---- */
app.get('/api/admin/users', requireAdmin, (req, res) => res.json({ ok: true, users: db.listUsers() }));
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const u = db.getUserById(req.params.id);
    if (!u) return res.status(404).json({ ok: false, error: 'Account not found.' });
    const patch = {};
    if (req.body.displayName !== undefined) patch.displayName = clean(req.body.displayName, 120).trim() || u.username;
    if (req.body.email !== undefined) {
      const em = String(clean(req.body.email, 200)).trim().toLowerCase();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return res.status(400).json({ ok: false, error: 'Invalid email address.' });
      if (em && em !== u.email && db.findUserByLogin(em)) return res.status(409).json({ ok: false, error: 'Another account already uses this email.' });
      patch.email = em;
    }
    if (req.body.role !== undefined) {
      if (!['User', 'Administrator'].includes(req.body.role)) return res.status(400).json({ ok: false, error: 'Invalid role.' });
      if (u.role === 'Administrator' && req.body.role !== 'Administrator' && db.listUsers().filter(x => x.role === 'Administrator').length <= 1)
        return res.status(400).json({ ok: false, error: 'Cannot demote the only administrator.' });
      patch.role = req.body.role;
    }
    if (req.body.newPassword) {
      if (String(req.body.newPassword).length < 6) return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters.' });
      patch.passwordHash = await bcrypt.hash(String(req.body.newPassword), 10);
    }
    res.json({ ok: true, user: db.safeUser(db.updateUser(u.id, patch)) });
  } catch { res.status(500).json({ ok: false, error: 'Unable to update the account. Please try again.' }); }
});
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const target = db.getUserById(req.params.id);
  if (!target) return res.status(404).json({ ok: false, error: 'Account not found.' });
  if (req.params.id === req.user.id) return res.status(400).json({ ok: false, error: 'You cannot delete your own account.' });
  if (target.role === 'Administrator' && db.listUsers().filter(x => x.role === 'Administrator').length <= 1)
    return res.status(400).json({ ok: false, error: 'Cannot delete the only administrator account.' });
  db.deleteUser(target.id);
  res.json({ ok: true });
});

/* ---- dashboard ---- */
app.get('/api/stats', requireAuth, (req, res) => res.json({ ok: true, ...db.stats(scopeUid(req)) }));
app.get('/api/recent', requireAuth, (req, res) => res.json({ ok: true, interviews: db.listInterviews(req.user.id).map(db.withCounts).slice(0, 6) }));

/* ---- interviews CRUD ---- */
app.get('/api/interviews', requireAuth, (req, res) => {
  const { search = '', status = '' } = req.query;
  const s = search.toLowerCase();
  const rows = db.listInterviews(scopeUid(req)).map(db.withCounts)
    .filter(i => (!status || i.status === status) && (!s || (i.title + ' ' + i.stakeholders + ' ' + (i.description || '')).toLowerCase().includes(s)));
  res.json({ ok: true, interviews: rows });
});
app.post('/api/interviews', requireAuth, (req, res) => {
  const { title, stakeholders } = req.body || {};
  if (!clean(title, 300).trim()) return res.status(400).json({ ok: false, error: 'Please complete all required fields: interview title is required.' });
  if (!clean(stakeholders, 1000).trim()) return res.status(400).json({ ok: false, error: 'Please complete all required fields: stakeholders are required.' });
  res.json({ ok: true, interview: db.createInterview(req.user.id, { title: clean(title, 300).trim(), description: clean(req.body.description, 4000), stakeholders: clean(stakeholders, 1000).trim(), interviewee: clean(req.body.interviewee, 300), date: clean(req.body.date, 20) || new Date().toISOString().slice(0, 10), type: clean(req.body.type, 100) || 'General', interviewMethod: clean(req.body.interviewMethod, 50) || 'Semi-Structured', interviewFormat: clean(req.body.interviewFormat, 50) || 'Individual Interview' }) });
});
app.get('/api/interviews/:id', requireAuth, (req, res) => {
  const iv = db.getInterview(scopeUid(req), req.params.id);
  if (!iv) return res.status(404).json({ ok: false, error: 'Interview not found.' });
  res.json({ ok: true, interview: db.withCounts(iv), suggestion: db.getSuggestion(scopeUid(req), iv.id) });
});
app.put('/api/interviews/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.title !== undefined) patch.title = clean(b.title, 300);
  if (b.description !== undefined) patch.description = clean(b.description, 4000);
  if (b.stakeholders !== undefined) patch.stakeholders = clean(b.stakeholders, 1000);
  if (b.interviewee !== undefined) patch.interviewee = clean(b.interviewee, 300);
  if (b.date !== undefined) patch.date = clean(b.date, 20);
  if (b.type !== undefined) patch.type = clean(b.type, 100);
  if (b.interviewMethod !== undefined) patch.interviewMethod = clean(b.interviewMethod, 50);
  if (b.interviewFormat !== undefined) patch.interviewFormat = clean(b.interviewFormat, 50);
  if (b.status !== undefined && ['draft', 'in-progress', 'completed'].includes(b.status)) patch.status = b.status;
  if (patch.title !== undefined && !patch.title.trim()) return res.status(400).json({ ok: false, error: 'Interview title cannot be empty.' });
  const iv = db.updateInterview(req.user.id, req.params.id, patch);
  if (!iv) return res.status(404).json({ ok: false, error: 'Interview not found.' });
  res.json({ ok: true, interview: iv });
});
app.delete('/api/interviews/:id', requireAuth, (req, res) => {
  if (!db.deleteInterview(scopeUid(req), req.params.id)) return res.status(404).json({ ok: false, error: 'Interview not found.' });
  res.json({ ok: true });
});

/* ---- questions & answers ---- */
app.post('/api/interviews/:id/generate', requireAuth, async (req, res) => {
  try {
    const iv = db.getInterview(req.user.id, req.params.id);
    if (!iv) return res.status(404).json({ ok: false, error: 'Interview not found.' });
    const count = Math.max(1, Math.min(50, parseInt(req.body && req.body.count) || 20));
    const out = await ai.generateQuestions(iv.title, iv.stakeholders, count);
    const rows = db.addQuestions(req.user.id, iv.id, out.questions);
    res.json({ ok: true, questions: rows, source: out.source });
  } catch (e) {
    if (e && e.code === 'VALIDATION') return res.status(400).json({ ok: false, error: 'Please complete all required fields (title and stakeholders).' });
    res.status(502).json({ ok: false, error: 'AI service is unavailable right now. Please try again. (' + String((e && e.message) || e).slice(0, 160) + ')' });
  }
});
app.get('/api/interviews/:id/questions', requireAuth, (req, res) => {
  const rows = db.listQuestions(scopeUid(req), req.params.id);
  if (!rows) return res.status(404).json({ ok: false, error: 'Interview not found.' });
  res.json({ ok: true, questions: rows });
});
app.put('/api/questions/:qid', requireAuth, (req, res) => {
  const b = req.body || {}; const patch = {};
  if (b.text !== undefined) patch.text = clean(b.text, 2000);
  if (b.stakeholder !== undefined) patch.stakeholder = clean(b.stakeholder, 200);
  if (b.category !== undefined) patch.category = clean(b.category, 200);
  const q = db.updateQuestion(req.user.id, req.params.qid, patch);
  if (!q) return res.status(404).json({ ok: false, error: 'Question not found.' });
  res.json({ ok: true, question: q });
});
app.delete('/api/questions/:qid', requireAuth, (req, res) => {
  if (!db.deleteQuestion(req.user.id, req.params.qid)) return res.status(404).json({ ok: false, error: 'Question not found.' });
  res.json({ ok: true });
});
app.post('/api/questions/:qid/answer', requireAuth, (req, res) => {
  const r = db.saveAnswer(req.user.id, req.params.qid, clean((req.body || {}).answer, 8000));
  if (!r) return res.status(404).json({ ok: false, error: 'Unable to save your changes. Please try again.' });
  res.json({ ok: true, ...r });
});

/* ---- AI analysis / questions bank / profile / settings ---- */
app.post('/api/interviews/:id/analyze', requireAuth, async (req, res) => {
  try {
    const uidv = scopeUid(req);
    const iv = db.getInterview(uidv, req.params.id);
    if (!iv) return res.status(404).json({ ok: false, error: 'Interview not found.' });
    const qa = db.listQuestions(uidv, iv.id);
    if (!qa || !qa.length) return res.status(400).json({ ok: false, error: 'Generate questions and collect answers first.' });
    const out = await ai.analyzeInterview(db.withCounts(iv), qa);
    const saved = db.saveSuggestion(uidv, iv.id, out.analysis, out.source);
    res.json({ ok: true, suggestion: saved, source: out.source });
  } catch (e) {
    if (e && e.code === 'NO_ANSWERS') return res.status(400).json({ ok: false, error: 'No answers yet — save at least one answer before generating suggestions.' });
    res.status(502).json({ ok: false, error: 'AI service is unavailable right now. Please try again. (' + String((e && e.message) || e).slice(0, 160) + ')' });
  }
});
app.get('/api/interviews/:id/suggestion', requireAuth, (req, res) => {
  const s = db.getSuggestion(scopeUid(req), req.params.id);
  if (s === undefined) return res.status(404).json({ ok: false, error: 'Interview not found.' });
  res.json({ ok: true, suggestion: s });
});
app.get('/api/bank', requireAuth, (req, res) => {
  res.json({ ok: true, questions: db.bankQuestions(req.user.id, req.query), interviews: db.listInterviews(req.user.id).map(i => ({ id: i.id, title: i.title })) });
});
app.get('/api/profile', requireAuth, (req, res) => res.json({ ok: true, user: db.safeUser(req.user) }));
app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const u = db.getUserById(req.user.id);
    const { displayName, email, currentPassword, newPassword, avatar } = req.body || {};
    if (displayName !== undefined) u.displayName = clean(displayName, 120) || u.username;
    if (email !== undefined) u.email = clean(email, 200);
    if (avatar !== undefined) {
      const av = clean(avatar, 200000);
      if (av && !isDataUrl(av)) return res.status(400).json({ ok: false, error: 'Invalid image format for the profile picture.' });
      u.avatar = av || null;
    }
    if (newPassword) {
      if (!currentPassword || !(await bcrypt.compare(String(currentPassword), u.passwordHash))) return res.status(400).json({ ok: false, error: 'Current password is incorrect.' });
      if (String(newPassword).length < 6) return res.status(400).json({ ok: false, error: 'New password must be at least 6 characters.' });
      u.passwordHash = await bcrypt.hash(String(newPassword), 10);
    }
    u.updatedAt = new Date().toISOString(); db.persist();
    res.json({ ok: true, user: db.safeUser(u) });
  } catch { res.status(500).json({ ok: false, error: 'Unable to save your changes. Please try again.' }); }
});
app.get('/api/settings', requireAuth, (req, res) => res.json({ ok: true, settings: db.getSettings(req.user.id) }));
app.put('/api/settings', requireAuth, (req, res) => {
  const b = req.body || {}; const patch = {};
  if (b.accent !== undefined) patch.accent = ['blue', 'purple', 'cyan'].includes(b.accent) ? b.accent : 'blue';
  if (b.theme !== undefined) patch.theme = ['light', 'dark'].includes(b.theme) ? b.theme : 'light';
  if (b.itemsPerPage !== undefined) patch.itemsPerPage = Math.max(4, Math.min(24, parseInt(b.itemsPerPage) || 8));
  if (b.defaultQuestionCount !== undefined) patch.defaultQuestionCount = Math.max(5, Math.min(50, parseInt(b.defaultQuestionCount) || 20));
  if (b.aiModel !== undefined) patch.aiModel = clean(b.aiModel, 60);
  if (b.notifications !== undefined) patch.notifications = Boolean(b.notifications);
  if (b.compact !== undefined) patch.compact = Boolean(b.compact);
  res.json({ ok: true, settings: db.saveSettings(req.user.id, patch) });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

db.initDb().then(() => app.listen(PORT, () => console.log(`AI Assistance Interview System running: http://localhost:${PORT}`)));
