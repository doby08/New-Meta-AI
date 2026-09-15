/* AI layer: OpenAI when OPENAI_API_KEY is set, otherwise a smart
   built-in generator that adapts to ANY title + stakeholders. */
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const hasOpenAI = () => Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());

async function callOpenAI(messages, maxTokens = 2500) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: maxTokens })
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('OpenAI error ' + r.status + ': ' + t.slice(0, 300)); }
  const j = await r.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
}

function splitStakeholders(s) {
  return String(s || '').split(/[,;|\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 12);
}
function keywordsOf(title) {
  const stop = new Set(['system', 'based', 'web', 'app', 'application', 'management', 'the', 'a', 'an', 'of', 'for', 'and', 'with', 'using', 'platform', 'portal', 'online']);
  return String(title || '').replace(/[^a-zA-Z0-9\s-]/g, ' ').split(/\s+/).map(w => w.trim()).filter(w => w.length > 2 && !stop.has(w.toLowerCase())).slice(0, 6);
}
function detectDomain(title) {
  const t = String(title || '').toLowerCase();
  if (/enroll|school|student|registrar|teacher|class|grade|university|college|course/.test(t)) return 'education';
  if (/hospital|patient|doctor|nurse|clinic|medical|health|pharma/.test(t)) return 'healthcare';
  if (/librar|book|catalog|borrow/.test(t)) return 'library';
  if (/hotel|booking|reservation|travel|tour/.test(t)) return 'hospitality';
  if (/inventory|pos|sales|store|shop|e-?commerce|order/.test(t)) return 'retail';
  if (/payroll|hr|employee|attendance/.test(t)) return 'hr';
  if (/bank|loan|finance|accounting|billing/.test(t)) return 'finance';
  if (/barangay|government|permit|license|citizen/.test(t)) return 'government';
  return 'general';
}
const DOMAIN = {
  education: { proc: ['enrollment steps', 'encoding of subjects', 'evaluation of grades', 'clearance and requirements checking', 'sectioning and scheduling', 'approval of study load'], pain: ['long queues', 'lost forms', 'prerequisite errors', 'schedule conflicts', 'overloaded sections'], rec: ['online enrollment portal with real-time slots', 'automated prerequisite checking', 'SMS/email status tracker', 'digital evaluation and e-signature'] },
  healthcare: { proc: ['patient admission and triage', 'doctor rounds and orders', 'nurse endorsement', 'lab and pharmacy requests', 'billing and discharge'], pain: ['delayed chart retrieval', 'endorsement gaps', 'medication errors', 'scheduling backlogs'], rec: ['electronic medical records with role access', 'automated triage queue', 'e-prescription validation', 'bed and schedule dashboard'] },
  default: { proc: ['daily workflow steps', 'record creation and updates', 'approvals and handoffs', 'reporting routines', 'client or user requests'], pain: ['manual paperwork', 'data errors', 'slow approvals', 'duplicate encoding'], rec: ['centralized digital records', 'workflow automation', 'role-based dashboards', 'automated notifications and reports'] }
};

function localQuestions(title, stakeholders, count, method, format) {
  method = (method || 'Semi-Structured').trim();
  format = (format || 'Individual Interview').trim();
  const sh = splitStakeholders(stakeholders);
  if (!sh.length) throw Object.assign(new Error('stakeholders'), { code: 'VALIDATION' });
  const kw = keywordsOf(title); const kwP = kw.length ? kw.join(', ') : 'the project';
  const D = DOMAIN[detectDomain(title)] || DOMAIN.default;
  const cats = ['Current Process', 'Pain Points', 'Requirements', 'Data & Records', 'Reporting', 'Experience', 'Improvement', 'Priorities'];
  const out = []; let i = 0;
  const push = (s, c, t) => { if (out.length < count) out.push({ stakeholder: s, category: c, text: t }); };
  const isStructured = method === 'Structured';
  const isUnstructured = method === 'Unstructured';
  const isSemi = !isStructured && !isUnstructured;
  const followUps = [
    'Can you give me a specific example of that?',
    'How often does that happen?',
    'What impact does that have on your work?',
    'Why do you think that is the case?',
    'How would you prefer that to work instead?',
    'Who else is affected by that?',
    'When did you first notice that issue?',
    'What would need to change for that to improve?'
  ];

  while (out.length < count) {
    const s = sh[i % sh.length];
    const round = Math.floor(i / sh.length);
    const angle = round % 8;

    if (isStructured) {
      if (angle === 0) push(s, cats[0], 'As ' + s + ', what are the exact steps you follow for ' + D.proc[i % D.proc.length] + ' in relation to "' + title + '"? List each step in order.');
      else if (angle === 1) push(s, cats[1], 'What specific problems have you encountered with ' + D.pain[i % D.pain.length] + ' when working on ' + kwP + '? Describe one incident in detail.');
      else if (angle === 2) push(s, cats[2], 'What specific features or functions must "' + title + '" provide for ' + s + ' to perform daily tasks effectively?');
      else if (angle === 3) push(s, cats[3], 'What records or data does ' + s + ' create or update for "' + title + '"? What information must always be accurate?');
      else if (angle === 4) push(s, cats[4], 'What reports or information does ' + s + ' need to receive regularly about "' + title + '"? How often and in what format?');
      else if (angle === 5) push(s, cats[5], 'How does ' + s + ' currently receive updates about changes or approvals related to "' + title + '"?');
      else if (angle === 6) push(s, cats[6], 'Which manual step in your current process for "' + title + '" would ' + s + ' most want to eliminate and why?');
      else push(s, cats[7], 'What specific measurable outcome would indicate that "' + title + '" is successful for ' + s + '?');
    } else if (isUnstructured) {
      if (angle === 0) push(s, cats[0], "Can you tell me about your experience with " + kwP + "? I'd like to understand how things work from your perspective as " + s + '.');
      else if (angle === 1) push(s, cats[1], 'What has been the most challenging part of your work related to ' + kwP + '? What happened?');
      else if (angle === 2) push(s, cats[2], 'When you think about "' + title + '", what would make the biggest difference in your daily work as ' + s + '?');
      else if (angle === 3) push(s, cats[3], 'Walk me through a recent situation where you had to handle records or information for "' + title + '". What was that like?');
      else if (angle === 4) push(s, cats[4], "How do you currently stay informed about what's happening with " + kwP + '? What works well and what doesn\'t?');
      else if (angle === 5) push(s, cats[5], 'In your own words, how should someone like you be kept in the loop about "' + title + '"?');
      else if (angle === 6) push(s, cats[6], 'If you could change anything about how "' + title + '" works today, what would you start with and why?');
      else push(s, cats[7], 'Looking ahead, what would success look like for "' + title + '" from where you sit as ' + s + '?');
    } else {
      if (angle === 0) { push(s, cats[0], 'As ' + s + ', can you walk me through how you currently handle ' + D.proc[i % D.proc.length] + ' for "' + title + '"?'); if (out.length < count) push(s, cats[0], followUps[i % followUps.length]); }
      else if (angle === 1) { push(s, cats[1], 'What problems related to ' + D.pain[i % D.pain.length] + ' have you experienced with ' + kwP + '?'); if (out.length < count) push(s, cats[1], followUps[(i + 1) % followUps.length]); }
      else if (angle === 2) { push(s, cats[2], 'For "' + title + '", what are the most important requirements from ' + s + "'s perspective?"); if (out.length < count) push(s, cats[2], 'Can you rank those by priority and explain why?'); }
      else if (angle === 3) { push(s, cats[3], 'Which records or information does ' + s + ' rely on for "' + title + '"?'); if (out.length < count) push(s, cats[3], 'What makes keeping those accurate difficult?'); }
      else if (angle === 4) { push(s, cats[4], 'What reports or summaries does ' + s + ' need most often for "' + title + '"?'); if (out.length < count) push(s, cats[4], 'How quickly do you need them and in what format?'); }
      else if (angle === 5) { push(s, cats[5], 'How should "' + title + '" keep ' + s + ' informed about status changes or approvals?'); if (out.length < count) push(s, cats[5], 'Which method would work best for you and why?'); }
      else if (angle === 6) { push(s, cats[6], 'If one part of your current process could be automated by "' + title + '", which would ' + s + ' choose?'); if (out.length < count) push(s, cats[6], 'What benefits would that bring to your work?'); }
      else { push(s, cats[7], 'What would make "' + title + '" a success from ' + s + "'s point of view?"); if (out.length < count) push(s, cats[7], 'How should we measure that success in the first few months?'); }
    }
    i++;
    if (i > count * 3 + 30) break;
  }
  return out.slice(0, count);
}

async function generateQuestions(title, stakeholders, count, method, format) {
  count = Math.max(1, Math.min(50, parseInt(count) || 20));
  method = (method || 'Semi-Structured').trim();
  format = (format || 'Individual Interview').trim();
  if (!title || !title.trim()) throw Object.assign(new Error('title'), { code: 'VALIDATION' });
  if (!hasOpenAI()) return { questions: localQuestions(title.trim(), stakeholders, count, method, format), source: 'local-smart' };
  const sh = splitStakeholders(stakeholders).join(', ');
  const isStructured = method === 'Structured';
  const isUnstructured = method === 'Unstructured';
  const isSemi = !isStructured && !isUnstructured;

  const methodBlock = isStructured
    ? 'INTERVIEW METHOD: STRUCTURED\n' + 'RULES:\n' + '- Generate standardized and fixed questions.\n' + '- Questions must be clear, direct, specific, and consistent.\n' + '- Each question should focus on one topic only.\n' + '- Do NOT generate follow-up questions.\n' + '- Do NOT make the questions conversational.\n' + '- The questions should be suitable for asking the same set of questions to different respondents.\n' + '- Focus on requirements, current workflow, problems, expectations, limitations, and desired features.'
    : isUnstructured
    ? 'INTERVIEW METHOD: UNSTRUCTURED\n' + 'RULES:\n' + '- Generate open-ended, conversational questions.\n' + '- Questions should encourage the stakeholder to freely explain their experience, problems, ideas, and needs.\n' + '- Do NOT use a rigid questionnaire style.\n' + '- Questions should be broad and exploratory.\n' + '- Questions should allow the interviewer/AI to adapt the next question based on the respondent\'s previous answer.\n' + '- Do not simply copy Structured or Semi-Structured questions.\n' + '- The interview should feel like a natural conversation.'
    : 'INTERVIEW METHOD: SEMI-STRUCTURED\n' + 'RULES:\n' + '- Generate a set of main questions that are standardized but allow flexibility.\n' + '- Questions should be open-ended enough to encourage detailed answers.\n' + '- For each main question, provide ONE possible follow-up question.\n' + '- Follow-up questions must depend on the likely answer or information given by the stakeholder.\n' + '- The interview should have a clear structure but allow deeper exploration.\n' + '- Do not make all questions identical to Structured mode.';

  const formatBlock = format === 'Group Interview'
    ? '\n\nINTERVIEW FORMAT: GROUP INTERVIEW\n' + '- Questions should be suitable for group discussion.\n' + '- Consider multiple perspectives, group dynamics, consensus areas, and divergent opinions among stakeholders.'
    : '\n\nINTERVIEW FORMAT: INDIVIDUAL INTERVIEW\n' + '- Questions are for one-on-one interview.\n' + '- Focus on that individual stakeholder\'s perspective, experience, and needs.';

  const prompt = 'You are an AI Interview Question Generator for an Information System Requirements Gathering System.\n\n' + 'Generate interview questions based on the following inputs:\n\n' + 'Interview Title: "' + title + '"\n' + 'Stakeholders: ' + sh + '\n' + 'Number of Questions: ' + count + '\n' + methodBlock + formatBlock + '\n\n' + 'GENERAL RULES:\n' + '- Questions must be relevant to the Interview Title and Stakeholders.\n' + '- Do not generate generic questions that are unrelated to the system.\n' + '- Do not repeat questions.\n' + '- Use simple and professional English.\n' + '- Avoid leading or biased questions.\n' + '- Focus on gathering useful information for system analysis and requirements.\n' + '- Generate exactly ' + count + ' main questions.\n' + '- If the method is Semi-Structured, include follow-up questions within the requested number of questions and do not exceed the requested total.\n' + '- If the method is Structured, output only the main questions.\n' + '- If the method is Unstructured, output exploratory questions only.\n\n' + 'Return ONLY valid JSON: an array of objects with keys "stakeholder", "category", "text". No markdown, no commentary.';

  const raw = await callOpenAI([{ role: 'system', content: 'You output only valid JSON arrays.' }, { role: 'user', content: prompt }], isUnstructured ? 4000 : 3500);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const arr = JSON.parse(cleaned.slice(cleaned.indexOf('['), cleaned.lastIndexOf(']') + 1));
  const shList = splitStakeholders(stakeholders);
  const questions = arr.slice(0, count).map((q, i) => ({ stakeholder: q.stakeholder || shList[i % shList.length] || 'General', category: q.category || 'General', text: q.text || q.question || '' })).filter(q => q.text);
  if (!questions.length) throw new Error('AI returned no usable questions.');
  return { questions, source: 'openai:' + MODEL };
}


function localAnalysis(iv, qa) {
  const answered = qa.filter(q => q.answer && q.answer.trim());
  const topics = {};
  answered.forEach(q => String(q.answer).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 4).forEach(w => topics[w] = (topics[w] || 0) + 1));
  const top = Object.entries(topics).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
  const D = DOMAIN[detectDomain(iv.title)] || DOMAIN.default;
  return {
    summary: 'Stakeholders interviewed for "' + iv.title + '" (' + iv.stakeholders + ') described a largely manual process with repeated delays. ' + answered.length + ' of ' + qa.length + ' questions were answered, surfacing consistent themes around ' + (top.slice(0, 4).join(', ') || 'workflow, records, and approvals') + '. Respondents want a centralized system that removes paperwork, speeds up approvals, and gives real-time status visibility.',
    keyFindings: answered.slice(0, 6).map(q => q.stakeholder + ': "' + String(q.answer).slice(0, 140) + (String(q.answer).length > 140 ? '…' : '') + '"'),
    painPoints: D.pain.map(p => 'Recurring ' + p + ' reported across stakeholder groups.'),
    majorIssues: ['Manual, paper-heavy steps slow down ' + iv.title, 'No single source of truth - records live in folders, chats, and spreadsheets', 'Stakeholders lack real-time status tracking'],
    recommendations: D.rec,
    solutionIdeas: D.rec.map((r, i) => 'Phase ' + (i + 1) + ': deliver ' + r + ' for ' + iv.title + ', validated with ' + (splitStakeholders(iv.stakeholders)[i % Math.max(1, splitStakeholders(iv.stakeholders).length)] || 'key users') + '.'),
    observations: ['Response rate ' + answered.length + '/' + qa.length + ' - ' + (answered.length >= qa.length / 2 ? 'strong engagement' : 'follow-up interviews recommended'), 'Dominant themes: ' + (top.slice(0, 5).join(', ') || 'process efficiency')],
    priorities: ['Digitize intake and records first', 'Automate validation and approvals', 'Add notifications and reporting dashboards']
  };
}

