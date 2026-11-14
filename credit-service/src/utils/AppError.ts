// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-opus-5), date: 2026-09-26
//  2026-09-26: Recess iteration - error class, copied from user-service/src/utils/AppError.ts.
//    No requirements, architecture, schema, or API decisions were made by the AI tool.
//    Author review: Wee Jean

export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
