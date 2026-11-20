import { ApiProperty } from '@nestjs/swagger';

export class TicketNoteResponseDto {
  @ApiProperty({ example: '0f8fad5b-d9cb-469f-a165-70867728950e' })
  id!: string;

  @ApiProperty({
    example: 'Checked the payment provider; awaiting confirmation.',
  })
  content!: string;

  @ApiProperty({ example: 'Avery Support' })
  authorName!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
