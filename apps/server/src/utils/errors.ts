export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> | null = null,
    readonly retryable = statusCode >= 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}
