const express = require('express');
const prisma = require('../prisma');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();

// Toutes les routes ci-dessous exigent d'être connecté ET d'avoir
// le rôle 'admin' — cette ligne s'applique à TOUTES les routes
// définies après elle dans ce fichier, pas besoin de la répéter.
router.use(authentifier, exigerRole('admin'));

// GET /api/admin/entreprises : liste complète des entreprises de
// la plateforme (lecture seule pour l'admin).
router.get('/entreprises', async (req, res) => {
  const entreprises = await prisma.entreprise.findMany({
    select: {
      id: true,
      nomEntreprise: true,
      secteurActivite: true,
      nomGerant: true,
      email: true,
      createdAt: true,
    },
    orderBy: { nomEntreprise: 'asc' },
  });

  res.json(entreprises);
});

// GET /api/admin/vendeurs : liste complète des vendeurs de la
// plateforme, avec le nom de leur entreprise.
router.get('/vendeurs', async (req, res) => {
  const vendeurs = await prisma.vendeur.findMany({
    select: {
      id: true,
      nomPrenoms: true,
      email: true,
      telephone: true,
      createdAt: true,
      entreprise: { select: { nomEntreprise: true } },
    },
    orderBy: { nomPrenoms: 'asc' },
  });

  const vendeursFormates = vendeurs.map((v) => ({
    id: v.id,
    nomPrenoms: v.nomPrenoms,
    email: v.email,
    telephone: v.telephone,
    createdAt: v.createdAt,
    entreprise: v.entreprise.nomEntreprise,
  }));

  res.json(vendeursFormates);
});

// DELETE /api/admin/entreprises/:id : supprime une entreprise (et
// tous ses vendeurs, produits, ventes, etc. grâce à onDelete:
// Cascade défini dans le schema.prisma).
router.delete('/entreprises/:id', async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({ where: { id: req.params.id } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  await prisma.entreprise.delete({ where: { id: req.params.id } });

  res.status(204).end();
});

// DELETE /api/admin/vendeurs/:id : supprime un vendeur précis.
router.delete('/vendeurs/:id', async (req, res) => {
  const vendeur = await prisma.vendeur.findUnique({ where: { id: req.params.id } });
  if (!vendeur) {
    return res.status(404).json({ erreur: 'Vendeur introuvable.' });
  }

  await prisma.vendeur.delete({ where: { id: req.params.id } });

  res.status(204).end();
});

module.exports = router;