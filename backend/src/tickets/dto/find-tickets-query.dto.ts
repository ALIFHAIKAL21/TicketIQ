import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { TicketCategory, TicketStatus, TicketUrgency } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class FindTicketsQueryDto {
  @ApiPropertyOptional({
    description: 'Return tickets in this category.',
    enum: TicketCategory,
    enumName: 'TicketCategory',
    example: TicketCategory.PAYMENT,
  })
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @ApiPropertyOptional({
    description: 'Return tickets with this urgency.',
    enum: TicketUrgency,
    enumName: 'TicketUrgency',
    example: TicketUrgency.High,
  })
  @IsOptional()
  @IsEnum(TicketUrgency)
  urgency?: TicketUrgency;

  @ApiPropertyOptional({
    description: 'Filter tickets by workflow status.',
    enum: TicketStatus,
    example: TicketStatus.NEW,
  })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({
    description: 'Search title and description.',
    example: 'payment',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({
    description: 'Filter by assigned agent UUID.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({
    description: 'Filter on whether ML fallback was used.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isFallback?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter active tickets by whether their resolution SLA is overdue.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  overdue?: boolean;

  @ApiPropertyOptional({
    description: 'One-based result page; maximum 1,000,000.',
    default: 1,
    minimum: 1,
    maximum: 1_000_000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of tickets per page; maximum 100.',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
