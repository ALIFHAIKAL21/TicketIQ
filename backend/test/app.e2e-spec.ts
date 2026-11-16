import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('Ticket API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let createdTicketIds: string[];

  beforeEach(async () => {
    createdTicketIds = [];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
        category: 'UNCLASSIFIED',
        urgency: 'Medium',
        isFallback: false,
      }),
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
