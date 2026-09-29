const express = require('express');
const prisma = require('../prisma');
const { authentifier } = require('../middleware/auth');

const router = express.Router();

// POST /api/connexions/entree : enregistre qu'un vendeur vient de
// se connecter. Appelé juste après une connexion réussie côté
// frontend (le vendeur a déjà son token à ce moment-là).
router.post('/entree', authentifier, async (req, res) => {
  if (req.utilisateur.role !== 'vendeur') {
    return res.status(403).json({ erreur: 'Seul un vendeur peut enregistrer une connexion.' });
  }

  const connexion = await prisma.connexion.create({
    data: {
      type: 'connexion',
      vendeurId: req.utilisateur.vendeurId,
      entrepriseId: req.utilisateur.entrepriseId,
    },
  });

  res.status(201).json(connexion);
});

// POST /api/connexions/sortie : enregistre qu'un vendeur vient de
// se déconnecter (appelé au clic sur "Déconnexion").
router.post('/sortie', authentifier, async (req, res) => {
  if (req.utilisateur.role !== 'vendeur') {
    return res.status(403).json({ erreur: 'Seul un vendeur peut enregistrer une deconnexion.' });
  }

  const connexion = await prisma.connexion.create({
    data: {
      type: 'deconnexion',
      vendeurId: req.utilisateur.vendeurId,
      entrepriseId: req.utilisateur.entrepriseId,
    },
  });

  res.status(201).json(connexion);
});

// GET /api/connexions/:nomEntreprise : historique complet des
// connexions/déconnexions de tous les vendeurs d'une entreprise,
// PLUS le statut "en ligne" de chacun (déduit du DERNIER événement
// enregistré pour ce vendeur : si c'est une "connexion", il est en
// ligne ; si c'est une "deconnexion" ou s'il n'a jamais rien fait,
// il est hors ligne).
router.get('/:nomEntreprise', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({
    where: { nomEntreprise: req.params.nomEntreprise },
    include: { vendeurs: true },
  });

  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const historique = await prisma.connexion.findMany({
    where: { entrepriseId: entreprise.id },
    include: { vendeur: { select: { nomPrenoms: true } } },
    orderBy: { dateHeure: 'desc' },
  });

  // Statut en ligne par vendeur : on cherche, pour chaque vendeur,
  // son événement le plus récent dans l'historique déjà trié
  // (desc), donc le PREMIER trouvé dans la liste pour ce vendeur.
  const statutParVendeur = entreprise.vendeurs.map((v) => {
    const dernierEvenement = historique.find((h) => h.vendeurId === v.id);
    return {
      vendeurId: v.id,
      nomPrenoms: v.nomPrenoms,
      enLigne: dernierEvenement ? dernierEvenement.type === 'connexion' : false,
    };
  });

  const historiqueFormate = historique.map((h) => ({
    id: h.id,
    type: h.type,
    dateHeure: h.dateHeure,
    nomPrenoms: h.vendeur.nomPrenoms,
  }));

  res.json({ statuts: statutParVendeur, historique: historiqueFormate });
});

module.exports = router;