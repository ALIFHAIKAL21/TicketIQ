import { Module } from '@nestjs/common';
import { MlClientModule } from '../ml-client/ml.client.module';
import { HealthController } from './health.controller';

@Module({
  imports: [MlClientModule],
  controllers: [HealthController],
})
export class HealthModule {}
