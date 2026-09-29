const jwt = require('jsonwebtoken');

const DUREE_TOKEN = '8h';

function creerToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: DUREE_TOKEN });
}

function verifierToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { creerToken, verifierToken };