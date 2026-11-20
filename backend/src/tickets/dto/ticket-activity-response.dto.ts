import { ApiProperty } from '@nestjs/swagger';
import { TicketActivityType } from '@prisma/client';

export class TicketActivityResponseDto {
  @ApiProperty({ example: '0f8fad5b-d9cb-469f-a165-70867728950e' })
  id!: string;

  @ApiProperty({ enum: TicketActivityType })
  type!: TicketActivityType;

  @ApiProperty({ example: 'Avery Support' })
  actorName!: string;

  @ApiProperty({
    description:
      'Event-specific details. Note content is kept in the note record.',
    nullable: true,
    example: { from: 'NEW', to: 'IN_PROGRESS' },
  })
  metadata!: object | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
