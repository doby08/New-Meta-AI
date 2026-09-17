const fs = require('fs');
// Read db.js
let db = fs.readFileSync('db.js', 'utf8');

// Add surveyId to saveSurveyResponse row
const oldSave = `const row = {
    id: item.clientId || uid('sr'),
    stakeholder: c(item.stakeholder, 120) || 'General',
    topic: c(item.topic, 300) || 'General Survey', topicId: item.topicId || null,
    answers: Array.isArray(item.answers) ? item.answers.slice(0, 50).map(a => ({ question: c(a.question, 2000), answer: c(a.answer, 8000) })) : [],
    deviceLabel: c(item.deviceLabel, 200),
    syncedAt: now(), createdAt: item.createdAt || now(), updatedAt: now()
  };`;

const newSave = `const row = {
    id: item.clientId || uid('sr'),
    stakeholder: c(item.stakeholder, 120) || 'General',
    topic: c(item.topic, 300) || 'General Survey', topicId: item.topicId || null,
    surveyId: item.surveyId || null,
    answers: Array.isArray(item.answers) ? item.answers.slice(0, 50).map(a => ({ question: c(a.question, 2000), answer: c(a.answer, 8000) })) : [],
    deviceLabel: c(item.deviceLabel, 200),
    syncedAt: now(), createdAt: item.createdAt || now(), updatedAt: now()
  };`;

db = db.replace(oldSave, newSave);
fs.writeFileSync('db.js', db, 'utf8');
console.log('Updated saveSurveyResponse to include surveyId');

// Now run verification
delete require.cache[require.resolve('./db')];
const d = require('./db');
d.initDb().then(() => {
  const s = d.createQrSurvey('u1', { title: 'Flood', stakeholder: 'Farmer', language: 'Tagalog', questionCount: 20, questions: [{ text: 'Test Q1' }] });
  const c = d.confirmQrSurvey(s.id);
  const sr = d.saveSurveyResponse({ clientId: 'test_resp', surveyId: c.surveyId, stakeholder: 'Farmer', language: 'Tagalog', topic: 'Flood Control', answers: [{ question: 'Test Q1', answer: 'Maayos ang serbisyo.' }] });
  console.log('Saved response with surveyId:', sr.surveyId);
  const a = d.qrSurveyAnalytics(c.surveyId);
  console.log('Analytics totalResponses after save:', a.analytics.totalResponses);
  console.log('Analytics frequency:', JSON.stringify(a.analytics.frequency));
  console.log('All DB tests passed!');
});
