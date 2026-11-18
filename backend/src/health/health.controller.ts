import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/api-error-response.dto';
import { MlClientService } from '../ml-client/ml.client.service';
import { HealthResponseDto } from './health-response.dto';

@ApiTags('health')
@ApiInternalServerErrorResponse({
  description: 'Unexpected server error.',
  type: ApiErrorResponseDto,
})
@Controller('health')
export class HealthController {
  constructor(private readonly mlClient: MlClientService) {}

  @Get()
  @ApiOperation({ summary: 'Check backend and ML service availability' })
  @ApiOkResponse({
    description: 'Backend status and ML service connectivity.',
    type: HealthResponseDto,
  })
  async check() {
    const mlServiceReachable = await this.mlClient.isReachable();

    return {
      status: 'ok',
      mlService: mlServiceReachable ? 'reachable' : 'unreachable',
    };
  }
}
