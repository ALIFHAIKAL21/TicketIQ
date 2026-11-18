import { ApiProperty } from '@nestjs/swagger';
import { TicketCategory, TicketUrgency } from '@prisma/client';

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
