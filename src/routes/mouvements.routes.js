const express = require('express');
const prisma = require('../prisma');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', authentifier, async (req, res) => {
  const { nomEntreprise, produitId, type, quantite } = req.body;
  // On ne fait JAMAIS confiance à un vendeurId envoyé par le client :
  // on utilise l'identité vérifiée par le token (req.utilisateur),
  // rempli uniquement si la personne connectée est bien un vendeur.
  const vendeurId = req.utilisateur.role === 'vendeur' ? req.utilisateur.vendeurId : null;

  if (!nomEntreprise || !produitId || !type || !quantite) {
    return res.status(400).json({ erreur: 'Merci de fournir nomEntreprise, produitId, type et quantite.' });
  }

  if (type !== 'entree' && type !== 'casse') {
    return res.status(400).json({ erreur: 'Le type doit etre "entree" ou "casse".' });
  }

  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const produit = await prisma.produit.findUnique({ where: { id: produitId } });
  if (!produit) {
    return res.status(404).json({ erreur: 'Produit introuvable.' });
  }

  if (type === 'casse' && produit.stockActuel < quantite) {
    return res.status(400).json({ erreur: 'Stock insuffisant pour cette casse.' });
  }

  const nouveauStock = type === 'entree'
    ? produit.stockActuel + quantite
    : produit.stockActuel - quantite;

  await prisma.produit.update({
    where: { id: produit.id },
    data: { stockActuel: nouveauStock },
  });

  const mouvement = await prisma.mouvementStock.create({
    data: {
      type,
      quantite,
      produitId: produit.id,
      entrepriseId: entreprise.id,
      vendeurId: vendeurId || null,
    },
  });

  res.status(201).json(mouvement);
});

// GET /api/mouvements/:nomEntreprise/depenses : les dépenses d'achat de
// stock, c'est-à-dire chaque ENTRÉE de stock avec son montant
// (quantité x prix d'achat du produit), sa date et son heure.
// Réservé au gérant.
router.get('/:nomEntreprise/depenses', authentifier, exigerRole('gerant'), async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise: req.params.nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  if (entreprise.id !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: 'Accès refusé.' });
  }

  const entrees = await prisma.mouvementStock.findMany({
    where: { entrepriseId: entreprise.id, type: 'entree' },
    include: { produit: true },
    orderBy: { dateMouvement: 'desc' },
  });

  const depenses = entrees.map((m) => ({
    id: m.id,
    dateMouvement: m.dateMouvement,
    produit: m.produit.nom,
    quantite: m.quantite,
    prixAchat: m.produit.prixAchat,
    montant: m.quantite * m.produit.prixAchat,
  }));

  const total = depenses.reduce((somme, d) => somme + d.montant, 0);

  res.json({ total, depenses });
});

router.get('/:nomEntreprise', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise: req.params.nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const mouvements = await prisma.mouvementStock.findMany({
    where: { entrepriseId: entreprise.id },
    include: { produit: true, vendeur: true },
    orderBy: { dateMouvement: 'desc' },
  });

  res.json(mouvements);
});

module.exports = router;