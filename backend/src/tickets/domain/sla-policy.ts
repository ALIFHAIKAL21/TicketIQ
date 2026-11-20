import { TicketUrgency } from '@prisma/client';

const resolutionHours: Record<TicketUrgency, number> = {
  [TicketUrgency.High]: 4,
  [TicketUrgency.Medium]: 24,
  [TicketUrgency.Low]: 72,
};

export function getResolutionDeadline(
  urgency: TicketUrgency,
  createdAt: Date,
): Date {
  const millisecondsPerHour = 60 * 60 * 1000;
  return new Date(
    createdAt.getTime() + resolutionHours[urgency] * millisecondsPerHour,
  );
}

export function isTicketOverdue(
  dueAt: Date | null,
  resolvedAt: Date | null,
  now: Date,
): boolean {
  return (
    dueAt !== null && resolvedAt === null && dueAt.getTime() <= now.getTime()
  );
}
