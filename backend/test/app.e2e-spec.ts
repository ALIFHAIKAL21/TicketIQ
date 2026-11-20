import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { PasswordHasher, TokenService } from '@nestjs/authentication';
import { UserRole } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import rawRequest from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DEFAULT_WORKSPACE_ID } from './../src/workspaces/default-workspace';
import { FilterExceptionFilter } from './../src/common/filters/filter-exception.filter';
import { MlClientService } from './../src/ml-client/ml.client.service';
import { PrismaService } from './../src/prisma/prisma.service';
import { TicketService } from './../src/tickets/ticket.service';

describe('Ticket API (e2e)', () => {
  process.env.JWT_SECRET ??= 'e2e-only-secret-key-not-for-production-123456';
  const TEST_PASSWORD = 'test-password-for-e2e-only';
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let createdTicketIds: string[];
  let createdAgentIds: string[];
  let createdUserIds: string[];
  let createdWorkspaceIds: string[];
  let bearerToken: string;
  let adminEmail: string;
  const request = (server: App) => ({
    get: (path: string) =>
      rawRequest(server)
        .get(path)
        .set('Authorization', `Bearer ${bearerToken}`),
    post: (path: string) =>
      rawRequest(server)
        .post(path)
        .set('Authorization', `Bearer ${bearerToken}`),
    patch: (path: string) =>
      rawRequest(server)
        .patch(path)
        .set('Authorization', `Bearer ${bearerToken}`),
  });

  async function createWorkspaceUser(role: UserRole, workspaceId: string) {
    const user = await prisma.user.create({
      data: {
        email: `member-${randomUUID()}@example.com`,
        displayName: `${role} Test Member`,
        passwordHash: await app.get(PasswordHasher).hash(TEST_PASSWORD),
        role,
        workspaceId,
      },
    });
    createdUserIds.push(user.id);
    const token = await app.get(TokenService).issue(user.id, {
      method: 'password',
    });
    return { user, accessToken: token.accessToken };
  }
  const mlClientMock = {
    classify: jest.fn().mockResolvedValue({
      category: 'PAYMENT',
      urgency: 'High',
      isFallback: false,
    }),
    isReachable: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    createdTicketIds = [];
    createdAgentIds = [];
    createdUserIds = [];
    createdWorkspaceIds = [];
    mlClientMock.classify.mockReset().mockResolvedValue({
      category: 'PAYMENT',
      urgency: 'High',
      isFallback: false,
    });
    mlClientMock.isReachable.mockReset().mockResolvedValue(true);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MlClientService)
      .useValue(mlClientMock)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useStaticAssets(join(process.cwd(), 'public'));
    app.useGlobalFilters(new FilterExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    prisma = app.get(PrismaService);
    await app.init();

    await prisma.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      create: {
        id: DEFAULT_WORKSPACE_ID,
        name: 'TicketIQ Demo Workspace',
      },
      update: {},
    });
    adminEmail = `admin-${randomUUID()}@example.com`;
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        displayName: 'E2E Admin',
        passwordHash: await app.get(PasswordHasher).hash(TEST_PASSWORD),
        role: UserRole.ADMIN,
        workspaceId: DEFAULT_WORKSPACE_ID,
      },
    });
    createdUserIds.push(admin.id);
    const token = await app.get(TokenService).issue(admin.id, {
      method: 'password',
    });
    bearerToken = token.accessToken;
  });

  it('serves the dashboard and its static assets', async () => {
    await rawRequest(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /text\/html/)
      .expect(/TicketIQ/);
    await rawRequest(app.getHttpServer())
      .get('/styles.css')
      .expect(200)
      .expect('Content-Type', /text\/css/);
    await rawRequest(app.getHttpServer())
      .get('/app.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
  });

  it('reports the ML service as reachable when the probe succeeds', () => {
    return request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
      mlService: 'reachable',
    });
  });

  it('reports the ML service as unreachable while keeping health HTTP 200', async () => {
    mlClientMock.isReachable.mockResolvedValueOnce(false);

    await request(app.getHttpServer()).get('/health').expect(200).expect({
      status: 'ok',
      mlService: 'unreachable',
    });
  });

  it('authenticates with a short-lived bearer token and returns a safe user profile', async () => {
    const login = await rawRequest(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: TEST_PASSWORD })
      .expect(200);
    expect(login.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: expect.any(Number),
      }),
    );
    expect(login.body.refreshToken).toBeUndefined();

    await rawRequest(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            email: adminEmail,
            role: UserRole.ADMIN,
            workspaceId: DEFAULT_WORKSPACE_ID,
          }),
        );
        expect(body.passwordHash).toBeUndefined();
      });

    await rawRequest(app.getHttpServer())
      .get('/tickets')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    await rawRequest(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: `${TEST_PASSWORD}-wrong` })
      .expect(401);
    await rawRequest(app.getHttpServer()).get('/tickets').expect(401);
  });

  it('rate limits repeated login attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await rawRequest(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, password: `${TEST_PASSWORD}-wrong` })
        .expect(401);
    }

    await rawRequest(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: `${TEST_PASSWORD}-wrong` })
      .expect(429);
  });

  it('lets an admin create a workspace member and denies agent-only admin actions', async () => {
    const email = `new-member-${randomUUID()}@example.com`;
    const memberResponse = await request(app.getHttpServer())
      .post('/auth/members')
      .send({
        displayName: 'New Support Agent',
        email,
        password: TEST_PASSWORD,
      })
      .expect(201);
    expect(memberResponse.body).toEqual(
      expect.objectContaining({
        email,
        role: UserRole.AGENT,
        workspaceId: DEFAULT_WORKSPACE_ID,
      }),
    );
    expect(memberResponse.body.passwordHash).toBeUndefined();
    createdUserIds.push(memberResponse.body.id);

    const agent = await prisma.agent.findUnique({ where: { email } });
    expect(agent).toEqual(
      expect.objectContaining({
        userId: memberResponse.body.id,
        workspaceId: DEFAULT_WORKSPACE_ID,
      }),
    );

    const login = await rawRequest(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(200);
    await rawRequest(app.getHttpServer())
      .post('/agents')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({
        displayName: 'Unauthorized Agent',
        email: `unauthorized-${randomUUID()}@example.com`,
      })
      .expect(403);
  });

  it('isolates ticket queries and mutations between workspaces', async () => {
    const ticketResponse = await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'Private workspace ticket',
        description: 'This ticket belongs only to the default workspace.',
      })
      .expect(201);
    createdTicketIds.push(ticketResponse.body.id);

    const otherWorkspace = await prisma.workspace.create({
      data: { name: `Isolated workspace ${randomUUID()}` },
    });
    createdWorkspaceIds.push(otherWorkspace.id);
    const otherMember = await createWorkspaceUser(
      UserRole.AGENT,
      otherWorkspace.id,
    );
    const otherRequest = (path: string) =>
      rawRequest(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${otherMember.accessToken}`);

    const list = await otherRequest('/tickets').expect(200);
    expect(list.body.total).toBe(0);
    await otherRequest(`/tickets/${ticketResponse.body.id}`).expect(404);
    await rawRequest(app.getHttpServer())
      .patch(`/tickets/${ticketResponse.body.id}/status`)
      .set('Authorization', `Bearer ${otherMember.accessToken}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(404);
    await rawRequest(app.getHttpServer())
      .patch(`/tickets/${ticketResponse.body.id}/category`)
      .set('Authorization', `Bearer ${otherMember.accessToken}`)
      .send({ category: 'REFUND', reason: 'Must not cross workspace.' })
      .expect(404);
    await rawRequest(app.getHttpServer())
      .post(`/tickets/${ticketResponse.body.id}/notes`)
      .set('Authorization', `Bearer ${otherMember.accessToken}`)
      .send({ content: 'Must not cross workspace.' })
      .expect(404);
    await otherRequest(`/tickets/${ticketResponse.body.id}/activity`).expect(
      404,
    );
    await otherRequest('/tickets/summary')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          total: 0,
          byStatus: { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0 },
          openHighUrgency: 0,
          unassigned: 0,
          fallback: 0,
          overdue: 0,
        });
      });
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
        status: 'NEW',
        assigneeId: null,
      }),
    );
    expect(new Date(createResponse.body.dueAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    expect(mlClientMock.classify).toHaveBeenCalledWith(
      'Payment issue\nI need help with a payment that is still pending.',
    );

    const listResponse = await request(app.getHttpServer())
      .get('/tickets')
      .expect(200);
    expect(listResponse.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ticketId })]),
    );

    await request(app.getHttpServer())
      .get(`/tickets/${ticketId}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.id).toBe(ticketId);
      });
  });

  it('supports assigning, noting, resolving, reopening, and reading ticket activity', async () => {
    const agentResponse = await request(app.getHttpServer())
      .post('/agents')
      .send({
        displayName: 'Demo Agent',
        email: `demo-${randomUUID()}@example.com`,
      })
      .expect(201);
    createdAgentIds.push(agentResponse.body.id);

    const ticketResponse = await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'Workflow ticket',
        description: 'This ticket is used to test the workflow.',
      })
      .expect(201);
    createdTicketIds.push(ticketResponse.body.id);
    const ticketId = ticketResponse.body.id as string;
    const originalDueAt = ticketResponse.body.dueAt as string;

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketId}/assignee`)
      .send({ agentId: agentResponse.body.id })
      .expect(200)
      .expect(({ body }) => {
        expect(body.assignee).toEqual(
          expect.objectContaining({
            id: agentResponse.body.id,
            displayName: 'Demo Agent',
          }),
        );
      });

    await request(app.getHttpServer())
      .post(`/tickets/${ticketId}/notes`)
      .send({ content: 'Reviewed the payment provider response.' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            content: 'Reviewed the payment provider response.',
            authorName: 'E2E Admin',
          }),
        );
      });

    for (const status of ['IN_PROGRESS', 'RESOLVED', 'IN_PROGRESS']) {
      await request(app.getHttpServer())
        .patch(`/tickets/${ticketId}/status`)
        .send({ status })
        .expect(200)
        .expect(({ body }) => {
          expect(body.status).toBe(status);
        });
    }

    const detail = await request(app.getHttpServer())
      .get(`/tickets/${ticketId}`)
      .expect(200);
    expect(detail.body.resolvedAt).toBeNull();
    expect(detail.body.dueAt).toBe(originalDueAt);

    const history = await request(app.getHttpServer())
      .get(`/tickets/${ticketId}/activity`)
      .expect(200);
    expect(history.body.map((event: { type: string }) => event.type)).toEqual([
      'TICKET_CREATED',
      'ASSIGNEE_CHANGED',
      'INTERNAL_NOTE_ADDED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
    ]);
  });

  it('rejects invalid status transitions and assigning inactive agents', async () => {
    const agentResponse = await request(app.getHttpServer())
      .post('/agents')
      .send({
        displayName: 'Inactive Agent',
        email: `inactive-${randomUUID()}@example.com`,
      })
      .expect(201);
    createdAgentIds.push(agentResponse.body.id);

    await request(app.getHttpServer())
      .patch(`/agents/${agentResponse.body.id}`)
      .send({ isActive: false })
      .expect(200);

    const ticketResponse = await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'Invalid transition ticket',
        description: 'This ticket checks invalid workflow operations.',
      })
      .expect(201);
    createdTicketIds.push(ticketResponse.body.id);

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketResponse.body.id}/status`)
      .send({ status: 'RESOLVED' })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketResponse.body.id}/assignee`)
      .send({ agentId: agentResponse.body.id })
      .expect(409);
  });

  it('rolls ticket creation back when its activity record cannot be stored', async () => {
    const ticketService = app.get(TicketService);
    const title = 'Transaction rollback verification';

    await expect(
      ticketService.create(
        {
          title,
          description: 'This ticket must not persist without its activity.',
        },
        { displayName: 'Missing user', userId: randomUUID() },
      ),
    ).rejects.toThrow();

    await expect(
      prisma.ticket.findFirst({ where: { title } }),
    ).resolves.toBeNull();
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
    const fixtureOrder = listResponse.body.data
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
    const filteredFixtures = filteredResponse.body.data
      .map((ticket: { id: string }) => ticket.id)
      .filter((id: string) => fixtureIds.includes(id));

    expect(filteredFixtures).toEqual([fixtureIds[1], fixtureIds[0]]);
    expect(
      filteredResponse.body.data.every(
        (ticket: { category: string; urgency: string }) =>
          ticket.category === 'PAYMENT' && ticket.urgency === 'High',
      ),
    ).toBe(true);
  });

  it('searches and filters the queue with stable pagination metadata', async () => {
    mlClientMock.classify
      .mockResolvedValueOnce({
        category: 'PAYMENT',
        urgency: 'High',
        isFallback: false,
      })
      .mockResolvedValueOnce({
        category: 'PAYMENT',
        urgency: 'High',
        isFallback: false,
      })
      .mockResolvedValueOnce({
        category: 'REFUND',
        urgency: 'Medium',
        isFallback: false,
      });

    const fixtureIds: string[] = [];
    for (const title of [
      'Queue target payment alpha',
      'Queue target payment beta',
      'Unrelated refund',
    ]) {
      const response = await request(app.getHttpServer())
        .post('/tickets')
        .send({
          title,
          description: 'Queue search and pagination fixture description.',
        })
        .expect(201);
      fixtureIds.push(response.body.id);
      createdTicketIds.push(response.body.id);
    }

    await prisma.ticket.update({
      where: { id: fixtureIds[1] },
      data: { isFallback: true },
    });

    const query =
      '/tickets?category=PAYMENT&urgency=High&status=NEW&q=Queue%20target&isFallback=false&limit=1';
    const pageOne = await request(app.getHttpServer())
      .get(`${query}&page=1`)
      .expect(200);
    const pageTwo = await request(app.getHttpServer())
      .get(`${query}&page=2`)
      .expect(200);

    expect(pageOne.body).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
      }),
    );
    expect(pageOne.body.data).toHaveLength(1);
    expect(pageOne.body.data[0].id).toBe(fixtureIds[0]);
    expect(pageTwo.body.data).toEqual([]);
    expect(pageTwo.body.total).toBe(1);
  });

  it('returns queue summary from the persisted ticket records', async () => {
    const ticketResponse = await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'Summary high priority',
        description: 'This ticket is used to validate queue summary counts.',
      })
      .expect(201);
    createdTicketIds.push(ticketResponse.body.id);

    const summaryResponse = await request(app.getHttpServer())
      .get('/tickets/summary')
      .expect(200);
    const databaseCounts = await Promise.all([
      prisma.ticket.count(),
      prisma.ticket.count({
        where: {
          urgency: 'High',
          status: { not: 'RESOLVED' },
        },
      }),
      prisma.ticket.count({ where: { assigneeId: null } }),
      prisma.ticket.count({ where: { isFallback: true } }),
      ...(['NEW', 'IN_PROGRESS', 'RESOLVED'] as const).map((status) =>
        prisma.ticket.count({ where: { status } }),
      ),
    ]);

    expect(summaryResponse.body).toEqual({
      total: databaseCounts[0],
      byStatus: {
        NEW: databaseCounts[4],
        IN_PROGRESS: databaseCounts[5],
        RESOLVED: databaseCounts[6],
      },
      openHighUrgency: databaseCounts[1],
      unassigned: databaseCounts[2],
      fallback: databaseCounts[3],
      overdue: expect.any(Number),
    });
  });

  it('filters and counts overdue tickets but excludes resolved tickets', async () => {
    const previousOverdueCount = (
      await request(app.getHttpServer()).get('/tickets/summary').expect(200)
    ).body.overdue as number;

    mlClientMock.classify
      .mockResolvedValueOnce({
        category: 'PAYMENT',
        urgency: 'High',
        isFallback: false,
      })
      .mockResolvedValueOnce({
        category: 'PAYMENT',
        urgency: 'High',
        isFallback: false,
      });

    const activeResponse = await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'Overdue active ticket',
        description: 'This open ticket is overdue for SLA testing.',
      })
      .expect(201);
    createdTicketIds.push(activeResponse.body.id);
    const resolvedResponse = await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'Overdue but resolved ticket',
        description: 'This resolved ticket must not count as actively overdue.',
      })
      .expect(201);
    createdTicketIds.push(resolvedResponse.body.id);

    const pastDueAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.ticket.updateMany({
      where: { id: { in: [activeResponse.body.id, resolvedResponse.body.id] } },
      data: { dueAt: pastDueAt },
    });
    await prisma.ticket.update({
      where: { id: resolvedResponse.body.id },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });

    const overdueList = await request(app.getHttpServer())
      .get('/tickets?overdue=true')
      .expect(200);
    expect(
      overdueList.body.data.map((ticket: { id: string }) => ticket.id),
    ).toContain(activeResponse.body.id);
    expect(
      overdueList.body.data.map((ticket: { id: string }) => ticket.id),
    ).not.toContain(resolvedResponse.body.id);

    const summary = await request(app.getHttpServer())
      .get('/tickets/summary')
      .expect(200);
    expect(summary.body.overdue).toBe(previousOverdueCount + 1);
  });

  it('corrects the final category without overwriting the original ML prediction', async () => {
    const ticketResponse = await request(app.getHttpServer())
      .post('/tickets')
      .send({
        title: 'Duplicate card charge',
        description: 'The customer reports that the card was charged twice.',
      })
      .expect(201);
    createdTicketIds.push(ticketResponse.body.id);

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketResponse.body.id}/category`)
      .send({
        category: 'REFUND',
        reason: 'The customer is asking to reverse a duplicate charge.',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            category: 'REFUND',
            predictedCategory: 'PAYMENT',
            urgency: 'High',
          }),
        );
      });

    await request(app.getHttpServer())
      .patch(`/tickets/${ticketResponse.body.id}/category`)
      .send({
        category: 'REFUND',
        reason: 'This category is already the current category.',
      })
      .expect(409);

    const history = await request(app.getHttpServer())
      .get(`/tickets/${ticketResponse.body.id}/activity`)
      .expect(200);
    expect(history.body.map((event: { type: string }) => event.type)).toEqual([
      'TICKET_CREATED',
      'CATEGORY_CORRECTED',
    ]);
  });

  it('rejects invalid queue pagination and boolean query values', async () => {
    await request(app.getHttpServer()).get('/tickets?page=0').expect(400);
    await request(app.getHttpServer()).get('/tickets?limit=101').expect(400);
    await request(app.getHttpServer())
      .get('/tickets?isFallback=sometimes')
      .expect(400);
  });

  it('rejects invalid ticket input', async () => {
    await request(app.getHttpServer())
      .post('/tickets')
      .send({ title: 'ab', description: 'short' })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toEqual({
          statusCode: 400,
          message: expect.any(String),
          error: 'Bad Request',
        });
      });

    await request(app.getHttpServer())
      .post('/tickets')
      .send({ title: 'Valid title' })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toEqual({
          statusCode: 400,
          message: expect.any(String),
          error: 'Bad Request',
        });
      });
  });

  it('returns 404 for a ticket that does not exist', () => {
    return request(app.getHttpServer())
      .get(`/tickets/${randomUUID()}`)
      .expect(404)
      .expect(({ body }) => {
        expect(body).toEqual({
          statusCode: 404,
          message: expect.any(String),
          error: 'Not Found',
        });
      });
  });

  afterEach(async () => {
    try {
      await prisma.ticket.deleteMany({
        where: { id: { in: createdTicketIds } },
      });
      await prisma.agent.deleteMany({
        where: { id: { in: createdAgentIds } },
      });
      await prisma.agent.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: createdWorkspaceIds } },
      });
    } finally {
      await app.close();
    }
  });
});
