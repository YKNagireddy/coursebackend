export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);

    this.name = "HttpError";
    this.statusCode = statusCode;

    Error.captureStackTrace?.(this, HttpError);
  }
}