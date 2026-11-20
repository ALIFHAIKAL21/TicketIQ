import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import { AgentsModule } from './agents/agents.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { TicketModule } from './tickets/ticket.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthenticationModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const key = config.getOrThrow<string>('JWT_SECRET');
        if (Buffer.byteLength(key, 'utf8') < 32) {
          throw new Error('JWT_SECRET must be at least 32 bytes long');
        }

        return {
          accessToken: {
            key,
            issuer: 'ticketiq-api',
            audience: 'ticketiq-clients',
            ttl: '15m',
          },
          refreshToken: false,
          password: process.env.NODE_ENV === 'test' ? { logN: 10 } : undefined,
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          limit: readPositiveInteger(config, 'AUTH_LOGIN_LIMIT', 5),
          ttl: readPositiveInteger(config, 'AUTH_LOGIN_TTL_MS', 60_000),
        },
      ],
    }),
    PrismaModule,
    TicketModule,
    AgentsModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}

function readPositiveInteger(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const rawValue = config.get<string>(key);
  if (rawValue === undefined) return fallback;

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}
