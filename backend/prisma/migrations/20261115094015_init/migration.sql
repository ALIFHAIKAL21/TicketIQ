-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('ACCOUNT', 'ORDER', 'REFUND', 'CONTACT', 'PAYMENT', 'FEEDBACK', 'SHIPPING', 'INVOICE', 'DELIVERY', 'SUBSCRIPTION', 'CANCEL', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "TicketUrgency" AS ENUM ('Low', 'Medium', 'High');

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL DEFAULT 'UNCLASSIFIED',
    "urgency" "TicketUrgency" NOT NULL DEFAULT 'Medium',
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);
