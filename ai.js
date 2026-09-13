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

function localQuestions(title, stakeholders, count) {
  const sh = splitStakeholders(stakeholders);
  if (!sh.length) throw Object.assign(new Error('stakeholders'), { code: 'VALIDATION' });
  const kw = keywordsOf(title); const kwP = kw.length ? kw.join(', ') : 'the project';
  const D = DOMAIN[detectDomain(title)] || DOMAIN.default;
  const cats = ['Current Process', 'Pain Points', 'Requirements', 'Data & Records', 'Reporting', 'Experience', 'Improvement', 'Priorities'];
  const out = []; let i = 0;
  const push = (s, c, t) => { if (out.length < count) out.push({ stakeholder: s, category: c, text: t }); };
  while (out.length < count) {
    const s = sh[i % sh.length];
    const round = Math.floor(i / sh.length);
    const angle = round % 8;
    if (angle === 0) push(s, cats[0], `As ${s}, walk me through how you currently handle ${D.proc[i % D.proc.length]} in relation to "${title}". Which steps consume the most time?`);
    else if (angle === 1) push(s, cats[1], `What problems related to ${D.pain[i % D.pain.length]} have you experienced with ${kwP}, and how do they affect your work as ${s}?`);
    else if (angle === 2) push(s, cats[2], `For "${title}", what must the system do for ${s} on day one? Describe your three most important requirements.`);
    else if (angle === 3) push(s, cats[3], `Which records or information (${kwP}) do you as ${s} create, update, or rely on — and what makes them hard to keep accurate?`);
    else if (angle === 4) push(s, cats[4], `Which reports, lists, or summaries related to "${title}" do you as ${s} need most often, and how quickly must they be available?`);
    else if (angle === 5) push(s, cats[5], `How should "${title}" notify or update ${s} about status changes, approvals, or pending requirements?`);
    else if (angle === 6) push(s, cats[6], `If one part of your current process (${D.proc[(i + 2) % D.proc.length]}) could be automated by "${title}", which would you choose and why?`);
    else push(s, cats[7], `What would make "${title}" a success from the perspective of ${s}? How should we measure it in the first 3 months?`);
    i++;
    if (i > count * 2 + 20) break;
  }
  return out.slice(0, count);
}
async function generateQuestions(title, stakeholders, count) {
  count = Math.max(1, Math.min(50, parseInt(count) || 20));
  if (!title || !title.trim()) throw Object.assign(new Error('title'), { code: 'VALIDATION' });
  if (!hasOpenAI()) return { questions: localQuestions(title.trim(), stakeholders, count), source: 'local-smart' };
  const sh = splitStakeholders(stakeholders).join(', ');
  const prompt = `You are an expert systems analyst preparing stakeholder interview questions.\nProject title: "${title}"\nStakeholders: ${sh}\nGenerate exactly ${count} interview questions. Rules: questions must be specific to the project and stakeholders (not generic), professionally written, logically organized, covering current processes, pain points, requirements, data/records, reporting, experience, and improvements.\nReturn ONLY valid JSON: an array of objects with keys "stakeholder", "category", "text". No markdown, no commentary.`;
  const raw = await callOpenAI([{ role: 'system', content: 'You output only valid JSON arrays.' }, { role: 'user', content: prompt }], 3500);
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
  const j = (a) => a.join('; ');
  return {
    summary: `Stakeholders interviewed for "${iv.title}" (${iv.stakeholders}) described a largely manual process with repeated delays. ${answered.length} of ${qa.length} questions were answered, surfacing consistent themes around ${top.slice(0, 4).join(', ') || 'workflow, records, and approvals'}. Respondents want a centralized system that removes paperwork, speeds up approvals, and gives real-time status visibility.`,
    keyFindings: answered.slice(0, 6).map(q => `${q.stakeholder}: "${String(q.answer).slice(0, 140)}${String(q.answer).length > 140 ? '…' : ''}"`),
    painPoints: D.pain.map(p => `Recurring ${p} reported across stakeholder groups.`),
    majorIssues: [`Manual, paper-heavy steps slow down ${iv.title}`, 'No single source of truth — records live in folders, chats, and spreadsheets', 'Stakeholders lack real-time status tracking'],
    recommendations: D.rec,
    solutionIdeas: D.rec.map((r, i) => `Phase ${i + 1}: deliver ${r} for ${iv.title}, validated with ${splitStakeholders(iv.stakeholders)[i % Math.max(1, splitStakeholders(iv.stakeholders).length)] || 'key users'}.`),
    observations: [`Response rate ${answered.length}/${qa.length} — ${answered.length >= qa.length / 2 ? 'strong engagement' : 'follow-up interviews recommended'}.`, `Dominant themes: ${top.slice(0, 5).join(', ') || 'process efficiency'}.`],
    priorities: ['Digitize intake and records first', 'Automate validation and approvals', 'Add notifications and reporting dashboards']
  };
}

async function analyzeInterview(iv, qa) {
  const answered = qa.filter(q => q.answer && q.answer.trim());
  if (!answered.length) throw Object.assign(new Error('no-answers'), { code: 'NO_ANSWERS' });
  if (!hasOpenAI()) return { analysis: localAnalysis(iv, qa), source: 'local-smart' };
  const qaText = qa.map(q => `Q${q.number} [${q.stakeholder}/${q.category}]: ${q.text}\nA: ${q.answer || '(no answer)'}`).join('\n\n');
  const prompt = `Analyze this stakeholder interview and return ONLY valid JSON with keys: summary (string), keyFindings (array of strings), painPoints (array), majorIssues (array), recommendations (array), solutionIdeas (array), observations (array), priorities (array).\nInterview title: "${iv.title}"\nStakeholders: ${iv.stakeholders}\nDescription: ${iv.description || '-'}\n\nQuestions & answers:\n${qaText}\n\nBase every point on the actual answers. Be specific to the project, not generic.`;
  const raw = await callOpenAI([{ role: 'system', content: 'You output only valid JSON objects.' }, { role: 'user', content: prompt }], 3500);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return { analysis: JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)), source: 'openai:' + MODEL };
}

module.exports = { hasOpenAI, MODEL, generateQuestions, analyzeInterview };
