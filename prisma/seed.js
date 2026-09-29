const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const identifiant = 'admin';
  const motDePasseClair = 'comptoir-admin-2026';

  const existant = await prisma.admin.findUnique({ where: { identifiant } });
  if (existant) {
    console.log('Compte admin deja existant, rien a faire.');
    return;
  }

  const motDePasseHash = await bcrypt.hash(motDePasseClair, 10);
  await prisma.admin.create({ data: { identifiant, motDePasseHash } });
  console.log('Compte admin cree : identifiant=admin, mot de passe=comptoir-admin-2026');
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());