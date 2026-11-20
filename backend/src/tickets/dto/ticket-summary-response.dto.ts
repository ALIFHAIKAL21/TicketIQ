import { ApiProperty } from '@nestjs/swagger';

export class TicketSummaryResponseDto {
  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { NEW: 12, IN_PROGRESS: 20, RESOLVED: 10 },
  })
  byStatus!: Record<string, number>;

  @ApiProperty({ example: 4 })
  openHighUrgency!: number;

  @ApiProperty({ example: 6 })
  unassigned!: number;

  @ApiProperty({ example: 2 })
  fallback!: number;

  @ApiProperty({ example: 3 })
  overdue!: number;
}
