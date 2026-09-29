const nodemailer = require('nodemailer');

const transporteur = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_UTILISATEUR,
    pass: process.env.EMAIL_MOT_DE_PASSE_APPLICATION,
  },
});

async function envoyerCodeConfirmation(emailDestinataire, code) {
  await transporteur.sendMail({
    from: 'Comptoir <' + process.env.EMAIL_UTILISATEUR + '>',
    to: emailDestinataire,
    subject: 'Confirmez votre inscription Comptoir',
    text: 'Votre code de confirmation est : ' + code + '. Il est valable 15 minutes.',
    html: '<p>Votre code de confirmation est : <strong>' + code + '</strong></p><p>Il est valable 15 minutes.</p>',
  });
}

module.exports = { envoyerCodeConfirmation };