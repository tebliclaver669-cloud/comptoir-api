const express = require('express');
const prisma = require('../prisma');
const { authentifier } = require('../middleware/auth');

const router = express.Router();

const NOMS_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function calculerKpis(periodes) {
  const caTotal = periodes.reduce((s, p) => s + p.ventes, 0);
  const depensesTotal = periodes.reduce((s, p) => s + p.depenses, 0);

  let totalBenefice = 0;
  let totalPerte = 0;
  periodes.forEach((p) => {
    const resultat = p.ventes - p.depenses;
    if (resultat >= 0) {
      totalBenefice += resultat;
    } else {
      totalPerte += Math.abs(resultat);
    }
  });

  return {
    caTotal,
    depensesTotal,
    totalBenefice,
    totalPerte,
    pourcentageBenefice: caTotal === 0 ? 0 : Math.round((totalBenefice / caTotal) * 100),
    pourcentagePerte: caTotal === 0 ? 0 : Math.round((totalPerte / caTotal) * 100),
  };
}

// GET /api/statistiques/:nomEntreprise/annees : renvoie la liste
// des années disponibles pour cette entreprise, DEPUIS L'ANNÉE DE
// CRÉATION DE SON COMPTE jusqu'à l'année en cours -> permet au
// frontend de remplir le menu déroulant "Année" sans années
// antérieures à l'inscription (ce qui existait avant l'app n'est
// pas pris en compte, comme demandé).
router.get('/:nomEntreprise/annees', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({
    where: { nomEntreprise: req.params.nomEntreprise },
  });

  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const anneeCreation = entreprise.createdAt.getFullYear();
  const anneeActuelle = new Date().getFullYear();

  const annees = [];
  for (let a = anneeCreation; a <= anneeActuelle; a++) {
    annees.push(a);
  }

  res.json({ anneeCreation, anneeActuelle, annees });
});

// GET /api/statistiques/:nomEntreprise?vue=mensuel&annee=2026
// Calcule les 12 mois d'UNE année précise (ventes/dépenses par mois).
//
// GET /api/statistiques/:nomEntreprise?vue=annuel
// Calcule le total de CHAQUE année depuis la création du compte
// jusqu'à aujourd'hui, pour comparer les années entre elles.
router.get('/:nomEntreprise', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({
    where: { nomEntreprise: req.params.nomEntreprise },
  });

  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const vue = req.query.vue === 'annuel' ? 'annuel' : 'mensuel';
  const anneeCreation = entreprise.createdAt.getFullYear();
  const anneeActuelle = new Date().getFullYear();

  if (vue === 'annuel') {
    // Une année de début à la fin, sur TOUTE la période depuis la
    // création du compte -> un seul findMany suffit, plus efficace
    // que de refaire une requête par année.
    const debut = new Date(anneeCreation, 0, 1);
    const fin = new Date(anneeActuelle + 1, 0, 1);

    const mouvements = await prisma.mouvementStock.findMany({
      where: { entrepriseId: entreprise.id, dateMouvement: { gte: debut, lt: fin } },
      include: { produit: true },
    });

    const totauxParAnnee = {};
    for (let a = anneeCreation; a <= anneeActuelle; a++) {
      totauxParAnnee[a] = { ventes: 0, depenses: 0 };
    }

    mouvements.forEach((m) => {
      const annee = m.dateMouvement.getFullYear();
      if (m.type === 'sortie') {
        totauxParAnnee[annee].ventes += m.quantite * m.produit.prixVente;
      } else if (m.type === 'entree') {
        totauxParAnnee[annee].depenses += m.quantite * m.produit.prixAchat;
      }
    });

    const periodesAnnuelles = Object.keys(totauxParAnnee).map((annee) => ({
      label: annee,
      ventes: totauxParAnnee[annee].ventes,
      depenses: totauxParAnnee[annee].depenses,
    }));

    return res.json({ vue: 'annuel', periodes: periodesAnnuelles, kpis: calculerKpis(periodesAnnuelles) });
  }

  // Vue mensuel : une année précise (par défaut, l'année de
  // création si non fournie en query).
  const anneeDemandee = parseInt(req.query.annee, 10) || anneeCreation;
  const debutAnnee = new Date(anneeDemandee, 0, 1);
  const finAnnee = new Date(anneeDemandee + 1, 0, 1);

  const mouvements = await prisma.mouvementStock.findMany({
    where: { entrepriseId: entreprise.id, dateMouvement: { gte: debutAnnee, lt: finAnnee } },
    include: { produit: true },
  });

  const totauxParMois = NOMS_MOIS.map(() => ({ ventes: 0, depenses: 0 }));

  mouvements.forEach((m) => {
    const indexMois = m.dateMouvement.getMonth();
    if (m.type === 'sortie') {
      totauxParMois[indexMois].ventes += m.quantite * m.produit.prixVente;
    } else if (m.type === 'entree') {
      totauxParMois[indexMois].depenses += m.quantite * m.produit.prixAchat;
    }
  });

  const periodesMensuelles = NOMS_MOIS.map((label, index) => ({
    label,
    ventes: totauxParMois[index].ventes,
    depenses: totauxParMois[index].depenses,
  }));

  res.json({ vue: 'mensuel', annee: anneeDemandee, periodes: periodesMensuelles, kpis: calculerKpis(periodesMensuelles) });
});

module.exports = router;