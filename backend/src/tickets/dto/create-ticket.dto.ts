import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateTicketDto {
  @ApiProperty({
    description: 'Short title describing the support ticket.',
    example: 'Payment issue',
    minLength: 3,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @ApiProperty({
    description: 'Details of the issue that needs support.',
    example: 'I need help with a payment that is still pending.',
    minLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description: string;
}
