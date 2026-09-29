const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../prisma');
const { creerToken } = require('../utils/jwt');

const router = express.Router();

// POST /api/auth/connexion : connexion gérant OU vendeur. Le nom +
// mot de passe saisis suffisent à identifier automatiquement le
// rôle, sans que la personne ait à le préciser elle-même. Refusée
// tant que l'email de l'entreprise n'a pas été confirmé.
router.post('/connexion', async (req, res) => {
  const { nomEntreprise, nom, motDePasse } = req.body;

  if (!nomEntreprise || !nom || !motDePasse) {
    return res.status(400).json({ erreur: 'Merci de fournir nomEntreprise, nom et motDePasse.' });
  }

  const entreprise = await prisma.entreprise.findUnique({
    where: { nomEntreprise },
    include: { vendeurs: true },
  });

  if (!entreprise) {
    return res.status(401).json({ erreur: 'Entreprise introuvable.' });
  }

  if (!entreprise.emailConfirme) {
    return res.status(403).json({ erreur: 'Merci de confirmer votre adresse email avant de vous connecter.' });
  }

  if (entreprise.nomGerant === nom) {
    const motDePasseOk = await bcrypt.compare(motDePasse, entreprise.motDePasseHash);
    if (motDePasseOk) {
      const token = creerToken({ role: 'gerant', entrepriseId: entreprise.id, nomEntreprise: entreprise.nomEntreprise });
      return res.json({ token, role: 'gerant', nomEntreprise: entreprise.nomEntreprise, nom: entreprise.nomGerant });
    }
  }

  for (const vendeur of entreprise.vendeurs) {
    if (vendeur.nomPrenoms === nom) {
      const motDePasseOk = await bcrypt.compare(motDePasse, vendeur.motDePasseHash);
      if (motDePasseOk) {
        const token = creerToken({
          role: 'vendeur',
          entrepriseId: entreprise.id,
          nomEntreprise: entreprise.nomEntreprise,
          vendeurId: vendeur.id,
        });

        // Statut "en ligne" visible par le gérant (Paramètres > Vendeurs).
        await prisma.connexion.create({
          data: { type: 'connexion', vendeurId: vendeur.id, entrepriseId: entreprise.id },
        });

        return res.json({ token, role: 'vendeur', nomEntreprise: entreprise.nomEntreprise, nom: vendeur.nomPrenoms });
      }
    }
  }

  res.status(401).json({ erreur: 'Nom ou mot de passe incorrect.' });
});

// POST /api/auth/connexion-admin : connexion de l'unique compte
// admin de la plateforme (identifiant + mot de passe).
router.post('/connexion-admin', async (req, res) => {
  const { identifiant, motDePasse } = req.body;

  if (!identifiant || !motDePasse) {
    return res.status(400).json({ erreur: "Merci de fournir l'identifiant et le mot de passe." });
  }

  const admin = await prisma.admin.findUnique({ where: { identifiant } });
  if (!admin) {
    return res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect.' });
  }

  const motDePasseOk = await bcrypt.compare(motDePasse, admin.motDePasseHash);
  if (!motDePasseOk) {
    return res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect.' });
  }

  const token = creerToken({ role: 'admin', adminId: admin.id });
  res.json({ token, role: 'admin' });
});

module.exports = router;