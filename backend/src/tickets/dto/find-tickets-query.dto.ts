import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketCategory, TicketUrgency } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

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
}
