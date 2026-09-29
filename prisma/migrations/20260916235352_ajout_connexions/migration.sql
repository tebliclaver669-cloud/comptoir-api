-- CreateTable
CREATE TABLE "Connexion" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dateHeure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendeurId" TEXT NOT NULL,
    "entrepriseId" TEXT NOT NULL,

    CONSTRAINT "Connexion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Connexion" ADD CONSTRAINT "Connexion_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "Vendeur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connexion" ADD CONSTRAINT "Connexion_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "Entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
