/* Persistent JSON database (file-backed, survives restarts).
   Tables: users, interviews, questions, suggestions, settings,
           site, stakeholder_topics, survey_responses, ai_reports, sync_queue,
           question_bank, interview_sessions, sentiment_cache */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
let DB = null;

const emptyDb = () => ({
  users: [], interviews: [], questions: [], suggestions: [], settings: {}, site: {},
  stakeholder_topics: [], survey_responses: [], ai_reports: [], sync_queue: [],
  question_bank: [], interview_sessions: [], sentiment_cache: [], seq: 1,
  // QR Survey System (STEP 1: offline-first survey + interview system)
  qr_surveys: [],
  qr_survey_questions: [],
  qr_code_settings: { scale: [1, 2, 3, 4, 5], interpretations: { 5: 'Very High', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Very Low' } }
});
const now = () => new Date().toISOString();
const dayOf = (iso) => String(iso || '').slice(0, 10);
const defaultSettings = () => ({ accent: 'blue', theme: 'light', itemsPerPage: 8, defaultQuestionCount: 20, aiModel: 'gpt-4o-mini', notifications: true, compact: false });

function persist() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(DB, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function uid(p) { return p + '_' + (DB.seq++) + '_' + Date.now().toString(36); }
function daysAgo(n, h = 9) { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 12, 0, 0); return d.toISOString(); }

async function initDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    DB = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : emptyDb();
    for (const k of Object.keys(emptyDb())) if (!(k in DB)) DB[k] = emptyDb()[k];
  } catch { DB = emptyDb(); }
  let admin = DB.users.find(u => u.username.toLowerCase() === 'dan');
  if (!admin) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || '10231998', 10);
    admin = { id: uid('u'), username: 'Dan', passwordHash: hash, role: 'Administrator', displayName: 'Dan', email: '', createdAt: now(), updatedAt: now() };
    DB.users.push(admin);
  }
  if (!DB.settings[admin.id]) DB.settings[admin.id] = defaultSettings();
  seedSample(admin.id);
  seedTopics();
  persist();
  return admin;
}
function seedSample(userId) {
  if (DB.interviews.length > 0) return;
  const mk = (title, stakeholders, n, status) => {
    const iv = { id: uid('i'), userId, title, description: 'Sample record — safe to delete.', stakeholders, interviewee: stakeholders.split(',')[0].trim(), date: dayOf(daysAgo(n)), type: 'Requirements Gathering', status, createdAt: daysAgo(n), updatedAt: daysAgo(Math.max(0, n - 1)) };
    DB.interviews.push(iv); return iv;
  };
  const a = mk('[Sample] Web-Based Enrollment System', 'Students, Registrar, Teachers', 6, 'completed');
  const b = mk('[Sample] Hospital Management System', 'Doctors, Nurses, Patients', 3, 'in-progress');
  mk('[Sample] Library Catalog Portal', 'Librarians, Students', 1, 'draft');
  const qs = [
    ['Students', 'Process', 'How do you currently enroll in subjects each term, and which steps take the most time?'],
    ['Students', 'Pain Points', 'What problems have you experienced with enrollment queues, schedules, or requirements?'],
    ['Registrar', 'Workflow', 'Walk me through how the registrar validates student records and approves enrollment.'],
    ['Registrar', 'Data', 'Which student records are hardest to keep accurate, and why?'],
    ['Teachers', 'Requirements', 'What class information (loads, schedules, rosters) must the system show teachers?'],
    ['Teachers', 'Reporting', 'Which reports do teachers need most after enrollment closes?'],
    ['Students', 'Experience', 'How should the system notify you about approval status or lacking requirements?'],
    ['Registrar', 'Improvement', 'If one enrollment step could be automated, which should it be and why?']
  ];
  const ans = [
    'We line up at dawn; encoding subjects takes hours and prospectus checking is manual.',
    'Long queues, lost evaluation forms, and unclear prerequisites every semester.',
    'We check grades and clearances folder by folder, then sign the study load manually.',
    'Transfer credentials and shifting grades — papers arrive late and get misfiled.',
    'Teachers need teaching loads, room assignments, and official class lists per section.',
    'Master lists per subject and overload reports for the dean.',
    'SMS and email alerts would help, plus a tracker showing pending vs approved.',
    'Automatic prerequisite checking against grades would remove most bottlenecks.'
  ];
  qs.forEach((q, i) => DB.questions.push({ id: uid('q'), interviewId: a.id, number: i + 1, text: q[2], stakeholder: q[0], category: q[1], answer: ans[i], answeredAt: daysAgo(5), createdAt: daysAgo(6), updatedAt: daysAgo(5) }));
  const bq = ['How are patient admissions and triage currently recorded on your shift?', 'What delays happen most during endorsement between nurses and doctors?', 'Which patient information is hardest to retrieve during emergencies?'];
  bq.forEach((t, i) => DB.questions.push({ id: uid('q'), interviewId: b.id, number: i + 1, text: t, stakeholder: ['Nurses', 'Nurses', 'Doctors'][i], category: 'Process', answer: '', answeredAt: null, createdAt: daysAgo(3), updatedAt: daysAgo(3) }));
}

