import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({
    enum: ['reachable', 'unreachable'],
    example: 'reachable',
  })
  mlService!: 'reachable' | 'unreachable';
}
