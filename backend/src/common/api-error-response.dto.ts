import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    description: 'A client-safe explanation of the error.',
    example: 'title must be longer than or equal to 3 characters',
  })
  message!: string;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;
}
