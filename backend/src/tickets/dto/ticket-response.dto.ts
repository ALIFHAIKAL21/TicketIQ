import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus, TicketCategory, TicketUrgency } from '@prisma/client';
import { AgentResponseDto } from '../../agents/dto/agent-response.dto';

export class TicketResponseDto {
  @ApiProperty({
    description: 'Unique ticket identifier.',
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
  })
  id!: string;

  @ApiProperty({ example: 'Payment issue' })
  title!: string;

  @ApiProperty({
    example: 'I need help with a payment that is still pending.',
  })
  description!: string;

  @ApiProperty({
    enum: TicketCategory,
    enumName: 'TicketCategory',
    example: TicketCategory.PAYMENT,
  })
  category!: TicketCategory;

  @ApiPropertyOptional({
    description:
      'Original category returned by ML when the ticket was created.',
    enum: TicketCategory,
    enumName: 'TicketCategory',
    nullable: true,
    example: TicketCategory.PAYMENT,
  })
  predictedCategory!: TicketCategory | null;

  @ApiProperty({
    enum: TicketUrgency,
    enumName: 'TicketUrgency',
    example: TicketUrgency.High,
  })
  urgency!: TicketUrgency;

  @ApiProperty({
    description: 'Whether classification used the fallback values.',
    example: false,
  })
  isFallback!: boolean;

  @ApiProperty({ enum: TicketStatus, example: TicketStatus.NEW })
  status!: TicketStatus;

  @ApiPropertyOptional({
    description: 'Assigned agent ID, or null when the ticket is unassigned.',
    nullable: true,
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
  })
  assigneeId!: string | null;

  @ApiPropertyOptional({
    type: () => AgentResponseDto,
    nullable: true,
  })
  assignee!: AgentResponseDto | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-11-20T12:00:00.000Z',
  })
  dueAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
  })
  resolvedAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2025-01-15T10:30:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2025-01-15T10:30:00.000Z',
  })
  updatedAt!: Date;
}
