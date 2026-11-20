import { Prisma } from '@prisma/client';
import { MlClientService } from '../ml-client/ml.client.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketService } from './ticket.service';

describe('TicketService', () => {
  it('uses explicit descending urgency priorities in the list query', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prismaMock = {
      $queryRaw: queryRaw,
      $transaction: jest.fn(),
    };
    prismaMock.$transaction.mockImplementation(
      (callback: (transaction: typeof prismaMock) => Promise<unknown>) =>
        callback(prismaMock),
    );
    const prisma = prismaMock as unknown as PrismaService;
    const service = new TicketService(prisma, {} as MlClientService);

    await service.findAll({}, '00000000-0000-4000-8000-000000000001');

    const query = queryRaw.mock.calls
      .map(([sql]) => sql as Prisma.Sql)
      .find((sql) => sql.sql.includes('ORDER BY'));
    expect(query).toBeDefined();
    const priorities = Array.from(
      query!.sql.matchAll(/WHEN '(\w+)'::"TicketUrgency" THEN (\d+)/g),
      ([, urgency, priority]) => [urgency, Number(priority)],
    );

    expect(priorities).toEqual([
      ['High', 3],
      ['Medium', 2],
      ['Low', 1],
    ]);
  });
});
