import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TicketCategory, TicketUrgency } from '@prisma/client';
import type { Ticket } from '@prisma/client';
import { CurrentUser } from '@nestjs/authentication';
import { ApiErrorResponseDto } from '../common/api-error-response.dto';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketNoteDto } from './dto/create-ticket-note.dto';
import { FindTicketsQueryDto } from './dto/find-tickets-query.dto';
import { TicketActivityResponseDto } from './dto/ticket-activity-response.dto';
import { CreateTicketCategoryCorrectionDto } from './dto/create-ticket-category-correction.dto';
import { TicketNoteResponseDto } from './dto/ticket-note-response.dto';
import { TicketPageResponseDto } from './dto/ticket-page-response.dto';
import { TicketResponseDto } from './dto/ticket-response.dto';
import { TicketSummaryResponseDto } from './dto/ticket-summary-response.dto';
import { TicketService } from './ticket.service';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@ApiTags('tickets')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'A valid bearer access token is required.',
  type: ApiErrorResponseDto,
})
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
  @ApiInternalServerErrorResponse({
    description: 'Ticket creation failed unexpectedly.',
    type: ApiErrorResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
    type: ApiErrorResponseDto,
  })
  create(
    @Body() createTicketDto: CreateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Ticket> {
    return this.ticketService.create(
      createTicketDto,
      this.actor(user),
      user.workspaceId,
    );
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
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['NEW', 'IN_PROGRESS', 'RESOLVED'],
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Search title and description.',
  })
  @ApiQuery({
    name: 'assigneeId',
    required: false,
    description: 'Filter by assigned agent UUID.',
  })
  @ApiQuery({
    name: 'isFallback',
    required: false,
    type: Boolean,
    description: 'Filter tickets classified using fallback.',
  })
  @ApiQuery({
    name: 'overdue',
    required: false,
    type: Boolean,
    description: 'Filter active tickets by resolution SLA deadline.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiOkResponse({
    description:
      'Paginated tickets ordered by urgency, then newest first with a stable ID tie-breaker.',
    type: TicketPageResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'A query filter contains an unsupported value.',
    type: ApiErrorResponseDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Ticket listing failed unexpectedly.',
    type: ApiErrorResponseDto,
  })
  findAll(
    @Query() query: FindTicketsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.findAll(query, user.workspaceId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get live ticket queue counts' })
  @ApiOkResponse({ type: TicketSummaryResponseDto })
  getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.ticketService.getSummary(user.workspaceId);
  }

  @Patch(':id/assignee')
  @ApiOperation({ summary: 'Assign or unassign a ticket' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AssignTicketDto })
  @ApiOkResponse({ type: TicketResponseDto })
  @ApiBadRequestResponse({
    description: 'The ticket ID or request body is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'The agent is inactive or the assignment changed concurrently.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The ticket or agent does not exist.',
    type: ApiErrorResponseDto,
  })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.assign(
      id,
      dto,
      this.actor(user),
      user.workspaceId,
    );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change the workflow status of a ticket' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateTicketStatusDto })
  @ApiOkResponse({ type: TicketResponseDto })
  @ApiBadRequestResponse({
    description: 'The ticket ID or status value is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'The status transition is not allowed or state changed concurrently.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The ticket does not exist.',
    type: ApiErrorResponseDto,
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.updateStatus(
      id,
      dto,
      this.actor(user),
      user.workspaceId,
    );
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a private support-team note' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreateTicketNoteDto })
  @ApiCreatedResponse({ type: TicketNoteResponseDto })
  @ApiBadRequestResponse({
    description: 'The ticket ID or note is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The ticket does not exist.',
    type: ApiErrorResponseDto,
  })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.addNote(
      id,
      dto,
      this.actor(user),
      user.workspaceId,
    );
  }

  @Patch(':id/category')
  @ApiOperation({
    summary: 'Correct the final category without changing the ML prediction',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: CreateTicketCategoryCorrectionDto })
  @ApiOkResponse({ type: TicketResponseDto })
  @ApiBadRequestResponse({
    description: 'The category or correction reason is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description:
      'The selected category is already current or changed concurrently.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The ticket does not exist.',
    type: ApiErrorResponseDto,
  })
  correctCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTicketCategoryCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.correctCategory(
      id,
      dto,
      this.actor(user),
      user.workspaceId,
    );
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get the append-only activity history of a ticket' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: TicketActivityResponseDto, isArray: true })
  @ApiNotFoundResponse({
    description: 'The ticket does not exist.',
    type: ApiErrorResponseDto,
  })
  findActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ticketService.findActivity(id, user.workspaceId);
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
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Ticket> {
    return this.ticketService.findOne(id, user.workspaceId);
  }

  private actor(user: AuthenticatedUser) {
    return { userId: user.id, displayName: user.displayName };
  }
}
