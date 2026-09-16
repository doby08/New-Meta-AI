/* AI layer: OpenAI when OPENAI_API_KEY is set, otherwise a smart
   built-in generator that adapts to ANY title + stakeholders. */
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const hasOpenAI = () => Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());

/* ---- STEP 1 helpers: dual-language prompts (Tagalog | English) ---- */
function interviewerSystemPrompt(stakeholder, language, topic) {
  return 'You are an empathetic AI interviewer. Generate 3-5 concise survey questions based on:\n'
    + 'Stakeholder: ' + stakeholder + ', Language: ' + language + ', Topic: ' + topic + '.\n'
    + 'If Tagalog is selected, use simple, respectful, and natural conversational Tagalog.';
}
function evaluatorSystemPrompt(language) {
  return 'Analyze all answers holistically and output JSON:\n'
    + '{\n  "score": 1-5 (5=Very High, 4=High, 3=Moderate, 2=Low, 1=Very Low),\n'
    + '  "level": "Scale Name",\n'
    + '  "summary": "Brief summary in ' + language + '",\n'
    + '  "meaning": "Explanation of the score in ' + language + '",\n'
    + '  "recommendations": ["Recommendation 1", "Recommendation 2"]\n}';
}
function normLang(v) { return v === 'English' ? 'English' : 'Tagalog'; }

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

/* ---- STEP 4: Local Ollama fallback (works fully offline on the server) ---- */
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
async function callOllama(prompt, model) {
  const r = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || OLLAMA_MODEL, prompt, stream: false })
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Ollama error ' + r.status + ': ' + t.slice(0, 300)); }
  const j = await r.json();
  return String((j && j.response) || '').trim();
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

