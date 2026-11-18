import { ArgumentsHost, Logger } from '@nestjs/common';
import { FilterExceptionFilter } from './filter-exception.filter';

describe('FilterExceptionFilter', () => {
  it('hides unexpected error details from the client', () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const loggerSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      new FilterExceptionFilter().catch(
        new Error('database password must not be exposed'),
        host,
      );

      expect(response.status).toHaveBeenCalledWith(500);
      expect(response.json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
      });
      expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
        'database password',
      );
      expect(loggerSpy).toHaveBeenCalled();
    } finally {
      loggerSpy.mockRestore();
    }
  });
});
