const express = require('express');
const prisma = require('../prisma');
const { authentifier } = require('../middleware/auth');

const router = express.Router();

router.post('/', authentifier, async (req, res) => {
  const { nomEntreprise, produitId, quantite, vendeurId, remise } = req.body;

  if (!nomEntreprise || !produitId || !quantite) {
    return res.status(400).json({ erreur: 'Merci de fournir nomEntreprise, produitId et quantite.' });
  }

  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const produit = await prisma.produit.findUnique({ where: { id: produitId } });
  if (!produit) {
    return res.status(404).json({ erreur: 'Produit introuvable.' });
  }

  if (produit.stockActuel < quantite) {
    return res.status(400).json({ erreur: 'Stock insuffisant pour cette quantite.' });
  }

  const total = produit.prixVente * quantite;
  // Remise plafonnée au total de la ligne : jamais négative, jamais
  // au-delà de ce qui est vendu.
  const remiseAppliquee = Math.max(0, Math.min(parseInt(remise, 10) || 0, total));

  const vente = await prisma.vente.create({
    data: {
      quantite,
      prixUnitaire: produit.prixVente,
      total,
      remise: remiseAppliquee,
      produitId: produit.id,
      entrepriseId: entreprise.id,
      vendeurId: vendeurId || null,
    },
  });

  await prisma.produit.update({
    where: { id: produit.id },
    data: { stockActuel: produit.stockActuel - quantite },
  });

  await prisma.mouvementStock.create({
    data: {
      type: 'sortie',
      quantite,
      produitId: produit.id,
      entrepriseId: entreprise.id,
      vendeurId: vendeurId || null,
    },
  });

  res.status(201).json(vente);
});
router.post('/panier', authentifier, async (req, res) => {
  const { nomEntreprise, items } = req.body;

  if (!nomEntreprise || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ erreur: 'Merci de fournir nomEntreprise et un panier (items) non vide.' });
  }

  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const vendeurId = req.utilisateur.role === 'vendeur' ? req.utilisateur.vendeurId : null;

  // ------------------------------------------------------------
  // ÉTAPE 1 : on vérifie TOUT le panier AVANT de toucher à quoi
  // que ce soit en base. Si un ou plusieurs produits posent
  // problème (introuvable ou stock insuffisant), on les liste tous
  // d'un coup dans "erreurs", SANS valider aucune vente -> le
  // vendeur peut alors retirer précisément les produits en cause
  // et revalider le reste, plutôt que de tout recommencer.
  // ------------------------------------------------------------
  const erreurs = [];
  const itemsValides = [];

  for (const item of items) {
    const produit = await prisma.produit.findUnique({ where: { id: item.produitId } });

    if (!produit) {
      erreurs.push({ produitId: item.produitId, message: 'Produit introuvable.' });
      continue;
    }

    if (produit.stockActuel < item.quantite) {
      erreurs.push({
        produitId: item.produitId,
        nom: produit.nom,
        message: `Stock insuffisant pour "${produit.nom}" (disponible : ${produit.stockActuel}).`,
        stockDisponible: produit.stockActuel,
      });
      continue;
    }

    itemsValides.push({ item, produit });
  }

  if (erreurs.length > 0) {
    return res.status(409).json({
      erreur: 'Certains produits du panier ne peuvent pas être vendus tels quels.',
      produitsProblematiques: erreurs,
    });
  }

  // ------------------------------------------------------------
  // ÉTAPE 2 : tout le panier est valide -> on enregistre vraiment,
  // dans une transaction (tout ou rien en cas de souci imprévu au
  // moment précis de l'écriture). Chaque ligne peut porter sa propre
  // remise (item.remise, en CFA) — envoyée par le panier, qu'elle
  // vise tout le panier (répartie au prorata côté frontend) ou un
  // seul produit. On la reclamp ici par sécurité : jamais négative,
  // jamais au-delà du total de sa propre ligne.
  // ------------------------------------------------------------
  try {
    const resultat = await prisma.$transaction(async (tx) => {
      const ventesCreees = [];

      for (const { item, produit } of itemsValides) {
        const total = produit.prixVente * item.quantite;
        const remiseAppliquee = Math.max(0, Math.min(parseInt(item.remise, 10) || 0, total));

        const vente = await tx.vente.create({
          data: {
            quantite: item.quantite,
            prixUnitaire: produit.prixVente,
            total,
            remise: remiseAppliquee,
            produitId: produit.id,
            entrepriseId: entreprise.id,
            vendeurId,
          },
        });

        await tx.produit.update({
          where: { id: produit.id },
          data: { stockActuel: produit.stockActuel - item.quantite },
        });

        await tx.mouvementStock.create({
          data: {
            type: 'sortie',
            quantite: item.quantite,
            produitId: produit.id,
            entrepriseId: entreprise.id,
            vendeurId,
          },
        });

        ventesCreees.push(vente);
      }

      return ventesCreees;
    });

    res.status(201).json(resultat);
  } catch (erreur) {
    res.status(400).json({ erreur: erreur.message });
  }
});

// GET /api/ventes/:nomEntreprise/jour : liste des produits vendus
// AUJOURD'HUI (de 00h00 à minuit, heure du serveur). Le gérant voit
// toutes les ventes de son entreprise ; un vendeur ne voit que les
// siennes.
router.get('/:nomEntreprise/jour', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise: req.params.nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  if (entreprise.id !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: 'Accès refusé.' });
  }

  const debutDuJour = new Date();
  debutDuJour.setHours(0, 0, 0, 0);
  const debutDemain = new Date(debutDuJour);
  debutDemain.setDate(debutDemain.getDate() + 1);

  const where = {
    entrepriseId: entreprise.id,
    dateVente: { gte: debutDuJour, lt: debutDemain },
  };
  if (req.utilisateur.role === 'vendeur') {
    where.vendeurId = req.utilisateur.vendeurId;
  }

  const ventes = await prisma.vente.findMany({
    where,
    include: { produit: true, vendeur: true },
    orderBy: { dateVente: 'desc' },
  });

  res.json(
    ventes.map((v) => ({
      id: v.id,
      dateVente: v.dateVente,
      produit: v.produit.nom,
      quantite: v.quantite,
      prixUnitaire: v.prixUnitaire,
      total: v.total,
      remise: v.remise,
      vendeur: v.vendeur ? v.vendeur.nomPrenoms : 'Gérant',
    }))
  );
});

router.get('/:nomEntreprise', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise: req.params.nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const ventes = await prisma.vente.findMany({
    where: { entrepriseId: entreprise.id },
    include: { produit: true, vendeur: true },
    orderBy: { dateVente: 'desc' },
  });

  res.json(ventes);
});

module.exports = router;