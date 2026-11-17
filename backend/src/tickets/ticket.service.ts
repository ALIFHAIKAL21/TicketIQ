import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Ticket } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { MlClientService } from '../ml-client/ml.client.service';
import { FindTicketsQueryDto } from './dto/find-tickets-query.dto';

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mlClient: MlClientService,
  ) {}

  async create(dto: CreateTicketDto): Promise<Ticket> {
 
  const textForMl = `${dto.title}\n${dto.description}`;
  const classification = await this.mlClient.classify(textForMl);

  return this.prisma.ticket.create({
    data: {
      title: dto.title,
      description: dto.description,
      category: classification.category,
      urgency: classification.urgency,
      isFallback: classification.isFallback,
    },
  });
}

  findAll(query: FindTicketsQueryDto): Promise<Ticket[]> {
    const conditions = [];

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

    const whereClause =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    return this.prisma.$queryRaw<Ticket[]>(Prisma.sql`
      SELECT *
      FROM "Ticket"
      ${whereClause}
      ORDER BY
        CASE "urgency"
          WHEN 'High'::"TicketUrgency" THEN 3
          WHEN 'Medium'::"TicketUrgency" THEN 2
          WHEN 'Low'::"TicketUrgency" THEN 1
        END DESC,
        "createdAt" DESC
    `);
  }

  async findOne(id: string): Promise<Ticket> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
    })

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    return ticket;
  }
}