const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../prisma');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/vendeurs : inscription d'un vendeur, rattaché à une
// entreprise existante (identifiée par son nom).
router.post('/', async (req, res) => {
  const { nomEntreprise, nomPrenoms, email, telephone, motDePasse } = req.body;

  if (!nomEntreprise || !nomPrenoms || !email || !telephone || !motDePasse) {
    return res.status(400).json({ erreur: 'Merci de remplir tous les champs.' });
  }

  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const motDePasseHash = await bcrypt.hash(motDePasse, 10);

  const vendeur = await prisma.vendeur.create({
    data: { nomPrenoms, email, telephone, motDePasseHash, entrepriseId: entreprise.id },
  });

  res.status(201).json({ id: vendeur.id, nomPrenoms: vendeur.nomPrenoms });
});

// GET /api/vendeurs/:nomEntreprise : liste des vendeurs d'une
// entreprise, avec leur statut en ligne (déduit de leur dernier
// événement Connexion) et s'ils ont personnalisé leur mot de passe.
router.get('/:nomEntreprise', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({
    where: { nomEntreprise: req.params.nomEntreprise },
  });

  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  const vendeurs = await prisma.vendeur.findMany({
    where: { entrepriseId: entreprise.id },
    select: {
      id: true,
      nomPrenoms: true,
      email: true,
      telephone: true,
      createdAt: true,
      motDePassePersonnalise: true,
      connexions: { orderBy: { dateHeure: 'desc' }, take: 1 },
    },
    orderBy: { nomPrenoms: 'asc' },
  });

  res.json(
    vendeurs.map((v) => ({
      id: v.id,
      nomPrenoms: v.nomPrenoms,
      email: v.email,
      telephone: v.telephone,
      createdAt: v.createdAt,
      motDePassePersonnalise: v.motDePassePersonnalise,
      enLigne: v.connexions[0]?.type === 'connexion',
    }))
  );
});

// GET /api/vendeurs/:nomEntreprise/:id/connexions : historique
// complet de connexions/déconnexions d'un vendeur (gérant uniquement).
router.get('/:nomEntreprise/:id/connexions', authentifier, exigerRole('gerant'), async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({
    where: { nomEntreprise: req.params.nomEntreprise },
  });

  if (!entreprise || entreprise.id !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: 'Accès refusé.' });
  }

  const historique = await prisma.connexion.findMany({
    where: { vendeurId: req.params.id, entrepriseId: entreprise.id },
    orderBy: { dateHeure: 'desc' },
  });

  res.json(historique);
});

// PUT /api/vendeurs/moi : le VENDEUR CONNECTÉ modifie SON PROPRE
// profil (nom, email, téléphone) et éventuellement son propre mot de
// passe — vérifié par SON PROPRE mot de passe actuel (jamais celui du
// gérant, contrairement à PUT /:id ci-dessous qui est réservé au
// gérant). IMPORTANT : cette route doit rester déclarée AVANT
// "PUT /:id", sinon Express confondrait "moi" avec un id de vendeur.
router.put('/moi', authentifier, exigerRole('vendeur'), async (req, res) => {
  const vendeur = await prisma.vendeur.findUnique({ where: { id: req.utilisateur.vendeurId } });
  if (!vendeur) {
    return res.status(404).json({ erreur: 'Vendeur introuvable.' });
  }

  const { nomPrenoms, email, telephone, motDePasseActuel, nouveauMotDePasse } = req.body;

  if (!motDePasseActuel) {
    return res.status(400).json({ erreur: 'Merci de saisir votre mot de passe pour valider.' });
  }

  const motDePasseOk = await bcrypt.compare(motDePasseActuel, vendeur.motDePasseHash);
  if (!motDePasseOk) {
    return res.status(401).json({ erreur: 'Mot de passe incorrect.' });
  }

  const donnees = {};
  if (nomPrenoms !== undefined) donnees.nomPrenoms = nomPrenoms;
  if (email !== undefined) donnees.email = email;
  if (telephone !== undefined) donnees.telephone = telephone;

  if (nouveauMotDePasse) {
    donnees.motDePasseHash = await bcrypt.hash(nouveauMotDePasse, 10);
    // À partir de maintenant, le gérant ne pourra plus réinitialiser
    // ce mot de passe ni s'en servir pour "Connecter un vendeur" —
    // seul le vendeur lui-même y a accès (voir PUT /:id ci-dessous).
    donnees.motDePassePersonnalise = true;
  }

  const misAJour = await prisma.vendeur.update({ where: { id: vendeur.id }, data: donnees });

  res.json({
    id: misAJour.id,
    nomPrenoms: misAJour.nomPrenoms,
    email: misAJour.email,
    telephone: misAJour.telephone,
    motDePassePersonnalise: misAJour.motDePassePersonnalise,
  });
});

