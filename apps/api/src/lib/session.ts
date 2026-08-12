import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";
import type { Response } from "express";
import { config } from "../config.js";

export const SESSION_COOKIE = "kk_session";
const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

const secret = new TextEncoder().encode(config.SESSION_SECRET);

export type SessionClaims = {
  uid: string;
  role: Role | null;
};

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(secret);
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.uid !== "string") return null;
    return { uid: payload.uid, role: (payload.role as Role | null) ?? null };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
