const fs = require('fs');
const dbPath = 'db.js';
let db = fs.readFileSync(dbPath, 'utf8');

const analyticsFn = `
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
`;

const addBefore = 'module.exports =';
const parts = db.split(addBefore);
const newDb = parts[0] + analyticsFn + '\n' + addBefore + parts[1];
fs.writeFileSync(dbPath, newDb, 'utf8');
console.log('Done. Added qrSurveyAnalytics and updateQrSurveyRespondentCount');
