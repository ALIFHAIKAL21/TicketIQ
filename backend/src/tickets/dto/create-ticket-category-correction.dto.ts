import { ApiProperty } from '@nestjs/swagger';
import { TicketCategory } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTicketCategoryCorrectionDto {
  @ApiProperty({ enum: TicketCategory, example: TicketCategory.REFUND })
  @IsEnum(TicketCategory)
  category: TicketCategory;

  @ApiProperty({
    description: 'Why the initial category was corrected.',
    example: 'The customer is asking to reverse a duplicate charge.',
    minLength: 5,
    maxLength: 1000,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}
