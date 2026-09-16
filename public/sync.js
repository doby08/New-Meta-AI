/* STEP 1: Auto-sync manager — pushes Dexie outbox to central DB when online.
   Usage (survey page): SyncManager.saveLocal(payload) then SyncManager.trySync().
   Listens: window.addEventListener('online', trySync) + periodic retry. */
const SyncManager = (() => {
  const statusEl = () => document.getElementById('syncStatus');
  function setStatus(msg, mode) {
    const el = statusEl(); if (!el) return;
    el.textContent = msg;
    el.dataset.mode = mode || (navigator.onLine ? 'online' : 'offline');
  }
  async function pendingCount() {
    try { return await localDb.outbox.where('synced').equals(0).count(); }
    catch { return 0; }
  }
  async function refreshBadge() {
    const n = await pendingCount();
    if (!navigator.onLine) setStatus('📴 Offline — ' + n + ' na sagot ang nakatago sa device (auto-sync kapag online).', 'offline');
    else if (n > 0) setStatus('🔄 Online — sine-sync ang ' + n + ' na sagot…', 'syncing');
    else setStatus('✅ Online — lahat ng sagot ay naka-sync.', 'online');
    return n;
  }
  // Save locally FIRST (works offline), returns the local record.
  async function saveLocal(payload) {
    const rec = {
      clientId: payload.clientId || ('c_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)),
      stakeholder: payload.stakeholder || 'General',
      language: payload.language || 'Tagalog',
      topic: payload.topic || 'General Survey', topicId: payload.topicId || null,
      answers: payload.answers || [], deviceLabel: payload.deviceLabel || navigator.userAgent.slice(0, 120),
      createdAt: new Date().toISOString(), synced: 0, attempts: 0
    };
    await localDb.outbox.put(rec);
    await refreshBadge();
    return rec;
  }
  async function pushOne(rec) {
    const r = await fetch('/api/survey/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rec, autoEvaluate: true })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
    return j;
  }
  // Push all pending; marks synced=1 (keeps a local copy for history).
  async function trySync() {
    if (!navigator.onLine) { await refreshBadge(); return { synced: 0, pending: await pendingCount() }; }
    const pending = await localDb.outbox.where('synced').equals(0).toArray().catch(() => []);
    let synced = 0, lastReport = null;
    for (const rec of pending) {
      try {
        const j = await pushOne(rec);
        await localDb.outbox.update(rec.localId, { synced: 1, syncedAt: new Date().toISOString() });
        synced++;
        lastReport = j.report || lastReport;
      } catch (e) {
        try { await localDb.outbox.update(rec.localId, { attempts: (rec.attempts || 0) + 1, lastError: String(e.message || e).slice(0, 300) }); } catch {}
        break; // stop on first failure (likely still offline) — retry later
      }
    }
    await refreshBadge();
    return { synced, pending: await pendingCount(), report: lastReport };
  }
  function init() {
    window.addEventListener('online', () => { refreshBadge(); trySync(); });
    window.addEventListener('offline', () => refreshBadge());
    setInterval(() => { if (navigator.onLine) trySync(); }, 30000);
    document.addEventListener('DOMContentLoaded', () => { refreshBadge(); trySync(); });
  }
  return { init, saveLocal, trySync, refreshBadge, pendingCount };
})();
