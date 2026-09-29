-- CreateTable
CREATE TABLE "Entreprise" (
    "id" TEXT NOT NULL,
    "nomEntreprise" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "secteurActivite" TEXT NOT NULL,
    "numeroEntreprise" TEXT NOT NULL,
    "nomGerant" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "emailConfirme" BOOLEAN NOT NULL DEFAULT false,
    "codeConfirmation" TEXT,
    "codeExpiration" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entreprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendeur" (
    "id" TEXT NOT NULL,
    "nomPrenoms" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "entrepriseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Entreprise_nomEntreprise_key" ON "Entreprise"("nomEntreprise");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_identifiant_key" ON "Admin"("identifiant");

-- AddForeignKey
ALTER TABLE "Vendeur" ADD CONSTRAINT "Vendeur_entrepriseId_fkey" FOREIGN KEY ("entrepriseId") REFERENCES "Entreprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
