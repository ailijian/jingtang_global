export type ApplicationErrorCode =
  | "authentication_failed"
  | "confirmation_required"
  | "conflict"
  | "invalid_input"
  | "not_found"
  | "payload_too_large"
  | "permission_denied"
  | "rate_limited"
  | "service_unavailable";

const applicationErrorCodes: ReadonlySet<string> = new Set<ApplicationErrorCode>([
  "authentication_failed",
  "confirmation_required",
  "conflict",
  "invalid_input",
  "not_found",
  "payload_too_large",
  "permission_denied",
  "rate_limited",
  "service_unavailable",
]);

export class ApplicationError extends Error {
  public constructor(
    public readonly code: ApplicationErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}

export function isApplicationError(error: unknown): error is ApplicationError {
  if (!(error instanceof Error) || error.name !== "ApplicationError") return false;
  const candidate = error as Partial<ApplicationError>;
  return (
    typeof candidate.code === "string" &&
    applicationErrorCodes.has(candidate.code) &&
    typeof candidate.status === "number" &&
    Number.isInteger(candidate.status) &&
    candidate.status >= 400 &&
    candidate.status <= 599
  );
}
