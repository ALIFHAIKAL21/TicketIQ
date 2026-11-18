import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import {ConfigModule} from "@nestjs/config";
import {PrismaModule} from "./prisma/prisma.module";
import {TicketModule} from "./tickets/ticket.module";
import { HealthModule } from './health/health.module';


@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [ConfigModule.forRoot({
      isGlobal: true,
    }), PrismaModule, TicketModule, HealthModule
  ],
})
export class AppModule {}
