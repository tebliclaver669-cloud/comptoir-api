const { verifierToken } = require('../utils/jwt');

function authentifier(req, res, next) {
  const enTete = req.headers.authorization;
  if (!enTete || !enTete.startsWith('Bearer ')) {
    return res.status(401).json({ erreur: 'Authentification requise.' });
  }

  try {
    req.utilisateur = verifierToken(enTete.slice(7));
    next();
  } catch {
    return res.status(401).json({ erreur: 'Session invalide ou expiree.' });
  }
}

function exigerRole(...rolesAutorises) {
  return (req, res, next) => {
    if (!rolesAutorises.includes(req.utilisateur?.role)) {
      return res.status(403).json({ erreur: 'Acces refuse pour ce role.' });
    }
    next();
  };
}

module.exports = { authentifier, exigerRole };