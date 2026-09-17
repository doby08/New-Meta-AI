/* Administrator-only QR survey draft creation. */
module.exports = function (app, db, ai) {
  const requireAdmin = (req, res, next) => {
    const user = req.session && req.session.userId ? db.getUserById(req.session.userId) : null;
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated. Please log in.' });
    if (user.role !== 'Administrator') return res.status(403).json({ ok: false, error: 'Administrator access required.' });
    req.user = user;
    next();
  };

  app.post('/api/qr-surveys', requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      if (typeof b.title !== 'string' || !b.title.trim()) return res.status(400).json({ ok: false, error: 'Please enter a Title/Topic.' });
      if (typeof b.stakeholder !== 'string' || !b.stakeholder.trim()) return res.status(400).json({ ok: false, error: 'Please select a Stakeholder.' });
      const survey = db.createQrSurvey(req.user.id, {
        title: b.title.trim(), stakeholder: b.stakeholder.trim(),
        language: b.language || 'Tagalog', questionCount: b.questionCount || 5
      });
      res.json({ ok: true, survey: db.listQrSurveys({ userId: req.user.id }).find(s => s.id === survey.id) });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'Create failed: ' + e.message });
    }
  });
};
