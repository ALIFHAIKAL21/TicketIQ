import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { Ticket } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketService } from './ticket.service';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  create(@Body() createTicketDto : CreateTicketDto) : Promise<Ticket> {
    return this.ticketService.create(createTicketDto);
  }

  @Get()
  findAll() : Promise<Ticket[]> {
    return this.ticketService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) : Promise<Ticket> {
    return this.ticketService.findOne(id);
  }
}