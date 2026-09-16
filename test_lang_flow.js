// Quick test: verify the language flow end-to-end
const ai = require('./ai');
const db = require('./db');

console.log('=== Language Flow Verification ===');
console.log('');

// 1. normLang helper
console.log('1. normLang helper:');
console.log('   normLang("TL"):', ai.normLang('TL'));
console.log('   normLang("Tagalog"):', ai.normLang('Tagalog'));
console.log('   normLang("EN"):', ai.normLang('EN'));
console.log('   normLang("English"):', ai.normLang('English'));
console.log('');

// 2. Generate questions prompt preview (language embedded in prompt)
// We can't call OpenAI without a key, but we can check the localQuestions fallback
console.log('2. localQuestions with Tagalog:');
const tlQuestions = ai.localQuestions('Test Interview', 'Student', 3, 'Semi-Structured', 'Individual Interview', 'Tagalog');
console.log('   Count:', tlQuestions.length);
if (tlQuestions.length > 0) {
  console.log('   First Q:', tlQuestions[0].text.substring(0, 80) + '...');
  console.log('   Language check: contains Tagalog words?', /ano|paano|sino|saan|ano|bilang|marami/i.test(tlQuestions[0].text));
}
console.log('');

console.log('3. localQuestions with English:');
const enQuestions = ai.localQuestions('Test Interview', 'Student', 3, 'Semi-Structured', 'Individual Interview', 'English');
console.log('   Count:', enQuestions.length);
if (enQuestions.length > 0) {
  console.log('   First Q:', enQuestions[0].text.substring(0, 80) + '...');
  console.log('   Language check: contains English (not Tagalog)?', /^[A-Za-z0-9\s,\.\?\!\'\"\-\(\)]+$/.test(enQuestions[0].text.substring(0, 40)));
}
console.log('');

console.log('4. generateQuestions (full function, falls to local):');
try {
  const result = ai.generateQuestions('Web-Based Enrollment System', 'Students, Registrars', 5, 'Semi-Structured', 'Individual Interview', 'Tagalog');
  console.log('   Type:', typeof result);
  if (result && result.questions) {
    console.log('   Questions returned:', result.questions.length);
    console.log('   First Q:', result.questions[0].text.substring(0, 80) + '...');
    console.log('   Source:', result.source);
  } else if (result && result.questions === undefined) {
    console.log('   Result keys:', Object.keys(result));
  }
} catch (e) {
  console.log('   Error:', e.message);
}
console.log('');

console.log('5. normLang inside generateQuestions for "TL":');
const tl = ai.normLang('TL') === 'Tagalog';
console.log('   Is Tagalog?', tl);
console.log('');

console.log('=== Done ===');
