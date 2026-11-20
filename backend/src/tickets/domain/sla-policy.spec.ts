import { TicketUrgency } from '@prisma/client';
import { getResolutionDeadline, isTicketOverdue } from './sla-policy';

describe('ticket SLA policy', () => {
  const createdAt = new Date('2026-11-20T08:00:00.000Z');

  it.each([
    [TicketUrgency.High, 4],
    [TicketUrgency.Medium, 24],
    [TicketUrgency.Low, 72],
  ])(
    'sets the %s deadline %i calendar hours after creation',
    (urgency, hours) => {
      expect(getResolutionDeadline(urgency, createdAt).getTime()).toBe(
        createdAt.getTime() + hours * 60 * 60 * 1000,
      );
    },
  );

  it('marks an unresolved ticket overdue at its deadline, but not a resolved ticket', () => {
    const deadline = getResolutionDeadline(TicketUrgency.High, createdAt);

    expect(isTicketOverdue(deadline, null, deadline)).toBe(true);
    expect(
      isTicketOverdue(deadline, null, new Date(deadline.getTime() - 1)),
    ).toBe(false);
    expect(isTicketOverdue(deadline, deadline, new Date())).toBe(false);
    expect(isTicketOverdue(null, null, new Date())).toBe(false);
  });
});
