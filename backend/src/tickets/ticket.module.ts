import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MlClientModule } from '../ml-client/ml.client.module';

@Module({
  imports: [PrismaModule, MlClientModule],
  providers: [TicketService],
  controllers: [TicketController],
})
export class TicketModule {}
