import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTicketNoteDto {
  @ApiProperty({
    description: 'Private note for the support team; not a customer reply.',
    example: 'Checked the payment provider; awaiting confirmation.',
    maxLength: 5000,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}
