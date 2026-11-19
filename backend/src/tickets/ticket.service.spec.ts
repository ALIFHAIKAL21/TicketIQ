import { Prisma } from '@prisma/client';
import { MlClientService } from '../ml-client/ml.client.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketService } from './ticket.service';

describe('TicketService', () => {
  it('uses explicit descending urgency priorities in the list query', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new TicketService(prisma, {} as MlClientService);

    await service.findAll({});

    const query = queryRaw.mock.calls[0][0] as Prisma.Sql;
    const priorities = Array.from(
      query.sql.matchAll(/WHEN '(\w+)'::"TicketUrgency" THEN (\d+)/g),
      ([, urgency, priority]) => [urgency, Number(priority)],
    );

    expect(priorities).toEqual([
      ['High', 3],
      ['Medium', 2],
      ['Low', 1],
    ]);
  });
});
