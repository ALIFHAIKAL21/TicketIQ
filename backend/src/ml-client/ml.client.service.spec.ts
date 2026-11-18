import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { TicketCategory, TicketUrgency } from '@prisma/client';
import { of, throwError } from 'rxjs';
import { MlClientService } from './ml.client.service';

describe('MlClientService', () => {
  let service: MlClientService;
  let post: jest.Mock;
  let configGetOrThrow: jest.Mock;

  beforeEach(() => {
    post = jest.fn();
    configGetOrThrow = jest.fn().mockReturnValue('http://ml-service.test/');

    const httpService = { post } as unknown as HttpService;
    const configService = {
      getOrThrow: configGetOrThrow,
    } as unknown as ConfigService;

    service = new MlClientService(httpService, configService);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the ticket text and returns a successful classification', async () => {
    post.mockReturnValue(
      of({
        data: {
          category: TicketCategory.REFUND,
          urgency: TicketUrgency.High,
        },
      }),
    );

    await expect(
      service.classify('I need help with a refund.'),
    ).resolves.toEqual({
      category: TicketCategory.REFUND,
      urgency: TicketUrgency.High,
      isFallback: false,
    });

    expect(configGetOrThrow).toHaveBeenCalledWith('ML_SERVICE_URL');
    expect(post).toHaveBeenCalledWith(
      'http://ml-service.test/classify',
      { ticket_text: 'I need help with a refund.' },
      { timeout: 5000 },
    );
  });

  it('returns the fallback classification when the ML request fails', async () => {
    post.mockReturnValue(throwError(() => new Error('service unavailable')));

    await expect(
      service.classify('I need help with a refund.'),
    ).resolves.toEqual({
      category: TicketCategory.UNCLASSIFIED,
      urgency: TicketUrgency.Medium,
      isFallback: true,
    });
  });
});
