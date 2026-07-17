export class CodexbarError extends Error {
  constructor(
    readonly code: "CODEXBAR_UNAVAILABLE" | "CODEXBAR_TIMEOUT" | "CODEXBAR_INVALID_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "CodexbarError";
  }
}
