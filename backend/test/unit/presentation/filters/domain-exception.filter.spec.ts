import { DomainExceptionFilter } from '@/presentation/filters/domain-exception.filter';
import { DomainException } from '@/domain/exceptions/domain.exception';
import { ArgumentsHost, HttpStatus } from '@nestjs/common';

describe('DomainExceptionFilter', () => {
  let filter: DomainExceptionFilter;
  let mockArgumentsHost: ArgumentsHost;
  let mockResponse: any;

  beforeEach(() => {
    filter = new DomainExceptionFilter();

    // Mock Response object
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Mock ArgumentsHost
    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
      }),
    } as any;
  });

  it('should convert DomainException to 400 Bad Request', () => {
    // Arrange
    const exception = new DomainException('Agent must be running to terminate');

    // Act
    filter.catch(exception, mockArgumentsHost);

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Agent must be running to terminate',
      error: 'Bad Request',
    });
  });

  it('should handle empty prompt validation error', () => {
    // Arrange
    const exception = new DomainException('Prompt cannot be empty');

    // Act
    filter.catch(exception, mockArgumentsHost);

    // Assert
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Prompt cannot be empty',
      error: 'Bad Request',
    });
  });

  it('should preserve exception message in response', () => {
    // Arrange
    const customMessage = 'Custom domain rule violation';
    const exception = new DomainException(customMessage);

    // Act
    filter.catch(exception, mockArgumentsHost);

    // Assert
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: customMessage,
      })
    );
  });
});
