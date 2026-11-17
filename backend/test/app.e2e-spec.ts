import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { MlClientService } from './../src/ml-client/ml.client.service';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Ticket API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let createdTicketIds: string[];
  const mlClientMock = {
    classify: jest.fn().mockResolvedValue({
      category: 'PAYMENT',
      urgency: 'High',
      isFallback: false,
    }),
  };

  beforeEach(async () => {
    createdTicketIds = [];
    mlClientMock.classify
      .mockReset()
      .mockResolvedValue({
        category: 'PAYMENT',
        urgency: 'High',
        isFallback: false,
      });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MlClientService)
      .useValue(mlClientMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    prisma = app.get(PrismaService);
    await app.init();
  });

  it('GET / returns the default response', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('creates a ticket and returns it in the list and detail endpoints', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'Payment issue',
        description: 'I need help with a payment that is still pending.',
      })
      .expect(201);

    const ticketId = createResponse.body.id;
    createdTicketIds.push(ticketId);

    expect(createResponse.body).toEqual(
      expect.objectContaining({
        id: ticketId,
        category: 'PAYMENT',
        urgency: 'High',
        isFallback: false,
      }),
    );
    expect(mlClientMock.classify).toHaveBeenCalledWith(
      'Payment issue\nI need help with a payment that is still pending.',
    );

    const listResponse = await request(app.getHttpServer())
      .get('/tickets')
      .expect(200);
    expect(listResponse.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ticketId })]),
    );

    await request(app.getHttpServer())
      .get(`/tickets/${ticketId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(ticketId);
      });
  });

  it('filters tickets and sorts by urgency priority, then newest first', async () => {
    const classifications = [
      { category: 'PAYMENT', urgency: 'High', isFallback: false },
      { category: 'PAYMENT', urgency: 'High', isFallback: false },
      { category: 'REFUND', urgency: 'Medium', isFallback: false },
      { category: 'PAYMENT', urgency: 'Low', isFallback: false },
    ];
    mlClientMock.classify
      .mockResolvedValueOnce(classifications[0])
      .mockResolvedValueOnce(classifications[1])
      .mockResolvedValueOnce(classifications[2])
      .mockResolvedValueOnce(classifications[3]);

    const fixtureIds: string[] = [];
    for (const [index, title] of [
      'Older high payment',
      'Newer high payment',
      'Medium refund',
      'Low payment',
    ].entries()) {
      const response = await request(app.getHttpServer())
        .post('/tickets')
        .send({
          title,
          description: 'This is a test ticket description.',
        })
        .expect(201);
      fixtureIds.push(response.body.id);
      createdTicketIds.push(response.body.id);

      await prisma.ticket.update({
        where: { id: response.body.id },
        data: { createdAt: new Date(Date.UTC(2025, 0, index + 1)) },
      });
    }

    const listResponse = await request(app.getHttpServer())
      .get('/tickets')
      .expect(200);
    const fixtureOrder = listResponse.body
      .map((ticket: { id: string }) => ticket.id)
      .filter((id: string) => fixtureIds.includes(id));

    expect(fixtureOrder).toEqual([
      fixtureIds[1],
      fixtureIds[0],
      fixtureIds[2],
      fixtureIds[3],
    ]);

    const filteredResponse = await request(app.getHttpServer())
      .get('/tickets?category=PAYMENT&urgency=High')
      .expect(200);
    const filteredFixtures = filteredResponse.body
      .map((ticket: { id: string }) => ticket.id)
      .filter((id: string) => fixtureIds.includes(id));

    expect(filteredFixtures).toEqual([fixtureIds[1], fixtureIds[0]]);
    expect(
      filteredResponse.body.every(
        (ticket: { category: string; urgency: string }) =>
          ticket.category === 'PAYMENT' && ticket.urgency === 'High',
      ),
    ).toBe(true);
  });

  it('rejects invalid ticket input', async () => {
    await request(app.getHttpServer())
      .post('/tickets')
      .send({ title: 'ab', description: 'short' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/tickets')
      .send({ title: 'Valid title' })
      .expect(400);
  });

  it('returns 404 for a ticket that does not exist', () => {
    return request(app.getHttpServer())
      .get(`/tickets/${randomUUID()}`)
      .expect(404);
  });

  afterEach(async () => {
    try {
      await prisma.ticket.deleteMany({
        where: { id: { in: createdTicketIds } },
      });
    } finally {
      await app.close();
    }
  });
});
