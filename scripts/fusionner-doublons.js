/**
 * fusionner-doublons.js
 * ----------------------------------------------------------------
 * Script à usage UNIQUE : fusionne les produits existants qui ont le
 * même nom + la même catégorie (à la casse/espaces près) pour une
 * même entreprise, en un seul produit avec le stock cumulé.
 *
 * Avant de supprimer une ligne en double, on réattribue d'abord ses
 * ventes et mouvements de stock au produit "principal" conservé —
 * aucun historique n'est perdu.
 *
 * Usage (depuis comptoir-api) :
 *   node scripts/fusionner-doublons.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const entreprises = await prisma.entreprise.findMany();
  let totalFusions = 0;

  for (const entreprise of entreprises) {
    const produits = await prisma.produit.findMany({
      where: { entrepriseId: entreprise.id, estArchive: false },
      orderBy: { createdAt: 'asc' },
    });

    const groupes = new Map();
    for (const p of produits) {
      const cle = `${p.nom.trim().toLowerCase()}::${p.categorie.trim().toLowerCase()}`;
      if (!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(p);
    }

    for (const lignes of groupes.values()) {
      if (lignes.length < 2) continue;

      // Le plus ancien devient la ligne de référence.
      const [principal, ...doublons] = lignes;
      const stockTotal = lignes.reduce((s, p) => s + p.stockActuel, 0);

      console.log(
        `[${entreprise.nomEntreprise}] Fusion de "${principal.nom}" (${principal.categorie}) : ` +
        `${lignes.length} lignes -> stock total ${stockTotal}`
      );

      await prisma.$transaction(async (tx) => {
        for (const doublon of doublons) {
          await tx.vente.updateMany({
            where: { produitId: doublon.id },
            data: { produitId: principal.id },
          });
          await tx.mouvementStock.updateMany({
            where: { produitId: doublon.id },
            data: { produitId: principal.id },
          });
          await tx.produit.delete({ where: { id: doublon.id } });
        }

        await tx.produit.update({
          where: { id: principal.id },
          data: { stockActuel: stockTotal },
        });
      });

      totalFusions += 1;
    }
  }

  console.log(`Terminé — ${totalFusions} groupe(s) de doublons fusionné(s).`);
}

main()
  .catch((erreur) => {
    console.error(erreur);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());