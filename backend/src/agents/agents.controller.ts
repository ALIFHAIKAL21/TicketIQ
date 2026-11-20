import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@nestjs/authentication';
import { UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApiErrorResponseDto } from '../common/api-error-response.dto';
import { AgentResponseDto } from './dto/agent-response.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { AgentsService } from './agents.service';

@ApiTags('agents')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'A valid bearer access token is required.',
})
@ApiInternalServerErrorResponse({
  description: 'Unexpected server error.',
  type: ApiErrorResponseDto,
})
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @ApiOperation({ summary: 'List agents, active agents first' })
  @ApiOkResponse({ type: AgentResponseDto, isArray: true })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.agentsService.findAll(user.workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a support agent' })
  @ApiCreatedResponse({ type: AgentResponseDto })
  @ApiBadRequestResponse({
    description: 'The request body is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'An agent already uses this email.',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Only workspace admins can create agents.',
    type: ApiErrorResponseDto,
  })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateAgentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.agentsService.create(dto, user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an agent by ID' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AgentResponseDto })
  @ApiBadRequestResponse({ description: 'The ID must be a UUID.' })
  @ApiNotFoundResponse({
    description: 'The agent does not exist.',
    type: ApiErrorResponseDto,
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agentsService.findOne(id, user.workspaceId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update agent details or deactivate an agent' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: AgentResponseDto })
  @ApiBadRequestResponse({
    description: 'The ID or request body is invalid.',
    type: ApiErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The agent does not exist.',
    type: ApiErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Another agent already uses this email.',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Only workspace admins can update agents.',
    type: ApiErrorResponseDto,
  })
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.agentsService.update(id, dto, user.workspaceId);
  }
}
