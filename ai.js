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
  const titleRef = title.trim(); // Use full title naturally
  const D = DOMAIN[detectDomain(title)] || DOMAIN.default;
  const cats = ['Current Process', 'Pain Points', 'Requirements', 'Data & Records', 'Reporting', 'Experience', 'Improvement', 'Priorities'];
  const out = [];
  let i = 0;
  const push = (s, c, t) => { if (out.length < count) out.push({ stakeholder: s, category: c, text: t }); };
  const isStructured = method === 'Structured';
  const isUnstructured = method === 'Unstructured';

  // Follow-up questions for Semi-Structured mode - context-aware
  const followUps = [
    'Can you give me a specific example of that in relation to "' + titleRef + '"?',
    'How often does that happen in your work with "' + titleRef + '"?',
    'What impact does that have on your role for "' + titleRef + '"?',
    'Why do you think that happens with "' + titleRef + '"?',
    'How would you prefer that to work instead for "' + titleRef + '"?',
    'Who else is affected by that in "' + titleRef + '"?',
    'When did you first notice that issue with "' + titleRef + '"?',
    'What changes would improve that for "' + titleRef + '"?'
  ];

  while (out.length < count) {
    const s = sh[i % sh.length];
    // Cycle through categories independently of stakeholder rotation
    const catIndex = i % cats.length;
    const c = cats[catIndex];
    const procIdx = i % D.proc.length;
    const painIdx = i % D.pain.length;

    if (isStructured) {
      // Structured: direct, specific, one-topic questions, NO follow-ups
      const st = [
        'As ' + s + ', what are the exact steps you follow for ' + D.proc[procIdx] + ' in relation to "' + titleRef + '"?',
        'What specific problems have you encountered with ' + D.pain[painIdx] + ' when working on "' + titleRef + '"? Describe one incident.',
        'What specific features or functions must "' + titleRef + '" provide for ' + s + ' to perform daily tasks effectively?',
        'What records or data does ' + s + ' create or update for "' + titleRef + '"? What information must always be accurate?',
        'What reports or information does ' + s + ' need to receive regularly about "' + titleRef + '"? How often and in what format?',
        'How does ' + s + ' currently receive updates about changes or approvals related to "' + titleRef + '"?',
        'Which manual step in your current process for "' + titleRef + '" would ' + s + ' most want to eliminate and why?',
        'What specific measurable outcome would indicate that "' + titleRef + '" is successful for ' + s + '?'
      ];
      push(s, c, st[i % st.length]);
    } else if (isUnstructured) {
      // Unstructured: open-ended, conversational, exploratory, NO rigid questionnaire style
      const st = [
        'Can you tell me about your experience with "' + titleRef + '"? I\'d like to understand how things work from your perspective as ' + s + '.',
        'What has been the most challenging part of your work related to "' + titleRef + '"? What happened?',
        'When you think about "' + titleRef + '", what would make the biggest difference in your daily work as ' + s + '?',
        'Walk me through a recent situation where you had to handle records or information for "' + titleRef + '". What was that like?',
        'How do you currently stay informed about what\'s happening with "' + titleRef + '"? What works well and what doesn\'t?',
        'In your own words, how should someone like you be kept in the loop about "' + titleRef + '"?',
        'If you could change anything about how "' + titleRef + '" works today, what would you start with and why?',
        'Looking ahead, what would success look like for "' + titleRef + '" from where you sit as ' + s + '?'
      ];
      push(s, c, st[i % st.length]);
    } else {
      // Semi-Structured: main question + ONE contextual follow-up
      const mainQs = [
        'As ' + s + ', can you walk me through how you currently handle ' + D.proc[procIdx] + ' for "' + titleRef + '"?',
        'What problems related to ' + D.pain[painIdx] + ' have you experienced with "' + titleRef + '"?',
        'For "' + titleRef + '", what are the most important requirements from ' + s + '\'s perspective?',
        'Which records or information does ' + s + ' rely on for "' + titleRef + '"?',
        'What reports or summaries does ' + s + ' need most often for "' + titleRef + '"?',
        'How should "' + titleRef + '" keep ' + s + ' informed about status changes or approvals?',
        'If one part of your current process could be automated by "' + titleRef + '", which would ' + s + ' choose?',
        'What would make "' + titleRef + '" a success from ' + s + '\'s point of view?'
      ];
      push(s, c, mainQs[i % mainQs.length]);
      // Add ONE follow-up that is context-aware (uses title, stakeholder, process/pain)
      if (out.length < count) {
        const fu = followUps[i % followUps.length];
        push(s, c, fu);
      }
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

/* ---- Adaptive interview engine (method-aware, context-aware) ---- */
const FLOW = ['Current Process', 'Pain Points / Problems', 'Cause or Details', 'Impact', 'User Requirements', 'Desired Features', 'Suggestions / Feedback'];

function snippetOf(answer, max = 90) {
  const clean = String(answer || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const parts = clean.split(/[.;!?\n]/).map(s => s.trim()).filter(Boolean);
  let s = parts.sort((x, y) => y.length - x.length)[0] || clean;
  return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
}

/* Semi-Structured: follow-up CONNECTED to the respondent's last answer */
function localFollowUp(iv, lastQ, answer) {
  const a = String(answer || '').toLowerCase();
  const snip = snippetOf(answer);
  const st = lastQ.stakeholder;
  if (/(manual|manually|paper|paperwork|handwritten|encode|encoding|retype|re-encode)/.test(a))
    return 'You mentioned "' + snip + '". Which specific part of that manual process takes the most time, and what usually causes the delay?';
  if (/(slow|slower|long|time|takes|queue|delay|wait|waiting|backlog)/.test(a))
    return 'You said "' + snip + '". Which step exactly takes the longest, and how much time is lost because of it?';
  if (/(error|errors|mistake|wrong|inaccurate|incorrect|missing|lost|lose|duplicate)/.test(a))
    return 'When "' + snip + '" happens, what is usually the cause, and how do you currently fix it?';
  if (/(difficult|hard|challenge|struggle|problem|issue|concern)/.test(a))
    return 'Can you describe a specific situation where "' + snip + '" became a problem? What was the impact on your work as ' + st + '?';
  if (/(because|due to|since|cause|reason)/.test(a))
    return 'Since "' + snip + '", what effect does that have on the rest of the process for "' + iv.title + '"?';
  if (/(need|needs|want|should|must|wish|hope|prefer|feature)/.test(a))
    return 'Regarding "' + snip + '" — what specific feature would address that, and how should it work for ' + st + '?';
  return 'You mentioned "' + snip + '". Can you give me a specific example of that and explain how it affects "' + iv.title + '"?';
}

/* Unstructured: fully adaptive — next question comes from the conversation itself,
   following Current Process → Problems → Causes → Effects → Needs → Features → Suggestions */
function localAdaptive(iv, qa) {
  const answered = qa.filter(q => q.answer && q.answer.trim());
  const t = iv.title;
  const st = (answered.length ? answered[answered.length - 1].stakeholder : (iv.stakeholders || '').split(',')[0].trim()) || 'General';
  const asked = qa.map(q => String(q.text).toLowerCase());
  const lastAns = answered.length ? answered[answered.length - 1].answer : '';
  const a = String(lastAns).toLowerCase();
  const askedAbout = (kw) => asked.some(x => x.includes(kw));
  const snip = snippetOf(lastAns);
  const fresh = (text) => !asked.some(x => x === String(text).toLowerCase());

  const stages = [
    { test: () => answered.length === 0, text: 'To begin, can you tell me about your role and walk me through how you currently handle things related to "' + t + '"?' },
    { test: () => /(problem|issue|difficult|hard|challenge|slow|manual|error|delay|queue|lost|wrong|concern)/.test(a) && !askedAbout('why do you think that keeps happening'), text: 'You mentioned "' + snip + '". Why do you think that keeps happening?' },
    { test: () => /(because|due to|since|reason|cause|manual)/.test(a) && !askedAbout('what effect does it have on the people'), text: 'Given that "' + snip + '", what effect does it have on the people and process involved in "' + t + '"?' },
    { test: () => /(effect|impact|affect|results in|leads to|delays|affects|wait|waiting)/.test(a) && !askedAbout('what do you need most'), text: 'Considering those effects, what do you need most to make your work easier?' },
    { test: () => /(need|needs|want|wish|hope|should|must|improve|better)/.test(a) && !askedAbout('what should it do exactly'), text: 'If "' + t + '" could include one feature to solve what we just discussed, what should it do exactly?' },
    { test: () => /(feature|function|automate|automation|online|digital|system)/.test(a) && !askedAbout('how would that feature change'), text: 'How would that feature change the way you work day to day? Do you have any concerns about it?' }
  ];
  for (const s of stages) if (s.test()) return { text: s.text, stakeholder: st, category: 'Adaptive' };

  // Explore topics not yet covered
  const areas = [
    ['records', 'How are records and information currently kept for "' + t + '", and where do things usually get misplaced?'],
    ['reports', 'What reports or summaries do you wish you had instantly available for "' + t + '"?'],
    ['approval', 'Walk me through how approvals work today for "' + t + '" — where does it usually slow down?'],
    ['redesign', 'If you could redesign one part of "' + t + '" from scratch, what would it look like and why?']
  ];
  for (const [kw, text] of areas) if (!askedAbout(kw)) return { text, stakeholder: st, category: 'Adaptive' };
  return { text: 'Before we wrap up, is there anything about "' + t + '" we have not covered that you think is important to share?', stakeholder: st, category: 'Adaptive' };
}

/* Generates the NEXT question from the interview context.
   mode: 'followup' (Semi-Structured) or 'adaptive' (Unstructured). */
async function nextQuestion(iv, qa, mode) {
  const answered = qa.filter(q => q.answer && q.answer.trim());
  const lastQ = answered.length ? answered[answered.length - 1] : null;
  if (!hasOpenAI()) {
    if (mode === 'followup') {
      if (!lastQ) return { text: 'Can you tell me more about how you currently handle your tasks related to "' + iv.title + '"?', category: 'Follow-up', source: 'local-smart' };
      return { text: localFollowUp(iv, lastQ, lastQ.answer), category: 'Follow-up', source: 'local-smart' };
    }
    return { ...localAdaptive(iv, qa), source: 'local-smart' };
  }
  const conv = qa.map(q => 'Q' + q.number + (q.isFollowUp ? ' (AI follow-up)' : '') + ' [' + q.stakeholder + '/' + q.category + ']: ' + q.text + '\nA: ' + (q.answer && q.answer.trim() ? q.answer : '(not answered yet)')).join('\n\n');
  const isFollowup = mode === 'followup';
  const prompt = 'You are conducting a ' + (iv.interviewMethod || 'Semi-Structured') + ' requirements-gathering interview for "' + iv.title + '" (Stakeholders: ' + iv.stakeholders + ', Format: ' + (iv.interviewFormat || 'Individual Interview') + ').\n'
    + 'Conversation so far:\n' + conv + '\n\n'
    + (isFollowup
      ? 'TASK: The respondent just answered the LAST question above. Analyze that answer. If it contains useful information, problems, unclear details, or something needing clarification, generate ONE follow-up question that is DIRECTLY connected to the specific content of that answer (quote or reference part of it). Do NOT move to a new topic. Do NOT repeat previous questions. If the answer is already fully clear, generate a follow-up that explores its impact on the system requirements.\n'
      : 'TASK: This is an UNSTRUCTURED interview — there is NO fixed question list. Generate the NEXT question based on the latest answer and the full conversation history. Follow this logical flow when possible: Current Process → Problems → Causes → Effects → Needs → Desired Features → Suggestions. If the respondent mentioned a new issue, explore that issue before moving on. The question must be relevant, logically connected to what was just said, and must NOT repeat any previous question.\n')
    + 'Return ONLY valid JSON: {"text": "the question", "category": "one or two words"}. No markdown, no commentary.';
  const raw = await callOpenAI([{ role: 'system', content: 'You output only valid JSON objects.' }, { role: 'user', content: prompt }], 700);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  const j = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
  if (!j.text) throw new Error('AI returned no question.');
  return { text: String(j.text), category: String(j.category || (isFollowup ? 'Follow-up' : 'Adaptive')), source: 'openai:' + MODEL };
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

module.exports = { hasOpenAI, MODEL, generateQuestions, analyzeInterview, localQuestions, nextQuestion };
