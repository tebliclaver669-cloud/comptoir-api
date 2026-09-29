const express = require('express');
const prisma = require('../prisma');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();

// Résout fournisseurNom/fournisseurTel en un fournisseurId :
// - fournisseurNom absent (undefined) -> on garde fournisseurIdActuel
//   tel quel (rien à changer, ex. lors d'une fusion sans fournisseur
//   précisé) ;
// - fournisseurNom vide/blanc -> on retire le lien (null) ;
// - sinon -> réutilise un Fournisseur existant du même nom pour cette
//   entreprise (et met à jour son téléphone), ou en crée un nouveau.
// Utilisée à la fois par POST (création) et PUT (modification), pour
// que le fournisseur saisi à la création soit traité exactement comme
// celui saisi via le crayon.
async function resoudreFournisseurId({ fournisseurNom, fournisseurTel, entrepriseId, fournisseurIdActuel }) {
  if (fournisseurNom === undefined) {
    return fournisseurIdActuel;
  }

  const nomNettoye = (fournisseurNom || '').trim();

  if (!nomNettoye) {
    return null;
  }

  const fournisseurExistant = await prisma.fournisseur.findFirst({
    where: {
      entrepriseId,
      nom: { equals: nomNettoye, mode: 'insensitive' },
    },
  });

  if (fournisseurExistant) {
    const misAJour = await prisma.fournisseur.update({
      where: { id: fournisseurExistant.id },
      data: { telephone: fournisseurTel || fournisseurExistant.telephone },
    });
    return misAJour.id;
  }

  const nouveau = await prisma.fournisseur.create({
    data: {
      nom: nomNettoye,
      telephone: fournisseurTel || '',
      entrepriseId,
    },
  });
  return nouveau.id;
}

// POST /api/produits : crée un produit — OU, si un produit de MÊME
// NOM et MÊME CATÉGORIE existe déjà (et n'est pas archivé) pour
// cette entreprise, fusionne avec lui (augmente son stock, met à
// jour ses prix) au lieu de créer une ligne en double. Le fournisseur
// (fournisseurNom/fournisseurTel) est résolu/créé ici via
// resoudreFournisseurId, comme pour le PUT.
router.post('/', authentifier, exigerRole('gerant'), async (req, res) => {
  const { nomEntreprise, nom, categorie, prixAchat, prixVente, stockActuel, seuilAlerte, fournisseurNom, fournisseurTel } = req.body;

  if (!nomEntreprise || !nom || !categorie || prixAchat == null || prixVente == null) {
    return res.status(400).json({ erreur: 'Merci de remplir tous les champs obligatoires.' });
  }

  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const quantiteAjoutee = stockActuel || 0;

  const produitExistant = await prisma.produit.findFirst({
    where: {
      entrepriseId: entreprise.id,
      estArchive: false,
      nom: { equals: nom, mode: 'insensitive' },
      categorie: { equals: categorie, mode: 'insensitive' },
    },
  });

  const fournisseurId = await resoudreFournisseurId({
    fournisseurNom,
    fournisseurTel,
    entrepriseId: entreprise.id,
    fournisseurIdActuel: produitExistant?.fournisseurId ?? null,
  });

  // Produit (créé ou fusionné) et mouvement d'entrée créés ensemble
  // (transaction : tout ou rien).
  const produit = await prisma.$transaction(async (tx) => {
    let resultat;

    if (produitExistant) {
      resultat = await tx.produit.update({
        where: { id: produitExistant.id },
        data: {
          prixAchat,
          prixVente,
          stockActuel: produitExistant.stockActuel + quantiteAjoutee,
          seuilAlerte: seuilAlerte ?? produitExistant.seuilAlerte,
          fournisseurId,
        },
      });
    } else {
      resultat = await tx.produit.create({
        data: {
          nom,
          categorie,
          prixAchat,
          prixVente,
          stockActuel: quantiteAjoutee,
          seuilAlerte: seuilAlerte || 0,
          entrepriseId: entreprise.id,
          fournisseurId,
        },
      });
    }

    if (quantiteAjoutee > 0) {
      await tx.mouvementStock.create({
        data: {
          type: 'entree',
          quantite: quantiteAjoutee,
          produitId: resultat.id,
          entrepriseId: entreprise.id,
        },
      });
    }

    return resultat;
  });

  const produitAvecFournisseur = await prisma.produit.findUnique({
    where: { id: produit.id },
    include: { fournisseur: true },
  });

  res.status(201).json(produitAvecFournisseur);
});