// PUT /api/vendeurs/:id : modifie le profil d'un vendeur (nom,
// email, téléphone) et, en option, réinitialise son mot de passe.
// Réservé au gérant, protégé par SON propre mot de passe (vérifié
// ici côté serveur, jamais côté client).
router.put('/:id', authentifier, exigerRole('gerant'), async (req, res) => {
  const vendeur = await prisma.vendeur.findUnique({ where: { id: req.params.id } });
  if (!vendeur) {
    return res.status(404).json({ erreur: 'Vendeur introuvable.' });
  }
  if (vendeur.entrepriseId !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: "Ce vendeur n'appartient pas à votre entreprise." });
  }

  const { nomPrenoms, email, telephone, motDePasseGerant, nouveauMotDePasse } = req.body;

  if (!motDePasseGerant) {
    return res.status(400).json({ erreur: 'Merci de saisir votre mot de passe pour valider.' });
  }

  const entreprise = await prisma.entreprise.findUnique({ where: { id: req.utilisateur.entrepriseId } });
  const motDePasseOk = await bcrypt.compare(motDePasseGerant, entreprise.motDePasseHash);
  if (!motDePasseOk) {
    return res.status(401).json({ erreur: 'Mot de passe incorrect.' });
  }

  const donnees = {};
  if (nomPrenoms !== undefined) donnees.nomPrenoms = nomPrenoms;
  if (email !== undefined) donnees.email = email;
  if (telephone !== undefined) donnees.telephone = telephone;

  if (nouveauMotDePasse) {
    if (vendeur.motDePassePersonnalise) {
      return res.status(403).json({ erreur: 'Ce vendeur a personnalisé son mot de passe : seul lui peut le modifier.' });
    }
    donnees.motDePasseHash = await bcrypt.hash(nouveauMotDePasse, 10);
  }

  const misAJour = await prisma.vendeur.update({ where: { id: vendeur.id }, data: donnees });

  res.json({
    id: misAJour.id,
    nomPrenoms: misAJour.nomPrenoms,
    email: misAJour.email,
    telephone: misAJour.telephone,
    motDePassePersonnalise: misAJour.motDePassePersonnalise,
  });
});

// POST /api/vendeurs/deconnexion : enregistre la déconnexion du
// vendeur actuellement connecté (pour le statut en ligne/hors ligne
// visible par le gérant). Appelé par le bouton "Déconnexion".
router.post('/deconnexion', authentifier, exigerRole('vendeur'), async (req, res) => {
  await prisma.connexion.create({
    data: {
      type: 'deconnexion',
      vendeurId: req.utilisateur.vendeurId,
      entrepriseId: req.utilisateur.entrepriseId,
    },
  });
  res.status(204).end();
});

// DELETE /api/vendeurs/:id : supprime un vendeur. Réservé au
// gérant, et on vérifie que ce vendeur appartient bien à SON
// entreprise avant de le supprimer.
router.delete('/:id', authentifier, exigerRole('gerant'), async (req, res) => {
  const vendeur = await prisma.vendeur.findUnique({ where: { id: req.params.id } });

  if (!vendeur) {
    return res.status(404).json({ erreur: 'Vendeur introuvable.' });
  }

  if (vendeur.entrepriseId !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: "Ce vendeur n'appartient pas à votre entreprise." });
  }

  await prisma.vendeur.delete({ where: { id: req.params.id } });

  res.status(204).end();
});

module.exports = router;