import { ConflictException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';

const allowedTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
  [TicketStatus.NEW]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.RESOLVED],
  [TicketStatus.RESOLVED]: [TicketStatus.IN_PROGRESS],
};

export function assertStatusTransition(
  current: TicketStatus,
  next: TicketStatus,
): void {
  if (!allowedTransitions[current].includes(next)) {
    throw new ConflictException(
      `Ticket cannot move from ${current} to ${next}`,
    );
  }
}