// GET /api/produits/:nomEntreprise : le stock actif — les produits
// archivés (supprimés alors qu'ils avaient déjà été vendus) sont
// exclus, ils ne doivent plus apparaître nulle part dans le stock.
router.get('/:nomEntreprise', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise: req.params.nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const produits = await prisma.produit.findMany({
    where: { entrepriseId: entreprise.id, estArchive: false },
    include: { fournisseur: true },
    orderBy: { nom: 'asc' },
  });

  res.json(produits);
});

// PUT /api/produits/:id : modifie un produit — y compris son
// fournisseur (fournisseurNom/fournisseurTel), résolu via
// resoudreFournisseurId (voir plus haut).
router.put('/:id', authentifier, exigerRole('gerant'), async (req, res) => {
  const produit = await prisma.produit.findUnique({ where: { id: req.params.id } });
  if (!produit) {
    return res.status(404).json({ erreur: 'Produit introuvable.' });
  }
  if (produit.entrepriseId !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: 'Accès refusé.' });
  }

  const { nom, categorie, prixAchat, prixVente, stockActuel, seuilAlerte, fournisseurNom, fournisseurTel } = req.body;

  const fournisseurId = await resoudreFournisseurId({
    fournisseurNom,
    fournisseurTel,
    entrepriseId: produit.entrepriseId,
    fournisseurIdActuel: produit.fournisseurId,
  });

  const produitMisAJour = await prisma.produit.update({
    where: { id: produit.id },
    data: {
      nom: nom ?? produit.nom,
      categorie: categorie ?? produit.categorie,
      prixAchat: prixAchat ?? produit.prixAchat,
      prixVente: prixVente ?? produit.prixVente,
      stockActuel: stockActuel ?? produit.stockActuel,
      seuilAlerte: seuilAlerte ?? produit.seuilAlerte,
      fournisseurId,
    },
    include: { fournisseur: true },
  });

  res.json(produitMisAJour);
});

// DELETE /api/produits/:id : retire le produit du stock actif.
// - Si ce produit n'a JAMAIS été vendu -> suppression définitive
//   (comme avant), avec ses mouvements de stock.
// - Si ce produit a déjà été vendu -> on ne peut pas le supprimer
//   sans casser l'historique des ventes, donc on l'ARCHIVE à la
//   place (il disparaît du stock actif mais reste en base, ses
//   ventes passées restent intactes).
router.delete('/:id', authentifier, exigerRole('gerant'), async (req, res) => {
  const produit = await prisma.produit.findUnique({ where: { id: req.params.id } });
  if (!produit) {
    return res.status(404).json({ erreur: 'Produit introuvable.' });
  }

  if (produit.entrepriseId !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: 'Accès refusé.' });
  }

  const nombreVentes = await prisma.vente.count({ where: { produitId: produit.id } });

  if (nombreVentes > 0) {
    await prisma.produit.update({
      where: { id: produit.id },
      data: { estArchive: true },
    });

    return res.status(200).json({
      archive: true,
      message: `« ${produit.nom} » a déjà été vendu : il a été retiré du stock mais reste conservé pour l'historique des ventes.`,
    });
  }

  await prisma.$transaction([
    prisma.mouvementStock.deleteMany({ where: { produitId: produit.id } }),
    prisma.produit.delete({ where: { id: produit.id } }),
  ]);

  res.status(204).end();
});

module.exports = router;