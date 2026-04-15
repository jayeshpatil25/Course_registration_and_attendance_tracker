// ============================================================
// JWT Authentication & RBAC Middleware
// ============================================================
const jwt = require('jsonwebtoken');

/**
 * Verify JWT token from Authorization header.
 * Populates req.user = { id, role, ... }
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Role-based guard — returns middleware that only allows listed roles.
 * Usage: authorize('student')  or  authorize('instructor')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden. Insufficient privileges.' });
    }
    next();
  };
}

module.exports = { verifyToken, authorize };
