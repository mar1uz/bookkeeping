/** A refusal whose message the person may read. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function refuse(message: string): never {
  throw new UserError(message);
}
