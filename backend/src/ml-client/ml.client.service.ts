import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TicketCategory, TicketUrgency } from '@prisma/client';
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
  // depedency injection untuk HttpService and ConfigService
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  
  async classify(ticketText: string): Promise<ClassificationResult> {
    const baseUrl = this.configService.getOrThrow<string>('ML_SERVICE_URL');
    const endpoint = `${baseUrl.replace(/\/+$/, '')}/classify`;

    const { data } = await firstValueFrom(
      this.httpService.post<MlClassificationResponse>(
        endpoint,
        { ticket_text: ticketText },
        { timeout: 5000 },
      ),
    );

    return { ...data, isFallback: false };
  }
}
