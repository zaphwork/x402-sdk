/**
 * Custom error classes for ZaphWork SDK
 */

export class ZaphWorkError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'ZaphWorkError';
  }
}

export class AuthenticationError extends ZaphWorkError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class ValidationError extends ZaphWorkError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ZaphWorkError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class InsufficientFundsError extends ZaphWorkError {
  constructor(message: string = 'Insufficient funds') {
    super(message, 400);
    this.name = 'InsufficientFundsError';
  }
}
