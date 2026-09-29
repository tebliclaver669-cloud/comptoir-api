require('dotenv').config({ path: require('path').join(__dirname, '..', 'prisma', '.env') });
console.log('EMAIL_UTILISATEUR =', process.env.EMAIL_UTILISATEUR);
console.log('Longueur du mot de passe =', process.env.EMAIL_MOT_DE_PASSE_APPLICATION ? process.env.EMAIL_MOT_DE_PASSE_APPLICATION.length : 'VIDE/UNDEFINED');
console.log('Derniers caracteres =', process.env.EMAIL_MOT_DE_PASSE_APPLICATION ? process.env.EMAIL_MOT_DE_PASSE_APPLICATION.slice(-4) : 'VIDE');
const express = require('express');
const cors = require('cors');

const entreprisesRoutes = require('./routes/entreprises.routes');
const ventesRoutes = require('./routes/ventes.routes');
const produitsRoutes = require('./routes/produits.routes');
const fournisseursRoutes = require('./routes/fournisseurs.routes');
const mouvementsRoutes = require('./routes/mouvements.routes');
const authRoutes = require('./routes/auth.routes');
const vendeursRoutes = require('./routes/vendeurs.routes');
const adminRoutes = require('./routes/admin.routes');
const connexionsRoutes = require('./routes/connexions.routes');
const statistiquesRoutes = require('./routes/statistiques.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Comptoir API en ligne' });
});

app.use('/api/entreprises', entreprisesRoutes);
app.use('/api/produits', produitsRoutes);
app.use('/api/ventes', ventesRoutes);
app.use('/api/fournisseurs', fournisseursRoutes);
app.use('/api/mouvements', mouvementsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/vendeurs', vendeursRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/connexions', connexionsRoutes);
app.use('/api/statistiques', statistiquesRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log('Comptoir API demarree sur http://localhost:' + PORT));