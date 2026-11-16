import { Injectable, NotFoundException } from '@nestjs/common';
import type { Ticket } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

@Injectable()
export class TicketService {
  constructor(private readonly prisma: PrismaService) {}

  create(createTicketDto: CreateTicketDto): Promise<Ticket> {
    return this.prisma.ticket.create({
      data: createTicketDto,
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