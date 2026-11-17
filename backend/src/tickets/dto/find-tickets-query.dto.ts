import { IsEnum, IsOptional } from 'class-validator';
import { TicketCategory, TicketUrgency } from '@prisma/client';

export class FindTicketsQueryDto {
  @IsOptional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(TicketUrgency)
  urgency?: TicketUrgency;
}
