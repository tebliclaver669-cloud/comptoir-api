const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../prisma');
const { authentifier, exigerRole } = require('../middleware/auth');
const { genererCode } = require('../utils/code');
const { envoyerCodeConfirmation } = require('../utils/email');

const router = express.Router();

// Champs d'une entreprise qu'on renvoie au frontend (jamais le mot
// de passe ni le code de confirmation).
function versReponse(entreprise) {
  return {
    nomEntreprise: entreprise.nomEntreprise,
    email: entreprise.email,
    secteurActivite: entreprise.secteurActivite,
    numeroEntreprise: entreprise.numeroEntreprise,
    nomGerant: entreprise.nomGerant,
    createdAt: entreprise.createdAt,
  };
}

// POST /api/entreprises : inscription. Crée l'entreprise avec un mot
// de passe haché, puis envoie un code de confirmation par e-mail
// (valable 15 minutes).
router.post('/', async (req, res) => {
  const { nomEntreprise, email, secteurActivite, numeroEntreprise, nomGerant, motDePasse } = req.body;

  if (!nomEntreprise || !email || !secteurActivite || !numeroEntreprise || !nomGerant || !motDePasse) {
    return res.status(400).json({ erreur: 'Merci de remplir tous les champs.' });
  }

  const existante = await prisma.entreprise.findUnique({ where: { nomEntreprise } });
  if (existante) {
    return res.status(409).json({ erreur: 'Ce nom d\'entreprise est déjà utilisé.' });
  }

  const motDePasseHash = await bcrypt.hash(motDePasse, 10);
  const code = genererCode();
  const codeExpiration = new Date(Date.now() + 15 * 60 * 1000);

  const entreprise = await prisma.entreprise.create({
    data: {
      nomEntreprise,
      email,
      secteurActivite,
      numeroEntreprise,
      nomGerant,
      motDePasseHash,
      codeConfirmation: code,
      codeExpiration,
    },
  });

  try {
    await envoyerCodeConfirmation(email, code);
  } catch (erreur) {
    // Sans e-mail envoyé, la personne ne pourrait jamais confirmer :
    // on annule l'inscription pour qu'elle puisse réessayer.
    console.error('Échec envoi e-mail :', erreur.message);
    await prisma.entreprise.delete({ where: { id: entreprise.id } });
    return res.status(500).json({ erreur: 'Impossible d\'envoyer l\'e-mail de confirmation. Vérifiez l\'adresse et réessayez.' });
  }

  res.status(201).json(versReponse(entreprise));
});

// POST /api/entreprises/:nomEntreprise/confirmer : vérifie le code
// reçu par e-mail et marque l'adresse comme confirmée.
router.post('/:nomEntreprise/confirmer', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ erreur: 'Merci de fournir le code.' });
  }

  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise: req.params.nomEntreprise } });
  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  if (entreprise.emailConfirme) {
    return res.json({ message: 'Email déjà confirmé.' });
  }

  if (!entreprise.codeConfirmation || entreprise.codeConfirmation !== code) {
    return res.status(400).json({ erreur: 'Code incorrect.' });
  }

  if (!entreprise.codeExpiration || entreprise.codeExpiration < new Date()) {
    return res.status(400).json({ erreur: 'Ce code a expiré.' });
  }

  await prisma.entreprise.update({
    where: { id: entreprise.id },
    data: { emailConfirme: true, codeConfirmation: null, codeExpiration: null },
  });

  res.json({ message: 'Email confirmé.' });
});

// GET /api/entreprises/:nomEntreprise/existe : utilisé par la page
// d'accueil pour savoir s'il faut connecter ou inscrire.
router.get('/:nomEntreprise/existe', async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({ where: { nomEntreprise: req.params.nomEntreprise } });
  res.json({ existe: Boolean(entreprise) });
});

// GET /api/entreprises/:nomEntreprise : lecture des infos d'une
// entreprise — utilisée par la page Paramètres pour charger les
// valeurs actuelles, et par Statistiques pour connaître l'année de
// création (createdAt). Protégée par le token (authentifier) et par
// une vérification de propriété : seul un membre (gérant ou
// vendeur) de CETTE entreprise peut la lire.
router.get('/:nomEntreprise', authentifier, async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({
    where: { nomEntreprise: req.params.nomEntreprise },
  });

  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  if (entreprise.id !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: 'Accès refusé.' });
  }

  res.json(versReponse(entreprise));
});

// PUT /api/entreprises/:nomEntreprise : modification des infos par
// le gérant (page Paramètres). Seuls les champs envoyés changent.
router.put('/:nomEntreprise', authentifier, exigerRole('gerant'), async (req, res) => {
  const entreprise = await prisma.entreprise.findUnique({
    where: { nomEntreprise: req.params.nomEntreprise },
  });

  if (!entreprise) {
    return res.status(404).json({ erreur: 'Entreprise introuvable.' });
  }

  if (entreprise.id !== req.utilisateur.entrepriseId) {
    return res.status(403).json({ erreur: 'Accès refusé.' });
  }

  const champsAutorises = ['nomEntreprise', 'email', 'secteurActivite', 'numeroEntreprise', 'nomGerant'];
  const donnees = {};
  for (const champ of champsAutorises) {
    if (req.body[champ] !== undefined) {
      donnees[champ] = req.body[champ];
    }
  }

  if (donnees.nomEntreprise && donnees.nomEntreprise !== entreprise.nomEntreprise) {
    const doublon = await prisma.entreprise.findUnique({ where: { nomEntreprise: donnees.nomEntreprise } });
    if (doublon) {
      return res.status(409).json({ erreur: 'Ce nom d\'entreprise est déjà utilisé.' });
    }
  }

  const miseAJour = await prisma.entreprise.update({
    where: { id: entreprise.id },
    data: donnees,
  });

  res.json(versReponse(miseAJour));
});

module.exports = router;