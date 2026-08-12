import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { SESSION_COOKIE, verifySession, type SessionClaims } from "../lib/session.js";
import { ApiError } from "./errors.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionClaims;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const claims = await verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!claims) {
    next(new ApiError(401, "UNAUTHENTICATED", "Sign in required"));
    return;
  }
  req.user = claims;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      next(new ApiError(403, "FORBIDDEN", "You do not have access to this resource"));
      return;
    }
    next();
  };
}
