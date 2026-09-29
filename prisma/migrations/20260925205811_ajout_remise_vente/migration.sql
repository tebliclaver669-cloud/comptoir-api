/*
  Warnings:

  - You are about to drop the column `motDePassePersonnalise` on the `Vendeur` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Vendeur" DROP COLUMN "motDePassePersonnalise";

-- AlterTable
ALTER TABLE "Vente" ADD COLUMN     "remise" INTEGER NOT NULL DEFAULT 0;
