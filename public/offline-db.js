/* STEP 1: Local browser database via Dexie.js (IndexedDB).
   Load order in survey.html: dexie CDN script, then this file, then sync.js.
   Outbox pattern: field answers are saved locally FIRST even with no internet,
   then sync.js pushes them to the central DB when online. */
/* global Dexie */
const localDb = new Dexie('ai_survey_offline');
localDb.version(1).stores({
  // pending survey submissions waiting for upload
  outbox: '++localId, clientId, stakeholder, language, createdAt, synced',
  // cached topics/questions so the form still loads fully offline
  topicsCache: 'id, stakeholder, language',
  questionsCache: 'key, updatedAt'
});
async function outboxCount() { try { return await localDb.outbox.where('synced').equals(0).count(); } catch { return 0; } }
