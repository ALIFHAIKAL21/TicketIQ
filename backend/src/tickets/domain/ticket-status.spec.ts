import { ConflictException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { assertStatusTransition } from './ticket-status';

describe('ticket status transitions', () => {
  it.each([
    [TicketStatus.NEW, TicketStatus.IN_PROGRESS],
    [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
    [TicketStatus.RESOLVED, TicketStatus.IN_PROGRESS],
  ])('allows %s → %s', (current, next) => {
    expect(() => assertStatusTransition(current, next)).not.toThrow();
  });

  it.each([
    [TicketStatus.NEW, TicketStatus.RESOLVED],
    [TicketStatus.RESOLVED, TicketStatus.NEW],
  ])('rejects %s → %s', (current, next) => {
    expect(() => assertStatusTransition(current, next)).toThrow(
      ConflictException,
    );
  });
});