function localQuestions(title, stakeholders, count, method, format, language) {
  method = (method || 'Semi-Structured').trim();
  format = (format || 'Individual Interview').trim();
  const lang = normLang(language);
  const tl = lang === 'Tagalog';
  const sh = splitStakeholders(stakeholders);
  if (!sh.length) throw Object.assign(new Error('stakeholders'), { code: 'VALIDATION' });
  const titleRef = title.trim(); // Use full title naturally
  const D = DOMAIN[detectDomain(title)] || DOMAIN.default;
  const cats = tl
    ? ['Proseso', 'Mga Problema', 'Pangangailangan', 'Data at Rekord', 'Ulat', 'Karanasan', 'Pagbabago', 'Prioridad']
    : ['Current Process', 'Pain Points', 'Requirements', 'Data & Records', 'Reporting', 'Experience', 'Improvement', 'Priorities'];
  const out = [];
  let i = 0;
  const push = (s, c, t) => { if (out.length < count) out.push({ stakeholder: s, category: c, text: t }); };
  const isStructured = method === 'Structured';
  const isUnstructured = method === 'Unstructured';

  // Follow-up questions for Semi-Structured mode - short, easy clarifiers
  var followUps = tl
    ? ['Maaari mo bang bigyan ako ng isang halimbaga?', 'Gaano kadalas ito nangyayari?', 'Paano iyon nakaapekto sa iyong trabaho?', 'Bakit mo iniisip na iyon ay nangyayari?', 'Ano ang mas gusto mo sa halip?', 'Sino pa ang naapekto nito?', 'Kailan mo una tingnan ito?', 'Ano ang pagbabago na pinakatulong?']
    : ['Can you give me an example?', 'How often does that happen?', 'How does that affect your work?', 'Why do you think that happens?', 'What would you prefer instead?', 'Who else is affected by that?', 'When did you first notice it?', 'What change would help most?'];

  while (out.length < count) {
    const s = sh[i % sh.length];
    // Cycle through categories independently of stakeholder rotation
    const catIndex = i % cats.length;
    const c = cats[catIndex];
    const procIdx = i % D.proc.length;
    const painIdx = i % D.pain.length;

    if (isStructured) {
      // Structured: short, direct, survey-style — one topic per question, NO follow-ups
            const st = tl
        ? ['Ano ang mga hakbang na sinusunod mo para sa ' + D.proc[procIdx] + ' na may kinalaman sa "' + titleRef + '"?', 'Ano ang mga problema na nararanasan mo sa ' + D.pain[painIdx] + '?', 'Ano ang mga tampok na pinakakailangan mo sa "' + titleRef + '"?', 'Ano ang mga rekord o data na hinaharap mo para sa "' + titleRef + '"?', 'Ano ang mga ulat na kailangan mo mula sa "' + titleRef + '"?', 'Paano mo natatanggap ang mga update tungkol sa "' + titleRef + '" ngayon?', 'Alin ang manu-mano ng gawain na nais mong tanggalin una sa iyong trabaho?', 'Paano nating malalaman na ang "' + titleRef + '" ay matagumpayan?']
        : ['What steps do you follow for ' + D.proc[procIdx] + ' related to "' + titleRef + '"?', 'What problems do you encounter with ' + D.pain[painIdx] + '?', 'What features do you need most in "' + titleRef + '"?', 'What records or data do you handle for "' + titleRef + '"?', 'What reports do you need from "' + titleRef + '"?', 'How do you receive updates about "' + titleRef + '" today?', 'Which manual task would you remove first in your work?', 'How would we know that "' + titleRef + '" is successful?'];
      push(s, c, st[i % st.length]);
    } else if (isUnstructured) {
      // Unstructured: casual, friendly, broad conversation starters
            const st = tl
        ? ['Sabihin mo sa akin kung paano ang iyong karanasan sa "' + titleRef + '" hanggang ngay.', 'Ano ang pinakamahirap na bahagi ng iyong trabaho na may kinalaman sa "' + titleRef + '"?', 'Ano ang makakatulong upang mas maging madali ang iyong araw-arawng trabaho sa "' + titleRef + '"?', 'Maaari mo bang ibahagi ang isang karawanig na karanasan sa pagproseso ng rekord para sa "' + titleRef + '"?', 'Paano mo karaniwang nanabik tungkol sa "' + titleRef + '"?', 'Kung maaari kang baguhin ang isa sa "' + titleRef + '", ano ito?', 'Ano ang hitsura ng isang magandang araw para sa iyo?', 'May iba pa bang bagay tungkol sa "' + titleRef + '" na nais mong ibahagi?']
        : ['Tell me about your experience with "' + titleRef + '" so far.', 'What do you find most challenging in your work related to "' + titleRef + '"?', 'What would make your daily work on "' + titleRef + '" easier?', 'Can you share a recent experience handling records for "' + titleRef + '"?', 'How do you usually stay updated about "' + titleRef + '"?', 'If you could change one thing about "' + titleRef + '", what would it be?', 'What does a good day at work look like for you?', 'Is there anything else about "' + titleRef + '" you want to share?'];
      push(s, c, st[i % st.length]);
    } else {
      // Semi-Structured: simple main question + ONE short easy follow-up
            const mainQs = tl
        ? ['Maaari mo bang ilarawan kung paano mo ginagawa ang ' + D.proc[procIdx] + ' ngayon?', 'Ano ang mga problema na may kinalaman sa ' + D.pain[painIdx] + ' na karaniwang nararanasan mo?', 'Ano ang pinakakailangan mo mula sa "' + titleRef + '"?', 'Ano ang mga rekord o impormasyon na ginagamit mo para sa "' + titleRef + '"?', 'Ano ang mga ulat o buod na pinakakadalas mong kailangan?', 'Paano mo gusto maipamalang tungkol sa "' + titleRef + '"?', 'Alin ang dapat maging una na automat?', 'Ano ang magpapatungo na "' + titleRef + '" para sa iyo?']
        : ['Can you describe how you handle ' + D.proc[procIdx] + ' today?', 'What problems related to ' + D.pain[painIdx] + ' do you usually experience?', 'What do you need most from "' + titleRef + '"?', 'What records or information do you use for "' + titleRef + '"?', 'What reports or summaries do you need most often?', 'How would you like to be updated about "' + titleRef + '"?', 'Which task should be automated first?', 'What would make "' + titleRef + '" successful for you?'];
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
async function generateQuestions(title, stakeholders, count, method, format, language) {
  count = Math.max(1, Math.min(50, parseInt(count) || 20));
  method = (method || 'Semi-Structured').trim();
  format = (format || 'Individual Interview').trim();
  if (!title || !title.trim()) throw Object.assign(new Error('title'), { code: 'VALIDATION' });
  if (!hasOpenAI()) return { questions: localQuestions(title.trim(), stakeholders, count, method, format, language), source: 'local-smart' };
    const sh = splitStakeholders(stakeholders).join(', ');
  const lang = normLang(language);
  const langPhrase = lang === 'Tagalog' ? 'simple, respectful, and natural conversational Tagalog' : 'plain, everyday English';
  const isStructured = method === 'Structured';
  const isUnstructured = method === 'Unstructured';
  const isSemi = !isStructured && !isUnstructured;

  const methodBlock = isStructured
    ? 'INTERVIEW METHOD: STRUCTURED (fixed survey-style questionnaire)\n' + 'RULES:\n' + '- Questions must be SHORT, simple and direct — like a survey form. Each is answerable in 1-2 sentences.\n' + '- Each question asks about ONE topic only (what, which, how many, how often).\n' + '- No follow-up questions. Not conversational. Same questions for every respondent.\n' + '- Keep the language ' + langPhrase + ' — avoid long compound questions.\n' + '- Cover: current process, problems, requirements, data/records, reports, desired features.'
    : isUnstructured
    ? 'INTERVIEW METHOD: UNSTRUCTURED (casual guided conversation)\n' + 'RULES:\n' + '- Questions must sound like FRIENDLY CONVERSATION — short, warm, easy to answer.\n' + '- Start broad (Tell me about…, What is it like…?, What do you find hardest…?).\n' + '- One idea per question. Never stack multiple questions into one sentence.\n' + '- Use ' + langPhrase + ' — the respondent should never need clarification to understand.\n' + '- The interview feels like a natural chat, NOT a questionnaire.'
        : 'INTERVIEW METHOD: SEMI-STRUCTURED (main questions + simple follow-ups)\n' + 'RULES:\n' + '- Main questions must be SIMPLE, short and open enough for a detailed answer.\n' + '- For each main question, add ONE short, easy follow-up question right after it.\n' + '- Follow-ups are simple clarifiers: Can you give an example? How often? What makes it hard?\n' + '- Keep both main and follow-up questions in ' + langPhrase + '.\n' + '- Clear structure but allows deeper exploration. Not identical to Structured style.';

  const formatBlock = format === 'Group Interview'
    ? '\n\nINTERVIEW FORMAT: GROUP INTERVIEW\n' + '- Questions should be easy to discuss in a group setting (multiple perspectives, consensus).'
    : '\n\nINTERVIEW FORMAT: INDIVIDUAL INTERVIEW\n' + '- Questions are for one-on-one interview with one stakeholder.';

  const prompt = 'You are an AI Interview Question Generator for an Information System Requirements Gathering System.\n\n' + 'IMPORTANT: Generate ALL questions in ' + langPhrase + '. Do not mix languages.\n\n' + 'Generate interview questions based on the following inputs:\n\n' + 'Interview Title: "' + title + '"\n' + 'Stakeholders: ' + sh + '\n' + 'Number of Questions: ' + count + '\n' + methodBlock + formatBlock + '\n\n' + 'GENERAL RULES:\n' + '- Questions must be relevant to the Interview Title and Stakeholders.\n' + '- IMPORTANT: keep every question SHORT (1-2 sentences) and SIMPLE — easy for any stakeholder to understand and answer quickly.\n' + '- Use ' + langPhrase + '. No jargon. No double-barreled (two-in-one) questions.\n' + '- Do not repeat questions.\n' + '- Avoid leading or biased questions.\n' + '- Focus on gathering useful information for system analysis and requirements.\n' + '- Generate exactly ' + count + ' questions.\n' + '- If the method is Semi-Structured, pair each main question with ONE short follow-up within the total.\n' + '- If the method is Structured, output only the main questions.\n' + '- If the method is Unstructured, output conversational questions only.\n\n' + 'Return ONLY valid JSON: an array of objects with keys "stakeholder", "category", "text". No markdown, no commentary.';

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
function localFollowUp(iv, lastQ, answer, language) {
  const tl = normLang(language) === 'Tagalog';
  const a = String(answer || '').toLowerCase();
  const snip = snippetOf(answer);
  const st = lastQ.stakeholder;
  const title = iv.title;
  if (/(manual|manually|paper|paperwork|handwritten|encode|encoding|retype|re-encode)/.test(a))
    return tl ? 'Nabanggit mo "' + snip + '". Alin ang partikular na bahagi ng manu-mano ng proseso na kumakatwiran ng oras, at ano ang karaniwang dahilan ng delay?' : 'You mentioned "' + snip + '". Which specific part of that manual process takes the most time, and what usually causes the delay?';
  if (/(slow|slower|long|time|takes|queue|delay|wait|waiting|backlog)/.test(a))
    return tl ? 'Sinabi mo "' + snip + '". Alin eksaktong hakbang ang pinakamatagal, at gaano kalaki ang oras na nawala dahil dito?' : 'You said "' + snip + '". Which step exactly takes the longest, and how much time is lost because of it?';
  if (/(error|errors|mistake|wrong|inaccurate|incorrect|missing|lost|lose|duplicate)/.test(a))
    return tl ? 'Kapag "' + snip + '" ay nangyayari, ano ang karaniwang dahilan, at paano mo ito inaayos ngayon?' : 'When "' + snip + '" happens, what is usually the cause, and how do you currently fix it?';
  if (/(difficult|hard|challenge|struggle|problem|issue|concern)/.test(a))
    return tl ? 'Maaari mo bang ilarawan ang isang partikular na sitwasyon kung saan "' + snip + '" ay naging problema? Ano ang epekto nito sa iyong trabaho bilang ' + st + '?' : 'Can you describe a specific situation where "' + snip + '" became a problem? What was the impact on your work as ' + st + '?';
  if (/(because|due to|since|cause|reason)/.test(a))
    return tl ? 'Dahil sa "' + snip + '", ano ang epekto nito sa natitirang proseso para sa "' + title + '"?' : 'Since "' + snip + '", what effect does that have on the rest of the process for "' + title + '"?';
  if (/(need|needs|want|should|must|wish|hope|prefer|feature)/.test(a))
    return tl ? 'Tungkol sa "' + snip + '" — ano ang partikular na tampok na lutasin iyon, at paano ito dapat gumana para sa ' + st + '?' : 'Regarding "' + snip + '" — what specific feature would address that, and how should it work for ' + st + '?';
  return tl ? 'Nabanggit mo "' + snip + '". Maaari mo bang bigyan ako ng isang partikular na halimbaga nito at paliwanag kung paano ito nakaapekto sa "' + title + '"?' : 'You mentioned "' + snip + '". Can you give me a specific example of that and explain how it affects "' + title + '"?';
}

/* Unstructured: fully adaptive — next question comes from the conversation itself,
   following Current Process → Problems → Causes → Effects → Needs → Features → Suggestions */
function localAdaptive(iv, qa, language) {
  const answered = qa.filter(q => q.answer && q.answer.trim());
  const t = iv.title;
  const st = (answered.length ? answered[answered.length - 1].stakeholder : (iv.stakeholders || '').split(',')[0].trim()) || 'General';
  const asked = qa.map(q => String(q.text).toLowerCase());
  const lastAns = answered.length ? answered[answered.length - 1].answer : '';
  const a = String(lastAns).toLowerCase();
  const askedAbout = (kw) => asked.some(x => x.includes(kw));
  const snip = snippetOf(lastAns);
  const fresh = (text) => !asked.some(x => x === String(text).toLowerCase());

    const stages = tl
    ? [{ test: () => answered.length === 0, text: 'Simula sa una, maaari mong sabihin kung ano ang iyong papel at iwalk ako sa kung paano ka kasalukuyang nagpapahalaga sa mga bagay na may kinalaman sa "' + t + '"?' },
       { test: () => /(problem|issue|difficult|hard|challenge|slow|manual|error|delay|queue|lost|wrong|concern)/.test(a) && !askedAbout('bakit'), text: 'Nabanggit mo "' + snip + '". Bakit mo iniisip na ito ay patuloy na nangyayari?' },
       { test: () => /(because|due to|since|reason|cause|manual)/.test(a) && !askedAbout('ano ang epekto'), text: 'Bubuo ng iyon na "' + snip + '", ano ang epekto nito sa mga tao at proseso na kasama sa "' + t + '"?' },
       { test: () => /(effect|impact|affect|results in|leads to|delays|affects|wait|waiting)/.test(a) && !askedAbout('ano pinakakailangan'), text: 'Tandaan ang mga epekto, ano ang pinakakailangan mo upang mas madaling gawin ang iyong trabaho?' },
       { test: () => /(need|needs|want|wish|hope|should|must|improve|better)/.test(a) && !askedAbout('ano ang dapat'), text: 'Kung ang "' + t + '" ay maaaring magsama ng isang tampok na lutasin ang nausap, ano ang dapat nitong gawin nang eksaktamente?' },
       { test: () => /(feature|function|automate|automation|online|digital|system)/.test(a) && !askedAbout('paano'), text: 'Paano kabuo nito ang paraan kung paano ka gumagawa araw-araw? May anumang alalahanin ka rin?' }]
    : [{ test: () => answered.length === 0, text: 'To begin, can you tell me about your role and walk me through how you currently handle things related to "' + t + '"?' },
       { test: () => /(problem|issue|difficult|hard|challenge|slow|manual|error|delay|queue|lost|wrong|concern)/.test(a) && !askedAbout('why do you think that keeps happening'), text: 'You mentioned "' + snip + '". Why do you think that keeps happening?' },
       { test: () => /(because|due to|since|reason|cause|manual)/.test(a) && !askedAbout('what effect does it have on the people'), text: 'Given that "' + snip + '", what effect does it have on the people and process involved in "' + t + '"?' },
       { test: () => /(effect|impact|affect|results in|leads to|delays|affects|wait|waiting)/.test(a) && !askedAbout('what do you need most'), text: 'Considering those effects, what do you need most to make your work easier?' },
       { test: () => /(need|needs|want|wish|hope|should|must|improve|better)/.test(a) && !askedAbout('what should it do exactly'), text: 'If "' + t + '" could include one feature to solve what we just discussed, what should it do exactly?' },
       { test: () => /(feature|function|automate|automation|online|digital|system)/.test(a) && !askedAbout('how would that feature change'), text: 'How would that feature change the way you work day to day? Do you have any concerns about it?' }];
  for (const s of stages) if (s.test()) return { text: s.text, stakeholder: st, category: 'Adaptive' };

  // Explore topics not yet covered
    const areas = tl
    ? [['records', 'Paano ginagampan ang mga rekord at impormasyon para sa "' + t + '", at saan karaniwang nawawala?'],
       ['reports', 'Ano ang mga ulat o buod na nais mong maging agad available para sa "' + t + '"?'],
       ['approval', 'Iwalk ako kung paano gumagana ang mga approval ngayon para sa "' + t + '" — saan karaniwang mabagal?'],
       ['redesign', 'Kung maaari kang redesignin ang isa sa "' + t + '" mula simula, paano ito dapat maging hitsura at bakit?']]
    : [['records', 'How are records and information currently kept for "' + t + '", and where do things usually get misplaced?'],
       ['reports', 'What reports or summaries do you wish you had instantly available for "' + t + '"?'],
       ['approval', 'Walk me through how approvals work today for "' + t + '" — where does it usually slow down?'],
       ['redesign', 'If you could redesign one part of "' + t + '" from scratch, what would it look like and why?']];
  for (const [kw, text] of areas) if (!askedAbout(kw)) return { text, stakeholder: st, category: 'Adaptive' };
    return { text: tl ? 'Bago tayo tapusin, may iba pang bagay tungkol sa "' + t + '" na hindi pa natin nausap na iniisip mo ay mahalaga para ibahagi?' : 'Before we wrap up, is there anything about "' + t + '" we have not covered that you think is important to share?', stakeholder: st, category: 'Adaptive' };
}

/* Generates the NEXT question from the interview context.
   mode: 'followup' (Semi-Structured) or 'adaptive' (Unstructured). */
async function nextQuestion(iv, qa, mode) {
  const answered = qa.filter(q => q.answer && q.answer.trim());
  const lastQ = answered.length ? answered[answered.length - 1] : null;
  const tl = normLang(iv.language) === 'Tagalog';
  if (!hasOpenAI()) {
    if (mode === 'followup') {
      if (!lastQ) return { text: tl ? 'Maaari mo bang sabihin sa akin pa kung paano mo kasalukuyang ginagawa ang iyong mga gawain na may kinalaman sa "' + iv.title + '"?' : 'Can you tell me more about how you currently handle your tasks related to "' + iv.title + '"?', category: 'Follow-up', source: 'local-smart' };
      return { text: localFollowUp(iv, lastQ, lastQ.answer, iv.language), category: 'Follow-up', source: 'local-smart' };
    }
    return { ...localAdaptive(iv, qa, iv.language), source: 'local-smart' };
  }
  const conv = qa.map(q => 'Q' + q.number + (q.isFollowUp ? ' (AI follow-up)' : '') + ' [' + q.stakeholder + '/' + q.category + ']: ' + q.text + '\nA: ' + (q.answer && q.answer.trim() ? q.answer : '(not answered yet)')).join('\n\n');
  const isFollowup = mode === 'followup';
  const prompt = 'You are conducting a ' + (iv.interviewMethod || 'Semi-Structured') + ' requirements-gathering interview for "' + iv.title + '" (Stakeholders: ' + iv.stakeholders + ', Format: ' + (iv.interviewFormat || 'Individual Interview') + ').\n'
    + 'IMPORTANT: Generate ALL questions in ' + (tl ? 'simple, respectful, and natural conversational Tagalog' : 'plain, everyday English') + '. Do not mix languages.\n\n'
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
  /* Extract Pain Points DIRECTLY from stakeholder answers */
  const NEG = /(manual|manually|slow|slower|long|takes|queue|delay|delayed|error|errors|problem|problems|difficult|hard|lost|lose|duplicate|conflict|backlog|wait|waiting|retype|paper|paperwork|bottleneck|inaccurate|missing|incomplete|issue|concern|complicated|confusing|expensive|costly)/i;
  const pains = [];
  answered.forEach(q => {
    String(q.answer).split(/[.;!\n]/).map(x => x.trim()).filter(x => x.length > 15 && NEG.test(x)).forEach(x => {
      if (pains.length < 6 && !pains.some(p => p.pain.toLowerCase() === x.toLowerCase())) pains.push({ pain: x, who: q.stakeholder });
    });
  });
  /* Recommendations mapped to each pain point */
  const RECS = [
    'Digitize this step in "' + iv.title + '" so it no longer depends on paper records.',
    'Automate this part of the process to save time and reduce human error.',
    'Add a central database for "' + iv.title + '" so records stay accurate and easy to retrieve.',
    'Add status notifications so stakeholders no longer need to follow up manually.',
    'Add input validation and role-based access to prevent duplicate or wrong entries.',
    'Create a dashboard for real-time monitoring of this area.'
  ];
  const painPoints = pains.length
    ? pains.map(p => p.pain + ' (from ' + p.who + ')')
    : D.pain.map(p => 'Recurring ' + p + ' reported across stakeholder groups.');
  const recommendations = pains.length
    ? pains.map((p, i) => 'Since "' + (p.pain.length > 70 ? p.pain.slice(0, 67) + '…' : p.pain) + '", we recommend: ' + RECS[i % RECS.length])
    : D.rec;
  return {
    summary: 'Stakeholders interviewed for "' + iv.title + '" (' + iv.stakeholders + ') described a largely manual process with repeated delays. ' + answered.length + ' of ' + qa.length + ' questions were answered, surfacing consistent themes around ' + (top.slice(0, 4).join(', ') || 'workflow, records, and approvals') + '. The AI identified ' + painPoints.length + ' pain point(s) from their answers and mapped each to a recommended solution below.',
    keyFindings: answered.slice(0, 6).map(q => q.stakeholder + ': "' + String(q.answer).slice(0, 140) + (String(q.answer).length > 140 ? '…' : '') + '"'),
    painPoints,
    majorIssues: pains.slice(0, 3).map(p => p.pain).concat(['Manual, paper-heavy steps slow down ' + iv.title]).slice(0, 3),
    recommendations,
    solutionIdeas: recommendations.map((r, i) => 'Phase ' + (i + 1) + ': implement the recommendation above, validated with ' + (splitStakeholders(iv.stakeholders)[i % Math.max(1, splitStakeholders(iv.stakeholders).length)] || 'key users') + '.'),
    observations: ['Response rate ' + answered.length + '/' + qa.length + ' - ' + (answered.length >= qa.length / 2 ? 'strong engagement' : 'follow-up interviews recommended'), 'Dominant themes: ' + (top.slice(0, 5).join(', ') || 'process efficiency')],
    priorities: ['Digitize intake and records first', 'Automate validation and approvals', 'Add notifications and reporting dashboards']
  };
}

async function analyzeInterview(iv, qa) {
  const answered = qa.filter(q => q.answer && q.answer.trim());
  if (!answered.length) throw Object.assign(new Error('no-answers'), { code: 'NO_ANSWERS' });
  if (!hasOpenAI()) return { analysis: localAnalysis(iv, qa), source: 'local-smart' };
  const qaText = qa.map(q => 'Q' + q.number + ' [' + q.stakeholder + '/' + q.category + ']: ' + q.text + '\nA: ' + (q.answer || '(no answer)')).join('\n\n');
  const prompt = 'Analyze this stakeholder interview and return ONLY valid JSON with keys: summary (string), keyFindings (array of strings), painPoints (array), majorIssues (array), recommendations (array), solutionIdeas (array), observations (array), priorities (array).\nInterview title: "' + iv.title + '"\nStakeholders: ' + iv.stakeholders + '\nInterview Method: ' + (iv.interviewMethod || 'N/A') + '\nInterview Format: ' + (iv.interviewFormat || 'N/A') + '\nDescription: ' + (iv.description || '-') + '\n\nQuestions & answers:\n' + qaText + '\n\nSTRICT RULES:\n1. painPoints: EVERY item must be a specific problem, difficulty, or inefficiency that the stakeholder ACTUALLY MENTIONED in their answers. Quote or closely paraphrase their own words and mention which stakeholder raised it, e.g. "Manual encoding of permits takes too much time (from Barangay Clerk)". Do NOT invent generic pain points.\n2. recommendations: for EACH pain point, give ONE concrete, actionable system suggestion that directly solves it. Format: "Since <pain point>, we recommend: <specific feature/solution for the system>". Make recommendations practical and specific to "' + iv.title + '" — not generic advice.\n3. summary: brief overview of what was interviewed, how many answered, and the main themes.\n4. Base every point on the actual answers. Use simple, professional English. Consider the interview method and format when analyzing responses.';
  const raw = await callOpenAI([{ role: 'system', content: 'You output only valid JSON objects.' }, { role: 'user', content: prompt }], 3500);
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return { analysis: JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1)), source: 'openai:' + MODEL };
}

/* ---- STEPS 1+4+5: dual-language survey questions (3-5) + 1-5 scoring ---- */
function localSurveyQuestions(stakeholder, language, topic) {
  const tl = normLang(language) === 'Tagalog';
  const who = stakeholder || 'stakeholder';
  if (tl) return [
    { id: 1, question: 'Kumusta po ang inyong karanasan tungkol sa "' + topic + '"? Maaari po ba ninyong ikuwento?' },
    { id: 2, question: 'Ano po ang pinakamalaking hamon o problema na nararanasan ninyo bilang ' + who + '?' },
    { id: 3, question: 'Aling bahagi po ng serbisyo ang pinakanasiyahan ninyo, at alin ang kailangang ayusin?' },
    { id: 4, question: 'Kung may isang bagay po kayong babaguhin agad, ano po ito at bakit?' },
    { id: 5, question: 'May mungkahi po ba kayo para mas mapabuti ang suporta sa mga ' + who + '?' }
  ];
  return [
    { id: 1, question: 'How would you describe your experience with "' + topic + '"?' },
    { id: 2, question: 'As a ' + who + ', what is the biggest challenge you currently face?' },
    { id: 3, question: 'Which part of the service satisfies you most, and which needs improvement?' },
    { id: 4, question: 'If one thing could be fixed immediately, what would it be and why?' },
    { id: 5, question: 'What suggestions do you have to better support ' + who + 's?' }
  ];
}

async function generateSurveyQuestions(stakeholder, language, topic) {
  const lang = normLang(language);
  const st = String(stakeholder || 'General').slice(0, 120);
  const tp = String(topic || 'General Survey').slice(0, 300);
  const fallback = () => ({ questions: localSurveyQuestions(st, lang, tp), source: 'local-smart' });
  // PRIMARY: OpenAI gpt-4o-mini with the dynamic interviewer prompt.
  if (hasOpenAI()) {
    try {
      const raw = await callOpenAI([
        { role: 'system', content: interviewerSystemPrompt(st, lang, tp) },
        { role: 'user', content: 'OUTPUT FORMAT (JSON ONLY): {"topic":"' + tp + '","stakeholder":"' + st + '","language":"' + lang + '","questions":[{"id":1,"question":"..."}]}' }
      ], 1200);
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const j = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
      if (j && Array.isArray(j.questions) && j.questions.length) {
        return { questions: j.questions.slice(0, 5).map((q, i) => ({ id: i + 1, question: String(q.question || q.text || '').slice(0, 2000) })), source: 'openai:' + MODEL };
      }
    } catch (e) { /* fall through to Ollama, then local */ }
  }
  // FALLBACK: local Ollama instance (offline-capable).
  try {
    const raw = await callOllama(interviewerSystemPrompt(st, lang, tp) + ' Reply with JSON ONLY: {"questions":[{"id":1,"question":"..."}]}. Topic: ' + tp);
    const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    if (j && Array.isArray(j.questions) && j.questions.length) {
      return { questions: j.questions.slice(0, 5).map((q, i) => ({ id: i + 1, question: String(q.question || q.text || '').slice(0, 2000) })), source: 'ollama:' + OLLAMA_MODEL };
    }
  } catch (e) { /* final fallback below */ }
  return fallback();
}

function localScoreEvaluation(answers, language) {
  const lang = normLang(language);
  const text = (answers || []).map(a => String((a && a.answer) || '')).join(' ').toLowerCase();
  const pos = ['maganda', 'maayos', 'salamat', 'nasiyahan', 'mabilis', 'good', 'great', 'satisfied', 'excellent', 'helpful', 'mabuti', 'okay'];
  const neg = ['mabagal', 'problema', 'kulang', 'mahirap', 'hindi', 'wala', 'sirain', 'bad', 'poor', 'slow', 'lacking', 'problem', 'worst', 'urgent'];
  let score = 3;
  pos.forEach(w => { if (text.includes(w)) score += 0.5; });
  neg.forEach(w => { if (text.includes(w)) score -= 0.5; });
  if (text.length < 20) score = Math.min(score, 3);
  score = Math.max(1, Math.min(5, Math.round(score)));
  const LEVELS = { 5: 'Very High', 4: 'High', 3: 'Moderate', 2: 'Low', 1: 'Very Low' };
  const MEAN = {
    5: { Tagalog: 'Napakapositibo — ganap na natugunan ang pangunahing pangangailangan.', English: 'Highly positive, critical needs fully met.' },
    4: { Tagalog: 'Positibo — kaunting pag-aayos na lang ang kailangan.', English: 'Positive outcome, minor adjustments needed.' },
    3: { Tagalog: 'Katamtaman — kailangan ng regular na pag-monitor.', English: 'Neutral/average condition, standard monitoring required.' },
    2: { Tagalog: 'Mababa — kailangan ng interbensyon, may malaking balakid.', English: 'Requires intervention, significant friction identified.' },
    1: { Tagalog: 'Napakababa — kailangan ng agarang aksyon.', English: 'Urgent action needed, severe blockers.' }
  };
  return { score, level: LEVELS[score], meaning: MEAN[score][lang] };
}

async function evaluateSurvey(stakeholder, language, topic, answers) {
  const lang = normLang(language);
  const qaText = (answers || []).map((a, i) => 'Q' + (i + 1) + ': ' + (a.question || '') + '\nA: ' + (a.answer || '(no answer)')).join('\n\n');
  const parse = (raw) => JSON.parse(String(raw).replace(/```json|```/g, '').trim().slice(String(raw).indexOf('{'), String(raw).lastIndexOf('}') + 1));
  // PRIMARY: OpenAI
  if (hasOpenAI()) {
    try {
      const raw = await callOpenAI([
        { role: 'system', content: evaluatorSystemPrompt(lang) },
        { role: 'user', content: 'Stakeholder: ' + stakeholder + '\nTopic: ' + topic + '\nLanguage: ' + lang + '\n\nAnswers:\n' + qaText }
      ], 1500);
      const j = parse(raw);
      const score = Math.max(1, Math.min(5, parseInt(j.score) || 3));
      return { evaluation: { score, level: j.level || 'Moderate', summary: String(j.summary || ''), meaning: String(j.meaning || ''), recommendations: Array.isArray(j.recommendations) ? j.recommendations : [] }, source: 'openai:' + MODEL };
    } catch (e) { /* try Ollama */ }
  }
  try {
    const raw = await callOllama(evaluatorSystemPrompt(lang) + '\nStakeholder: ' + stakeholder + '\nTopic: ' + topic + '\nAnswers:\n' + qaText + '\nReply JSON only.');
    const j = parse(raw);
    const score = Math.max(1, Math.min(5, parseInt(j.score) || 3));
    return { evaluation: { score, level: j.level || 'Moderate', summary: String(j.summary || ''), meaning: String(j.meaning || ''), recommendations: Array.isArray(j.recommendations) ? j.recommendations : [] }, source: 'ollama:' + OLLAMA_MODEL };
  } catch (e) { /* local heuristic */ }
  const l = localScoreEvaluation(answers, lang);
  const tl = lang === 'Tagalog';
  return {
    evaluation: {
      score: l.score, level: l.level,
      summary: tl ? 'Batay sa ' + (answers || []).length + ' na sagot, ang pangkalahatang marka ay ' + l.score + ' (' + l.level + ').' : 'Based on ' + (answers || []).length + ' answer(s), the overall score is ' + l.score + ' (' + l.level + ').',
      meaning: l.meaning,
      recommendations: tl ? ['Ipagpatuloy ang pag-monitor sa sektor na ito.', 'Tugunan ang mga nabanggit na hamon sa mga sagot.'] : ['Continue monitoring this sector.', 'Address the challenges mentioned in the answers.']
    },
    source: 'local-smart'
  };
}

module.exports = { hasOpenAI, MODEL, OLLAMA_URL, OLLAMA_MODEL, generateQuestions, analyzeInterview, localQuestions, nextQuestion, interviewerSystemPrompt, evaluatorSystemPrompt, generateSurveyQuestions, evaluateSurvey, localScoreEvaluation };
