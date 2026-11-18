import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TicketCategory, TicketUrgency } from '@prisma/client';
import type { Ticket } from '@prisma/client';
import { ApiErrorResponseDto } from '../common/api-error-response.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { FindTicketsQueryDto } from './dto/find-tickets-query.dto';
import { TicketResponseDto } from './dto/ticket-response.dto';
import { TicketService } from './ticket.service';

@ApiTags('tickets')
@ApiInternalServerErrorResponse({
  description: 'Unexpected server error.',
  type: ApiErrorResponseDto,
})
@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Post()
  @ApiOperation({ summary: 'Create and classify a ticket' })
  @ApiBody({ type: CreateTicketDto })
  @ApiCreatedResponse({
    description: 'The ticket was created and classified.',
    type: TicketResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
    type: ApiErrorResponseDto,
  })
  create(@Body() createTicketDto: CreateTicketDto): Promise<Ticket> {
    return this.ticketService.create(createTicketDto);
  }

  @Get()
  @ApiOperation({ summary: 'List tickets with optional filters' })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: TicketCategory,
    enumName: 'TicketCategory',
    example: TicketCategory.PAYMENT,
  })
  @ApiQuery({
    name: 'urgency',
    required: false,
    enum: TicketUrgency,
    enumName: 'TicketUrgency',
    example: TicketUrgency.High,
  })
  @ApiOkResponse({
    description: 'Tickets ordered by urgency, then newest first.',
    type: TicketResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'A query filter contains an unsupported value.',
    type: ApiErrorResponseDto,
  })
  findAll(@Query() query: FindTicketsQueryDto): Promise<Ticket[]> {
    return this.ticketService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a ticket by ID' })
  @ApiParam({
    name: 'id',
    description: 'UUID of the ticket.',
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
  })
  @ApiOkResponse({
    description: 'The requested ticket.',
    type: TicketResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'No ticket exists with the supplied ID.',
    type: ApiErrorResponseDto,
  })
  findOne(@Param('id') id: string): Promise<Ticket> {
    return this.ticketService.findOne(id);
  }
}
