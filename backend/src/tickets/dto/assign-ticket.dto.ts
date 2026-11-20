import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsUUID, ValidateIf } from 'class-validator';

export class AssignTicketDto {
  @ApiProperty({
    description: 'Active agent UUID, or null to unassign the ticket.',
    nullable: true,
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsUUID()
  agentId: string | null;
}
