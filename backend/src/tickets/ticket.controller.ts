import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { Ticket } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { FindTicketsQueryDto } from './dto/find-tickets-query.dto';
import { TicketService } from './ticket.service';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  create(@Body() createTicketDto : CreateTicketDto) : Promise<Ticket> {
    return this.ticketService.create(createTicketDto);
  }

  @Get()
  findAll(@Query() query: FindTicketsQueryDto): Promise<Ticket[]> {
    return this.ticketService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) : Promise<Ticket> {
    return this.ticketService.findOne(id);
  }
}