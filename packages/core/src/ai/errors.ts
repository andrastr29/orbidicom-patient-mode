/** Thrown when an import payload is unrecognized or malformed. */
export class ImportError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "ImportError";
    this.reason = reason;
  }
}