const findUserByName = (u) => DB.users.find(x => x.username.toLowerCase() === String(u || '').toLowerCase());
const findUserByLogin = (u) => {
  const s = String(u || '').toLowerCase();
  return DB.users.find(x => x.username.toLowerCase() === s || String(x.email || '').toLowerCase() === s);
};
const getUserById = (id) => DB.users.find(x => x.id === id);
function safeUser(u) { return u ? { id: u.id, username: u.username, role: u.role, displayName: u.displayName || u.username, email: u.email || '', avatar: u.avatar || null, createdAt: u.createdAt } : null; }
function createUser({ username, displayName, email, passwordHash }) {
  const u = { id: uid('u'), username, passwordHash, role: 'User', displayName: displayName || username, email: email || '', avatar: null, createdAt: now(), updatedAt: now() };
  DB.users.push(u); persist(); return u;
}
const listUsers = () => DB.users.map(safeUser);
function updateUser(id, patch) {
  const u = getUserById(id); if (!u) return null;
  for (const k of ['displayName', 'email', 'role', 'avatar', 'passwordHash']) if (patch[k] !== undefined) u[k] = patch[k];
  u.updatedAt = now(); persist(); return u;
}
function deleteUser(id) {
  const ix = DB.users.findIndex(x => x.id === id); if (ix < 0) return false;
  DB.users.splice(ix, 1);
  const ivIds = new Set(DB.interviews.filter(i => i.userId === id).map(i => i.id));
  DB.interviews = DB.interviews.filter(i => i.userId !== id);
  DB.questions = DB.questions.filter(q => !ivIds.has(q.interviewId));
  DB.suggestions = DB.suggestions.filter(s => !ivIds.has(s.interviewId));
  delete DB.settings[id];
  persist(); return true;
}
const getSite = () => { if (!DB.site) DB.site = {}; return { logo: DB.site.logo || null }; };
function saveSite(patch) { DB.site = { ...DB.site, ...patch }; persist(); return getSite(); }
const getSettings = (uidv) => { if (!DB.settings[uidv]) { DB.settings[uidv] = defaultSettings(); persist(); } return DB.settings[uidv]; };
function saveSettings(uidv, patch) { DB.settings[uidv] = { ...getSettings(uidv), ...patch }; persist(); return DB.settings[uidv]; }
const listInterviews = (userId) => (userId ? DB.interviews.filter(i => i.userId === userId) : DB.interviews.slice()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const getInterview = (userId, id) => DB.interviews.find(i => i.id === id && (!userId || i.userId === userId)) || null;
function withCounts(iv) {
  const qs = DB.questions.filter(q => q.interviewId === iv.id);
  const owner = iv.userId ? DB.users.find(u => u.id === iv.userId) : null;
  return { ...iv, questionCount: qs.length, answerCount: qs.filter(q => q.answer && q.answer.trim()).length, ownerAvatar: owner ? (owner.avatar || null) : null, ownerName: owner ? (owner.displayName || owner.username) : null };
}
function createInterview(userId, d) {
  const stamp = now();
  const iv = { id: uid('i'), userId, title: d.title, description: d.description || '', stakeholders: d.stakeholders, interviewee: d.interviewee || '', date: d.date || dayOf(stamp), takenAt: stamp, takenTime: new Date(stamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }), completedAt: null, type: d.type || 'General', interviewMethod: d.interviewMethod || 'Semi-Structured', interviewFormat: d.interviewFormat || 'Individual Interview', language: d.language || 'English', status: 'draft', createdAt: stamp, updatedAt: stamp };
  DB.interviews.push(iv); persist(); return withCounts(iv);
}
function updateInterview(userId, id, d) {
  const iv = getInterview(userId, id); if (!iv) return null;
  for (const k of ['title', 'description', 'stakeholders', 'interviewee', 'date', 'type', 'interviewMethod', 'interviewFormat', 'language', 'status']) if (d[k] !== undefined) iv[k] = d[k];
  iv.updatedAt = now(); persist(); return withCounts(iv);
}
function deleteInterview(userId, id) {
  const ix = DB.interviews.findIndex(i => i.id === id && (!userId || i.userId === userId)); if (ix < 0) return false;
  DB.interviews.splice(ix, 1);
  DB.questions = DB.questions.filter(q => q.interviewId !== id);
  DB.suggestions = DB.suggestions.filter(s => s.interviewId !== id);
  persist(); return true;
}
const listQuestions = (userId, interviewId) => {
  if (!getInterview(userId, interviewId)) return null;
  return DB.questions.filter(q => q.interviewId === interviewId).sort((a, b) => a.number - b.number);
};
function addQuestions(userId, interviewId, items) {
  const iv = getInterview(userId, interviewId); if (!iv) return null;
  const existing = DB.questions.filter(q => q.interviewId === interviewId).length;
  const rows = items.map((q, i) => ({ id: uid('q'), interviewId, number: existing + i + 1, text: q.text, stakeholder: q.stakeholder || 'General', category: q.category || 'General', answer: '', answeredAt: null, createdAt: now(), updatedAt: now() }));
  DB.questions.push(...rows);
  if (iv.status === 'draft') iv.status = 'in-progress';
  iv.updatedAt = now(); persist(); return rows;
}
function addQuestion(userId, interviewId, item) {
  const iv = getInterview(userId, interviewId); if (!iv) return null;
  const existing = DB.questions.filter(q => q.interviewId === interviewId);
  const maxNum = existing.reduce((m, q) => Math.max(m, q.number || 0), 0);
  const row = { id: uid('q'), interviewId, number: maxNum + 1, text: item.text, stakeholder: item.stakeholder || (iv.stakeholders || '').split(',')[0].trim() || 'General', category: item.category || 'Follow-up', answer: '', answeredAt: null, isFollowUp: item.isFollowUp ? 1 : 0, parentNumber: item.parentNumber || null, createdAt: now(), updatedAt: now() };
  DB.questions.push(row);
  if (iv.status === 'draft') iv.status = 'in-progress';
  iv.updatedAt = now(); persist(); return row;
}
function updateQuestion(userId, qid, patch) {
  const q = DB.questions.find(x => x.id === qid); if (!q) return null;
  if (!getInterview(userId, q.interviewId)) return null;
  for (const k of ['text', 'stakeholder', 'category']) if (patch[k] !== undefined) q[k] = patch[k];
  q.updatedAt = now(); persist(); return q;
}
function deleteQuestion(userId, qid) {
  const ix = DB.questions.findIndex(x => x.id === qid); if (ix < 0) return false;
  if (!getInterview(userId, DB.questions[ix].interviewId)) return false;
  DB.questions.splice(ix, 1); persist(); return true;
}
function saveAnswer(userId, qid, answer) {
  const q = DB.questions.find(x => x.id === qid); if (!q) return null;
  const iv = getInterview(userId, q.interviewId); if (!iv) return null;
  q.answer = String(answer || ''); q.answeredAt = q.answer.trim() ? now() : null; q.updatedAt = now();
  if (!iv.takenAt) { iv.takenAt = now(); iv.takenTime = new Date(iv.takenAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }); }
  const qs = DB.questions.filter(x => x.interviewId === iv.id);
  const anyAns = qs.some(x => x.answer && x.answer.trim());
  const allAns = qs.length > 0 && qs.every(x => x.answer && x.answer.trim());
  iv.status = allAns ? 'completed' : (anyAns ? 'in-progress' : iv.status);
  if (allAns && !iv.completedAt) iv.completedAt = now();
  if (!allAns) iv.completedAt = null;
  iv.updatedAt = now(); persist(); return { question: q, interview: withCounts(iv) };
}
const getQuestion = (qid) => DB.questions.find(x => x.id === qid) || null;
function bankQuestions(userId, o) {
  o = o || {};
  const ids = new Set(DB.interviews.filter(i => !userId || i.userId === userId).map(i => i.id));
  const titles = {}; DB.interviews.forEach(i => titles[i.id] = i.title);
  const s = String(o.search || '').toLowerCase();
  return DB.questions.filter(q => ids.has(q.interviewId)
    && (!o.interviewId || q.interviewId === o.interviewId)
    && (!o.stakeholder || q.stakeholder === o.stakeholder)
    && (!s || q.text.toLowerCase().includes(s) || String(q.answer || '').toLowerCase().includes(s)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(q => ({ ...q, interviewTitle: titles[q.interviewId] || '(deleted)' }));
}
/* ---------- STEP 1: Stakeholder Topics (QR entry + role filtering) ---------- */
const listTopics = (filter) => {
  filter = filter || {};
  return DB.stakeholder_topics.filter(t =>
    (!filter.stakeholder || t.stakeholder === filter.stakeholder) &&
    (!filter.language || t.language === filter.language) &&
    (!filter.activeOnly || t.active !== false)
  ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
const getTopic = (id) => DB.stakeholder_topics.find(t => t.id === id) || null;
function upsertTopic(item) {
  const c = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n || 500);
  if (item.id) {
    const t = getTopic(item.id); if (!t) return null;
    if (item.stakeholder !== undefined) t.stakeholder = c(item.stakeholder, 120);
    if (item.language !== undefined) t.language = ['Tagalog', 'English'].includes(item.language) ? item.language : t.language;
    if (item.topic !== undefined) t.topic = c(item.topic, 300);
    if (item.description !== undefined) t.description = c(item.description, 2000);
    if (item.active !== undefined) t.active = Boolean(item.active);
    if (item.sortOrder !== undefined) t.sortOrder = parseInt(item.sortOrder) || 0;
    t.updatedAt = now(); persist(); return t;
  }
  const t = { id: uid('tp'), stakeholder: c(item.stakeholder, 120) || 'General' };
  t.language = ['Tagalog', 'English'].includes(item.language) ? item.language : 'Tagalog';
  t.topic = c(item.topic, 300) || 'General Survey';
  t.description = c(item.description, 2000); t.active = item.active === undefined ? true : Boolean(item.active);
  t.sortOrder = parseInt(item.sortOrder) || 0; t.createdAt = now(); t.updatedAt = now();
  DB.stakeholder_topics.push(t); persist(); return t;
}
function deleteTopic(id) {
  const ix = DB.stakeholder_topics.findIndex(t => t.id === id);
  if (ix < 0) return false;
  DB.stakeholder_topics.splice(ix, 1); persist(); return true;
}
function seedTopics() {
  if (DB.stakeholder_topics.length > 0) return;
  const seed = [
    ['Farmer', 'Tagalog', 'Programang Pang-Agrikultura at Suporta sa Magsasaka', 'Survey ukol sa binhi, patubig, at ayuda.', 1],
    ['Farmer', 'English', 'Agricultural Programs and Farmer Support', 'Survey on seeds, irrigation, and subsidies.', 2],
    ['Vendor', 'Tagalog', 'Kondisyon ng Pamilihan at Puhunan ng Vendor', 'Survey ukol sa pwesto, renta, at benta.', 3],
    ['Vendor', 'English', 'Market Conditions and Vendor Capital', 'Survey on stalls, rent, and daily sales.', 4],
    ['Resident', 'Tagalog', 'Serbisyong Barangay at Kalinisan', 'Survey ukol sa basura, tubig, at serbisyo.', 5],
    ['Resident', 'English', 'Barangay Services and Sanitation', 'Survey on waste, water, and services.', 6]
  ];
  seed.forEach(s => DB.stakeholder_topics.push({ id: uid('tp'), stakeholder: s[0], language: s[1], topic: s[2], description: s[3], sortOrder: s[4], active: true, createdAt: now(), updatedAt: now() }));
}
const getSuggestion = (userId, interviewId) => {
  if (!getInterview(userId, interviewId)) return undefined;
  const rows = DB.suggestions.filter(s => s.interviewId === interviewId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows[0] || null;
};
function saveSuggestion(userId, interviewId, data, source) {
  if (!getInterview(userId, interviewId)) return null;
  const row = { id: uid('s'), interviewId, ...data, source, createdAt: now() };
  DB.suggestions.push(row); persist(); return row;
}
/* ---------- STEP 1: survey_responses (offline-first records) ---------- */
const listSurveyResponses = (f) => {
  f = f || {};
  return DB.survey_responses.filter(r =>
    (!f.stakeholder || r.stakeholder === f.stakeholder) &&
    (!f.language || r.language === f.language)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
const getSurveyResponse = (id) => DB.survey_responses.find(r => r.id === id) || null;
function saveSurveyResponse(item) {
  const c = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n || 5000);
  const row = {
    id: item.clientId || uid('sr'),
    stakeholder: c(item.stakeholder, 120) || 'General',
    topic: c(item.topic, 300) || 'General Survey', topicId: item.topicId || null,
    surveyId: item.surveyId || null,
    answers: Array.isArray(item.answers) ? item.answers.slice(0, 50).map(a => ({ question: c(a.question, 2000), answer: c(a.answer, 8000) })) : [],
    deviceLabel: c(item.deviceLabel, 200),
    syncedAt: now(), createdAt: item.createdAt || now(), updatedAt: now()
  };
  row.language = ['Tagalog', 'English'].includes(item.language) ? item.language : 'Tagalog';
  const ix = DB.survey_responses.findIndex(r => r.id === row.id);
  if (ix >= 0) DB.survey_responses[ix] = { ...DB.survey_responses[ix], ...row };
  else DB.survey_responses.push(row);
  persist(); return row;
}
/* ---------- STEP 1: ai_reports (1-5 scale) ---------- */
const SCALE_META = {
  5: { level: 'Very High', en: 'Highly positive, critical needs fully met.', tl: 'Napakapositibo — ganap na natugunan ang pangunahing pangangailangan.' },
  4: { level: 'High', en: 'Positive outcome, minor adjustments needed.', tl: 'Positibo — kaunting pag-aayos na lang ang kailangan.' },
  3: { level: 'Moderate', en: 'Neutral/average condition, standard monitoring required.', tl: 'Katamtaman — kailangan ng regular na pag-monitor.' },
  2: { level: 'Low', en: 'Requires intervention, significant friction identified.', tl: 'Mababa — kailangan ng interbensyon, may malaking balakid.' },
  1: { level: 'Very Low', en: 'Urgent action needed, severe blockers.', tl: 'Napakababa — kailangan ng agarang aksyon.' }
};
const listReports = (f) => {
  f = f || {};
  return DB.ai_reports.filter(r =>
    (!f.stakeholder || r.stakeholder === f.stakeholder) &&
    (!f.language || r.language === f.language)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};
const getReport = (id) => DB.ai_reports.find(r => r.id === id) || null;
const getReportByResponse = (rid) => DB.ai_reports.filter(r => r.responseId === rid).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
function saveReport(item) {
  const score = Math.max(1, Math.min(5, parseInt(item.score) || 3));
  const c = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n || 5000);
  const lang = ['Tagalog', 'English'].includes(item.language) ? item.language : 'Tagalog';
  const row = {
    id: uid('rp'), responseId: item.responseId || null,
    stakeholder: c(item.stakeholder, 120) || 'General', language: lang,
    topic: c(item.topic, 300) || 'General Survey', score,
    level: item.level || SCALE_META[score].level,
    summary: c(item.summary, 5000),
    meaning: c(item.meaning, 5000) || (lang === 'Tagalog' ? SCALE_META[score].tl : SCALE_META[score].en),
    recommendations: Array.isArray(item.recommendations) ? item.recommendations.map(r => c(r, 2000)).slice(0, 10) : [],
    engine: c(item.engine, 60) || 'local-smart', createdAt: now()
  };
  DB.ai_reports.push(row); persist(); return row;
}
function reportAggregates(f) {
  const rows = listReports(f);
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const bySt = {}; let sum = 0;
  rows.forEach(r => { dist[r.score] = (dist[r.score] || 0) + 1; sum += r.score; });
  rows.forEach(r => {
    const k = r.stakeholder || 'General';
    if (!bySt[k]) bySt[k] = { stakeholder: k, count: 0, sum: 0 };
    bySt[k].count++; bySt[k].sum += r.score;
  });
  return {
    total: rows.length, average: rows.length ? +(sum / rows.length).toFixed(2) : 0,
    distribution: dist,
    byStakeholder: Object.values(bySt).map(x => ({ stakeholder: x.stakeholder, count: x.count, average: +(x.sum / x.count).toFixed(2) })),
    latest: rows.slice(0, 20)
  };
}
function stats(userId) {
  const ivs = userId ? DB.interviews.filter(i => i.userId === userId) : DB.interviews.slice();
  const ids = new Set(ivs.map(i => i.id));
  const qs = DB.questions.filter(q => ids.has(q.interviewId));
  const sg = DB.suggestions.filter(s => ids.has(s.interviewId));
  // Insights line-graph data: answered responses per day + answer-word volume per day
  const wordsByDay = {};
  qs.forEach(q => {
    if (!q.answer || !q.answer.trim()) return;
    const k = dayOf(q.answeredAt || q.updatedAt || q.createdAt);
    wordsByDay[k] = (wordsByDay[k] || 0) + String(q.answer).trim().split(/\s+/).length;
  });
  const labels = [], map = {};
  for (let n = 13; n >= 0; n--) { const d = new Date(); d.setDate(d.getDate() - n); const k = d.toISOString().slice(0, 10); labels.push(k); map[k] = { date: k, interviews: 0, questions: 0, completed: 0, suggestions: 0 }; }
  ivs.forEach(i => { const k = dayOf(i.createdAt); if (map[k]) map[k].interviews++; });
  qs.forEach(q => { const k = dayOf(q.createdAt); if (map[k]) map[k].questions++; });
  ivs.filter(i => i.status === 'completed').forEach(i => { const k = dayOf(i.updatedAt); if (map[k]) map[k].completed++; });
  sg.forEach(s => { const k = dayOf(s.createdAt); if (map[k]) map[k].suggestions++; });
  qs.forEach(q => { if (q.answer && q.answer.trim()) { const k = dayOf(q.answeredAt || q.updatedAt || q.createdAt); if (map[k]) map[k].answers = (map[k].answers || 0) + 1; } });
  labels.forEach(k => { map[k].words = wordsByDay[k] || 0; if (map[k].answers === undefined) map[k].answers = 0; });
  return {
    cards: { totalInterviews: ivs.length, questionsGenerated: qs.length, completedInterviews: ivs.filter(i => i.status === 'completed').length, suggestionsGenerated: sg.length, activeUsers: DB.users.length, answersCollected: qs.filter(q => q.answer && q.answer.trim()).length },
    series: labels.map(k => map[k])
  };
}

/* ---------- QR Survey System ---------- */
function nextSurveyId() {
  const y = String(new Date().getFullYear());
  const seq = String(DB.seq).padStart(4, '0');
  return `QR-${y}-${seq}`;
}

function createQrSurvey(userId, data) {
  const stamp = now();
  const survey = {
    id: uid('qrs'), userId,
    surveyId: null,
    title: String(data.title || '').trim().slice(0, 200),
    stakeholder: String(data.stakeholder || '').trim().slice(0, 100),
    language: data.language === 'Tagalog' ? 'Tagalog' : 'English',
    questionCount: Math.max(1, Math.min(50, parseInt(data.questionCount) || 5)),
    status: 'draft', questions: data.questions || [],
    qrCodeUrl: null, respondentCount: 0,
    createdAt: stamp, updatedAt: stamp
  };
  DB.qr_surveys.push(survey); persist(); return survey;
}

function getQrSurvey(filter) {
  if (!filter) filter = {};
  const byId = DB.qr_surveys.find(s => s.id === filter.id || s.surveyId === filter.surveyId || String(filter).startsWith('QR-'));
  if (byId) return byId;
  return DB.qr_surveys.find(s => s.surveyId === filter);
}

function getQrSurveyQuestions(surveyId) {
  return DB.qr_survey_questions
    .filter(q => q.surveyId === surveyId)
    .sort((a, b) => (a.number || 0) - (b.number || 0));
}

function saveQrSurveyQuestions(surveyId, questions) {
  DB.qr_survey_questions = DB.qr_survey_questions.filter(q => q.surveyId !== surveyId);
  questions.forEach((q, i) => {
    DB.qr_survey_questions.push({
      id: uid('qrsq'), surveyId, number: i + 1,
      text: String(q.text || '').trim().slice(0, 2000),
      stakeholder: String(q.stakeholder || '').trim().slice(0, 100),
      category: String(q.category || 'General').trim().slice(0, 100),
      createdAt: now()
    });
  });
  persist();
}

function confirmQrSurvey(id) {
  const survey = DB.qr_surveys.find(s => s.id === id || s.surveyId === id);
  if (!survey) return null;
  if (survey.status === 'confirmed') return survey;
  if (survey.questions.length === 0) return null;
  if (!survey.surveyId) {
    survey.surveyId = nextSurveyId();
    survey.status = 'confirmed';
    survey.updatedAt = now();
    saveQrSurveyQuestions(survey.surveyId, survey.questions);
    survey.questions = [];
    persist();
  }
  return survey;
}

function listQrSurveys(filter) {
  let list = DB.qr_surveys.slice();
  if (filter && filter.userId) list = list.filter(s => s.userId === filter.userId);
  if (filter && filter.status) list = list.filter(s => s.status === filter.status);
  return list.map(s => {
    const qCount = DB.qr_survey_questions.filter(q => q.surveyId === (s.surveyId || s.id)).length;
    return {
      id: s.id, userId: s.userId, surveyId: s.surveyId, title: s.title,
      stakeholder: s.stakeholder, language: s.language,
      questionCount: s.questionCount, status: s.status,
      questionCountStored: qCount, respondentCount: s.respondentCount || 0,
      qrCodeUrl: s.qrCodeUrl, createdAt: s.createdAt, updatedAt: s.updatedAt
    };
  }).sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
}


function qrSurveyAnalytics(surveyId) {
  const survey = getQrSurvey(surveyId);
  if (!survey) return { survey: null, responses: [], analytics: null };
  const responses = DB.survey_responses.filter(r => r.surveyId === surveyId && r.answers && r.answers.length > 0);
  const total = responses.length;
  const freq = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sumScores = 0;
  responses.forEach(r => {
    if (r.score != null && r.score >= 1 && r.score <= 5) { freq[r.score]++; sumScores += r.score; }
  });
  const weightedMean = total > 0 ? +(sumScores / total).toFixed(2) : 0;
  const meta = DB.qr_code_settings.interpretations || { 5: 'Very High', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Very Low' };
  let interpretation = 'No responses yet';
  if (total > 0) interpretation = meta[Math.round(weightedMean)] || 'Moderate';
  const scaleLabels = ['1 - Very Low', '2 - Low', '3 - Moderate', '4 - High', '5 - Very High'];
  const questions = getQrSurveyQuestions(surveyId);
  const perQuestion = questions.map(q => {
    const qResponses = responses.filter(r => r.answers.some(a => a.question === q.text));
    const qFreq = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let qSum = 0;
    qResponses.forEach(r => {
      if (r.score != null && r.score >= 1 && r.score <= 5) { qFreq[r.score]++; qSum += r.score; }
    });
    const qTotal = qResponses.length;
    const qMean = qTotal > 0 ? +(qSum / qTotal).toFixed(2) : 0;
    return {
      questionId: q.id, number: q.number, text: q.text,
      stakeholder: q.stakeholder, category: q.category,
      totalResponses: qTotal, frequency: qFreq, weightedMean: qMean,
      interpretation: qTotal > 0 ? meta[Math.round(qMean)] || 'Moderate' : 'No responses'
    };
  });
  return {
    survey: { surveyId: survey.surveyId || survey.id, title: survey.title, stakeholder: survey.stakeholder, language: survey.language, questionCount: survey.questionCount, status: survey.status, createdAt: survey.createdAt },
    responses: responses.map(r => ({ id: r.id, clientId: r.clientId, stakeholder: r.stakeholder, language: r.language, topic: r.topic, answers: r.answers, score: r.score, level: r.level, createdAt: r.createdAt, synced: r.synced !== false, surveyId: r.surveyId })),
    analytics: { totalResponses: total, frequency: freq, distribution: freq, weightedMean, interpretation, scale: [1, 2, 3, 4, 5], scaleLabels, perQuestion, meta }
  };
}

function updateQrSurveyRespondentCount(surveyId) {
  const survey = DB.qr_surveys.find(s => s.surveyId === surveyId);
  if (!survey) return false;
  survey.respondentCount = (survey.respondentCount || 0) + 1;
  survey.updatedAt = now();
  persist();
  return true;
}


function qrSurveyAnalytics(surveyId) {
  const survey = getQrSurvey(surveyId);
  if (!survey) return { survey: null, responses: [], analytics: null };
  const responses = DB.survey_responses.filter(r => r.surveyId === surveyId && r.answers && r.answers.length > 0);
  const total = responses.length;
  const freq = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sumScores = 0;
  responses.forEach(r => {
    if (r.score != null && r.score >= 1 && r.score <= 5) { freq[r.score]++; sumScores += r.score; }
  });
  const weightedMean = total > 0 ? +(sumScores / total).toFixed(2) : 0;
  const meta = DB.qr_code_settings.interpretations || { 5: 'Very High', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Very Low' };
  let interpretation = 'No responses yet';
  if (total > 0) interpretation = meta[Math.round(weightedMean)] || 'Moderate';
  const scaleLabels = ['1 - Very Low', '2 - Low', '3 - Moderate', '4 - High', '5 - Very High'];
  const questions = getQrSurveyQuestions(surveyId);
  const perQuestion = questions.map(q => {
    const qResponses = responses.filter(r => r.answers.some(a => a.question === q.text));
    const qFreq = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let qSum = 0;
    qResponses.forEach(r => {
      if (r.score != null && r.score >= 1 && r.score <= 5) { qFreq[r.score]++; qSum += r.score; }
    });
    const qTotal = qResponses.length;
    const qMean = qTotal > 0 ? +(qSum / qTotal).toFixed(2) : 0;
    return {
      questionId: q.id, number: q.number, text: q.text,
      stakeholder: q.stakeholder, category: q.category,
      totalResponses: qTotal, frequency: qFreq, weightedMean: qMean,
      interpretation: qTotal > 0 ? meta[Math.round(qMean)] || 'Moderate' : 'No responses'
    };
  });
  return {
    survey: { surveyId: survey.surveyId || survey.id, title: survey.title, stakeholder: survey.stakeholder, language: survey.language, questionCount: survey.questionCount, status: survey.status, createdAt: survey.createdAt },
    responses: responses.map(r => ({ id: r.id, clientId: r.clientId, stakeholder: r.stakeholder, language: r.language, topic: r.topic, answers: r.answers, score: r.score, level: r.level, createdAt: r.createdAt, synced: r.synced !== false, surveyId: r.surveyId })),
    analytics: { totalResponses: total, frequency: freq, distribution: freq, weightedMean, interpretation, scale: [1, 2, 3, 4, 5], scaleLabels, perQuestion, meta }
  };
}

function updateQrSurveyRespondentCount(surveyId) {
  const survey = DB.qr_surveys.find(s => s.surveyId === surveyId);
  if (!survey) return false;
  survey.respondentCount = (survey.respondentCount || 0) + 1;
  survey.updatedAt = now();
  persist();
  return true;
}

module.exports = { initDb, persist, now, SCALE_META, findUserByName, findUserByLogin, getUserById, safeUser, createUser, listUsers, updateUser, deleteUser, getSite, saveSite, getSettings, saveSettings, listInterviews, getInterview, withCounts, createInterview, updateInterview, deleteInterview, listQuestions, addQuestions, addQuestion, getQuestion, updateQuestion, deleteQuestion, saveAnswer, bankQuestions, getSuggestion, saveSuggestion, stats, listTopics, getTopic, upsertTopic, deleteTopic, listSurveyResponses, getSurveyResponse, saveSurveyResponse, listReports, getReport, getReportByResponse, saveReport, reportAggregates, nextSurveyId, createQrSurvey, getQrSurvey, getQrSurveyQuestions, saveQrSurveyQuestions, confirmQrSurvey, listQrSurveys, qrSurveyAnalytics, updateQrSurveyRespondentCount };