async function analyzeInterview(iv, qa) {
  const answered = qa.filter(q => q.answer && q.answer.trim());
  if (!answered.length) throw Object.assign(new Error('no-answers'), { code: 'NO_ANSWERS' });
  if (!hasOpenAI()) return { analysis: localAnalysis(iv, qa), source: 'local-smart' };
  const qaText = qa.map(q => 'Q' + q.number + ' [' + q.stakeholder + '/' + q.category + ']: ' + q.text + '\nA: ' + (q.answer || '(no answer)')).join('\n\n');
  const prompt = 'Analyze this stakeholder interview and return ONLY valid JSON with keys: summary (string), keyFindings (array of strings), painPoints (array), majorIssues (array), recommendations (array), solutionIdeas (array), observations (array), priorities (array).\nInterview title: "' + iv.title + '"\nStakeholders: ' + iv.stakeholders + '\nInterview Method: ' + (iv.interviewMethod || 'N/A') + '\nInterview Format: ' + (iv.interviewFormat || 'N/A') + '\nDescription: ' + (iv.description || '-') + '\n\nQuestions & answers:\n' + qaText + '\n\nBase every point on the actual answers. Be specific to the project, not generic. Consider the interview method and format when analyzing responses.';
  const raw = await callOpenAI([{ role: 'system', content: 'You output only valid JSON objects.' }, { role: 'user', content: prompt }], 3500);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return { analysis: JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)), source: 'openai:' + MODEL };
}

module.exports = { hasOpenAI, MODEL, generateQuestions, analyzeInterview };
