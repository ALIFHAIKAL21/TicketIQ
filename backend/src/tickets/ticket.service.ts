import { Injectable, NotFoundException } from '@nestjs/common';
import type { Ticket } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { MlClientService } from '../ml-client/ml.client.service';

@Injectable()
export class TicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mlClient: MlClientService,
  ) {}

  // create(createTicketDto: CreateTicketDto): Promise<Ticket> {
  //   return this.prisma.ticket.create({
  //     data: createTicketDto,
  //   });
  // }

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

  findAll(): Promise<Ticket[]> {
    return this.prisma.ticket.findMany();
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