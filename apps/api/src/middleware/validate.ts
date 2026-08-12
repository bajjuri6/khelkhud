import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ApiError } from "./errors.js";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      next(
        new ApiError(
          400,
          "VALIDATION",
          first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request body",
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
