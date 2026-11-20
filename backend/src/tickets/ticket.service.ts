import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TicketActivityType,
  TicketCategory,
  TicketStatus,
  TicketUrgency,
  type Ticket,
} from '@prisma/client';
import { MlClientService } from '../ml-client/ml.client.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertStatusTransition } from './domain/ticket-status';
import { getResolutionDeadline } from './domain/sla-policy';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketCategoryCorrectionDto } from './dto/create-ticket-category-correction.dto';
import { CreateTicketNoteDto } from './dto/create-ticket-note.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { FindTicketsQueryDto } from './dto/find-tickets-query.dto';
import { TicketSummaryResponseDto } from './dto/ticket-summary-response.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

export interface TicketActor {
  userId?: string;
  displayName: string;
}

export interface TicketPage {
  data: Ticket[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type TicketWithAssignee = Prisma.TicketGetPayload<{
  include: { assignee: true };
}>;

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mlClient: MlClientService,
  ) {}

  async create(
    dto: CreateTicketDto,
    actor: TicketActor,
    workspaceId: string,
  ): Promise<TicketWithAssignee> {
    const textForMl = `${dto.title}\n${dto.description}`;
    const classification = await this.mlClient.classify(textForMl);
    const createdAt = new Date();

    return this.prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.create({
        data: {
          title: dto.title,
          description: dto.description,
          category: classification.category,
          predictedCategory: classification.category,
          urgency: classification.urgency,
          isFallback: classification.isFallback,
          dueAt: getResolutionDeadline(classification.urgency, createdAt),
          createdAt,
          workspaceId,
        },
        include: { assignee: true },
      });

      await this.createActivity(transaction, {
        ticketId: ticket.id,
        type: TicketActivityType.TICKET_CREATED,
        actor,
        workspaceId,
        metadata: {
          category: classification.category,
          urgency: classification.urgency,
          isFallback: classification.isFallback,
        },
      });

      return ticket;
    });
  }

  findAll(
    query: FindTicketsQueryDto,
    workspaceId: string,
  ): Promise<TicketPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const whereClause = this.buildWhereClause(query, workspaceId);

    return this.prisma.$transaction(
      async (transaction) => {
        const [countRow] = await transaction.$queryRaw<
          Array<{ total: number }>
        >(Prisma.sql`
          SELECT COUNT(*)::int AS "total"
          FROM "Ticket"
          ${whereClause}
        `);
        const data = await transaction.$queryRaw<Ticket[]>(Prisma.sql`
          SELECT *
          FROM "Ticket"
          ${whereClause}
          ORDER BY
            CASE "urgency"
              WHEN 'High'::"TicketUrgency" THEN 3
              WHEN 'Medium'::"TicketUrgency" THEN 2
              WHEN 'Low'::"TicketUrgency" THEN 1
            END DESC,
            "createdAt" DESC,
            "id" ASC
          LIMIT ${limit}
          OFFSET ${offset}
        `);
        const total = countRow?.total ?? 0;

        return {
          data,
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  getSummary(workspaceId: string): Promise<TicketSummaryResponseDto> {
    const workspaceFilter = Prisma.sql`WHERE "workspaceId" = ${workspaceId}`;

    return this.prisma
      .$queryRaw<
        Array<{
          total: number;
          byStatus: Record<string, number>;
          openHighUrgency: number;
          unassigned: number;
          fallback: number;
          overdue: number;
        }>
      >(
        Prisma.sql`
      SELECT
        COUNT(*)::int AS "total",
        json_build_object(
          'NEW', COUNT(*) FILTER (WHERE "status" = ${TicketStatus.NEW}::"TicketStatus"),
          'IN_PROGRESS', COUNT(*) FILTER (WHERE "status" = ${TicketStatus.IN_PROGRESS}::"TicketStatus"),
          'RESOLVED', COUNT(*) FILTER (WHERE "status" = ${TicketStatus.RESOLVED}::"TicketStatus")
        ) AS "byStatus",
        COUNT(*) FILTER (
          WHERE "urgency" = ${TicketUrgency.High}::"TicketUrgency"
            AND "status" <> ${TicketStatus.RESOLVED}::"TicketStatus"
        )::int AS "openHighUrgency",
        COUNT(*) FILTER (WHERE "assigneeId" IS NULL)::int AS "unassigned",
        COUNT(*) FILTER (WHERE "isFallback" = true)::int AS "fallback",
        COUNT(*) FILTER (
          WHERE "dueAt" IS NOT NULL
            AND "dueAt" <= CURRENT_TIMESTAMP
            AND "status" <> ${TicketStatus.RESOLVED}::"TicketStatus"
        )::int AS "overdue"
      FROM "Ticket"
      ${workspaceFilter}
    `,
      )
      .then(([row]) => ({
        ...row,
        byStatus: Object.fromEntries(
          Object.entries(row.byStatus).map(([status, count]) => [
            status,
            Number(count),
          ]),
        ),
      }));
  }

  async findOne(id: string, workspaceId: string): Promise<TicketWithAssignee> {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, workspaceId },
      include: { assignee: true },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    return ticket;
  }

  async assign(
    ticketId: string,
    dto: AssignTicketDto,
    actor: TicketActor,
    workspaceId: string,
  ): Promise<TicketWithAssignee> {
    return this.prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findFirst({
        where: { id: ticketId, workspaceId },
      });
      if (!ticket) {
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      let nextAgent = null;
      if (dto.agentId !== null) {
        nextAgent = await transaction.agent.findFirst({
          where: {
            id: dto.agentId,
            workspaceId,
          },
        });
        if (!nextAgent) {
          throw new NotFoundException(`Agent with ID ${dto.agentId} not found`);
        }
        if (!nextAgent.isActive) {
          throw new ConflictException(
            'Cannot assign a ticket to an inactive agent',
          );
        }
      }

      if (ticket.assigneeId === dto.agentId) {
        return transaction.ticket.findUniqueOrThrow({
          where: { id: ticketId },
          include: { assignee: true },
        });
      }

      const updated = await transaction.ticket.updateMany({
        where: {
          id: ticketId,
          assigneeId: ticket.assigneeId,
          workspaceId,
        },
        data: { assigneeId: dto.agentId },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Ticket assignment changed; reload and retry',
        );
      }

      await this.createActivity(transaction, {
        ticketId,
        type: TicketActivityType.ASSIGNEE_CHANGED,
        actor,
        workspaceId,
        metadata: {
          fromAgentId: ticket.assigneeId,
          toAgentId: dto.agentId,
          toAgentName: nextAgent?.displayName ?? null,
        },
      });

      return transaction.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: { assignee: true },
      });
    });
  }

  async updateStatus(
    ticketId: string,
    dto: UpdateTicketStatusDto,
    actor: TicketActor,
    workspaceId: string,
  ): Promise<TicketWithAssignee> {
    return this.prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findFirst({
        where: { id: ticketId, workspaceId },
      });
      if (!ticket) {
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      if (ticket.status === dto.status) {
        return transaction.ticket.findUniqueOrThrow({
          where: { id: ticketId },
          include: { assignee: true },
        });
      }
      assertStatusTransition(ticket.status, dto.status);

      const resolvedAt =
        dto.status === TicketStatus.RESOLVED ? new Date() : null;
      const updated = await transaction.ticket.updateMany({
        where: {
          id: ticketId,
          status: ticket.status,
          workspaceId,
        },
        data: { status: dto.status, resolvedAt },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Ticket status changed; reload and retry');
      }

      await this.createActivity(transaction, {
        ticketId,
        type: TicketActivityType.STATUS_CHANGED,
        actor,
        workspaceId,
        metadata: { from: ticket.status, to: dto.status },
      });

      return transaction.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: { assignee: true },
      });
    });
  }

  async addNote(
    ticketId: string,
    dto: CreateTicketNoteDto,
    actor: TicketActor,
    workspaceId: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findFirst({
        where: { id: ticketId, workspaceId },
        select: { id: true },
      });
      if (!ticket) {
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      const note = await transaction.ticketNote.create({
        data: {
          ticketId,
          content: dto.content,
          authorName: actor.displayName,
          authorUserId: actor.userId ?? null,
          workspaceId,
        },
      });
      await this.createActivity(transaction, {
        ticketId,
        type: TicketActivityType.INTERNAL_NOTE_ADDED,
        actor,
        workspaceId,
        metadata: { noteId: note.id },
      });
      return note;
    });
  }

  async correctCategory(
    ticketId: string,
    dto: CreateTicketCategoryCorrectionDto,
    actor: TicketActor,
    workspaceId: string,
  ): Promise<TicketWithAssignee> {
    return this.prisma.$transaction(async (transaction) => {
      const ticket = await transaction.ticket.findFirst({
        where: { id: ticketId, workspaceId },
      });
      if (!ticket) {
        throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
      }

      if (ticket.category === dto.category) {
        throw new ConflictException(
          'The corrected category must differ from the current category',
        );
      }

      const previousCategory: TicketCategory = ticket.category;
      const updated = await transaction.ticket.updateMany({
        where: {
          id: ticketId,
          category: previousCategory,
          workspaceId,
        },
        data: { category: dto.category },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Ticket category changed; reload and retry',
        );
      }

      await this.createActivity(transaction, {
        ticketId,
        type: TicketActivityType.CATEGORY_CORRECTED,
        actor,
        workspaceId,
        metadata: {
          predictedCategory: ticket.predictedCategory,
          from: previousCategory,
          to: dto.category,
          reason: dto.reason,
        },
      });

      return transaction.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: { assignee: true },
      });
    });
  }

  async findActivity(ticketId: string, workspaceId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, workspaceId },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    return this.prisma.ticketActivity.findMany({
      where: { ticketId, workspaceId },
      orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }],
    });
  }

  private createActivity(
    transaction: Prisma.TransactionClient,
    input: {
      ticketId: string;
      type: TicketActivityType;
      actor: TicketActor;
      workspaceId: string;
      metadata: Prisma.InputJsonValue;
    },
  ) {
    return transaction.ticketActivity.create({
      data: {
        ticketId: input.ticketId,
        type: input.type,
        actorName: input.actor.displayName,
        actorUserId: input.actor.userId ?? null,
        workspaceId: input.workspaceId,
        metadata: input.metadata,
      },
    });
  }

  private buildWhereClause(
    query: FindTicketsQueryDto,
    workspaceId: string,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"workspaceId" = ${workspaceId}`,
    ];
    if (query.category) {
      conditions.push(
        Prisma.sql`"category" = ${query.category}::"TicketCategory"`,
      );
    }
    if (query.urgency) {
      conditions.push(
        Prisma.sql`"urgency" = ${query.urgency}::"TicketUrgency"`,
      );
    }
    if (query.status) {
      conditions.push(Prisma.sql`"status" = ${query.status}::"TicketStatus"`);
    }
    if (query.assigneeId) {
      conditions.push(Prisma.sql`"assigneeId" = ${query.assigneeId}`);
    }
    if (query.isFallback !== undefined) {
      conditions.push(Prisma.sql`"isFallback" = ${query.isFallback}`);
    }
    if (query.overdue === true) {
      conditions.push(
        Prisma.sql`
          "dueAt" IS NOT NULL
          AND "dueAt" <= CURRENT_TIMESTAMP
          AND "status" <> ${TicketStatus.RESOLVED}::"TicketStatus"
        `,
      );
    } else if (query.overdue === false) {
      conditions.push(
        Prisma.sql`
          (
            "dueAt" IS NULL
            OR "dueAt" > CURRENT_TIMESTAMP
            OR "status" = ${TicketStatus.RESOLVED}::"TicketStatus"
          )
        `,
      );
    }
    if (query.q) {
      const searchTerm = `%${query.q}%`;
      conditions.push(
        Prisma.sql`("title" ILIKE ${searchTerm} OR "description" ILIKE ${searchTerm})`,
      );
    }
    return conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;
  }
}
