/* STEP 7 smoke test — offline-ready survey + dual AI + 1-5 analytics.
   Run:  node test_offline_survey.js   (server NOT required; uses local fallback chain)
   Covers: seed topics, bilingual question generation, local 1-5 scoring,
   response save, report save, public aggregates. */
delete process.env.OPENAI_API_KEY; // force offline path: Ollama unreachable -> local-smart
const db = require('./db');
const ai = require('./ai');
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok:', m); };
(async () => {
  await db.initDb();
  assert(db.listTopics({}).length >= 6, 'seeded stakeholder_topics (>=6)');
  assert(db.listTopics({ stakeholder: 'Farmer', language: 'Tagalog', activeOnly: true }).length >= 1, 'role+language topic filter works');
  for (const lang of ['Tagalog', 'English']) {
    const q = await ai.generateSurveyQuestions('Farmer', lang, 'Test Topic');
    assert(q.questions.length >= 3 && q.questions.length <= 5, lang + ' generates 3-5 questions (' + q.source + ')');
  }
  const pos = await ai.evaluateSurvey('Farmer', 'Tagalog', 'Test', [{ question: 'Q1', answer: 'Maganda at maayos ang serbisyo, mabilis at nasiyahan kami. Salamat!' }]);
  const neg = await ai.evaluateSurvey('Vendor', 'English', 'Test', [{ question: 'Q1', answer: 'Bad problem, slow, lacking support, urgent. Nothing works, mahirap at kulang.' }]);
  assert(pos.evaluation.score >= 3, 'positive answers score >= 3 (got ' + pos.evaluation.score + ')');
  assert(neg.evaluation.score <= 3, 'negative answers score <= 3 (got ' + neg.evaluation.score + ')');
  assert(pos.evaluation.score >= 1 && pos.evaluation.score <= 5, 'score within 1-5 scale');
  const saved = db.saveSurveyResponse({ clientId: 'smoke_' + Date.now(), stakeholder: 'Farmer', language: 'Tagalog', topic: 'Smoke Topic', answers: [{ question: 'Q1', answer: 'Maayos.' }] });
  assert(saved.id, 'survey response saved (' + saved.id + ')');
  const dup = db.saveSurveyResponse({ clientId: saved.id, stakeholder: 'Farmer', language: 'Tagalog', topic: 'Smoke Topic', answers: [{ question: 'Q1', answer: 'Maayos.' }] });
  assert(dup.id === saved.id, 'clientId idempotency: re-sync does not duplicate');
  const rep = db.saveReport({ responseId: saved.id, stakeholder: 'Farmer', language: 'Tagalog', topic: 'Smoke Topic', score: pos.evaluation.score, level: pos.evaluation.level, summary: pos.evaluation.summary, meaning: pos.evaluation.meaning, recommendations: pos.evaluation.recommendations, engine: pos.source });
  assert(rep.level === db.SCALE_META[rep.score].level, 'report level matches SCALE_META');
  const agg = db.reportAggregates({});
  assert(agg.total >= 1 && agg.byStakeholder.length >= 1, 'public aggregates compute (total=' + agg.total + ', avg=' + agg.average + ')');
  console.log('\nALL SMOKE TESTS PASSED (run CHECK: node test_offline_survey.js)');
  process.exit(0);
})().catch(e => { console.error('SMOKE FAILED:', e); process.exit(1); });
