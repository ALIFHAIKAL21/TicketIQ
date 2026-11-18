import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketCategory, TicketUrgency } from '@prisma/client';
import { firstValueFrom } from 'rxjs';


interface MlClassificationResponse {
  category: TicketCategory;
  urgency: TicketUrgency;
}

export interface ClassificationResult extends MlClassificationResponse {
  isFallback: boolean;
}

@Injectable()
export class MlClientService {
    private readonly logger = new Logger(MlClientService.name)
  // depedency injection untuk HttpService and ConfigService
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  
  ) {}
  
  async classify(ticketText: string): Promise<ClassificationResult> {
    const baseUrl = this.configService.getOrThrow<string>('ML_SERVICE_URL');
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/classify`;

    try {
const { data } = await firstValueFrom(
      this.httpService.post<MlClassificationResponse>(
        endpoint,
        { ticket_text: ticketText },
        { timeout: 5000 },
      ),
    );

    this.logger.log(`Successfully classified ticket: ${JSON.stringify(data)}`);
    return { ...data, isFallback: false };
    }

    catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Error classifying ticket: ${reason}`);
       return {
      category: TicketCategory.UNCLASSIFIED,
      urgency: TicketUrgency.Medium,
      isFallback: true,
    };
    }

  }

  async isReachable(): Promise<boolean> {
    const baseUrl = this.configService.getOrThrow<string>('ML_SERVICE_URL');
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/openapi.json`;

    try {
      await firstValueFrom(
        this.httpService.get(endpoint, {
          timeout: 2000,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}
