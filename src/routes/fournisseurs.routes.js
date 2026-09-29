const express = require('express');
const prisma = require('../prisma');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', authentifier, exigerRole('gerant'), async (req, res) => {
  const { nomEntreprise, nom, telephone } = req.body;

  if (!nomEntreprise || !nom || !telephone) {
    return res.status(400).json({ erreur: 'Merci de fournir nomEntreprise, nom et telephone.' });
  }

  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const fournisseur = await prisma.fournisseur.create({
    data: {
      nom,
      telephone,
      entrepriseId: entreprise.id,
    },
  });

  res.status(201).json(fournisseur);
});

router.get('/:nomEntreprise', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise: req.params.nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const fournisseurs = await prisma.fournisseur.findMany({
    where: { entrepriseId: entreprise.id },
    orderBy: { nom: 'asc' },
  });

  res.json(fournisseurs);
});

module.exports = router;