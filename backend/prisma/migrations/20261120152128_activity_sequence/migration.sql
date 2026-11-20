-- AlterTable
ALTER TABLE "TicketActivity" ADD COLUMN     "sequence" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "TicketActivity_sequence_key" ON "TicketActivity"("sequence");

-- CreateIndex
CREATE INDEX "TicketActivity_ticketId_sequence_idx" ON "TicketActivity"("ticketId", "sequence");
