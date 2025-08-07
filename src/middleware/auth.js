const db = require('../database');
const { devLog } = require('../utils/dev');

function requireAuth(req, res, next) {
  devLog('requireAuth check - session userId:', req.session?.userId);
  if (!req.session?.userId || typeof req.session.userId !== 'number') {
    devLog('No session userId, redirecting to login');
    return res.redirect('/');
  }
  next();
}

function requireApiAuth(req, res, next) {
  if (!req.session?.userId || typeof req.session.userId !== 'number') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId || typeof req.session.userId !== 'number') {
    return res.redirect('/');
  }
  
  // If isAdmin is already in session, use it (for tests and performance)
  if (req.session.isAdmin !== undefined) {
    if (!req.session.isAdmin) {
      return res.redirect('/');
    }
    return next();
  }
  
  // Check if user is admin
  db.get(`SELECT is_admin FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err) {
      console.error('Error checking admin status:', err);
      return res.status(500).send('Internal server error');
    }
    
    if (!user || !user.is_admin) {
      return res.redirect('/');
    }
    
    next();
  });
}

function requireApiAdmin(req, res, next) {
  if (!req.session?.userId || typeof req.session.userId !== 'number') {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // If isAdmin is already in session, use it (for tests and performance)
  if (req.session.isAdmin !== undefined) {
    if (!req.session.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return next();
  }
  
  // Check if user is admin
  db.get(`SELECT is_admin FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
    if (err) {
      console.error('Error checking admin status:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  });
}

module.exports = {
  requireAuth,
  requireApiAuth,
  requireAdmin,
  requireApiAdmin,
};