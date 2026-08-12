import crypto from "node:crypto";
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { roleSelectSchema } from "@khelkhud/shared";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  clearSessionCookie,
  setSessionCookie,
  signSession,
} from "../lib/session.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { validate } from "../middleware/validate.js";

export const authRouter: Router = Router();

const STATE_COOKIE = "kk_oauth_state";

function oauthClient(): OAuth2Client {
  return new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    `${config.API_URL}/api/auth/google/callback`,
  );
}

function dashboardPath(role: string | null): string {
  switch (role) {
    case "PLAYER":
      return "/dashboard/player";
    case "SPONSOR":
      return "/dashboard/sponsor";
    case "ADMIN":
      return "/admin";
    default:
      return "/onboarding";
  }
}

authRouter.get("/google", (req, res) => {
  if (!config.GOOGLE_CLIENT_ID) {
    res.status(503).json({
      error: { code: "OAUTH_NOT_CONFIGURED", message: "Set GOOGLE_CLIENT_ID/SECRET in .env" },
    });
    return;
  }
  const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "";
  const state = crypto.randomBytes(16).toString("hex");
  res.cookie(STATE_COOKIE, JSON.stringify({ state, redirect }), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    maxAge: 10 * 60 * 1000,
  });
  const url = oauthClient().generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
  res.redirect(url);
});

authRouter.get("/google/callback", async (req, res, next) => {
  try {
    const { code, state } = req.query;
    const rawStateCookie = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);
    if (typeof code !== "string" || typeof state !== "string" || !rawStateCookie) {
      throw new ApiError(400, "OAUTH_STATE", "Invalid OAuth callback");
    }
    let stored: { state: string; redirect: string };
    try {
      stored = JSON.parse(rawStateCookie);
    } catch {
      throw new ApiError(400, "OAUTH_STATE", "Invalid OAuth state");
    }
    if (stored.state !== state) {
      throw new ApiError(400, "OAUTH_STATE", "OAuth state mismatch");
    }

    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new ApiError(400, "OAUTH_TOKEN", "Missing ID token");
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new ApiError(400, "OAUTH_TOKEN", "Google account missing email");
    }

    const email = payload.email.toLowerCase();
    const isAdmin = config.adminEmails.includes(email);
    const name = payload.name ?? email.split("@")[0] ?? "User";

    let user = await prisma.user.findUnique({ where: { googleSub: payload.sub } });
    if (!user) {
      // Link an account pre-created by seed/admin (matched by email), else create.
      const byEmail = await prisma.user.findUnique({ where: { email } });
      user = byEmail
        ? await prisma.user.update({
            where: { id: byEmail.id },
            data: { googleSub: payload.sub, avatarUrl: payload.picture ?? byEmail.avatarUrl },
          })
        : await prisma.user.create({
            data: {
              email,
              googleSub: payload.sub,
              name,
              avatarUrl: payload.picture,
              role: isAdmin ? "ADMIN" : null,
            },
          });
    }
    if (isAdmin && user.role !== "ADMIN") {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    }
    if (!user.isActive) {
      throw new ApiError(403, "ACCOUNT_DISABLED", "This account has been disabled");
    }

    setSessionCookie(res, await signSession({ uid: user.id, role: user.role }));
    logger.info({ email, role: user.role }, "User signed in");

    const target =
      user.role === null
        ? "/onboarding"
        : stored.redirect && stored.redirect.startsWith("/")
          ? stored.redirect
          : dashboardPath(user.role);
    res.redirect(`${config.WEB_URL}${target}`);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/role", requireAuth, validate(roleSelectSchema), async (req, res, next) => {
  try {
    const { role } = req.body as { role: "PLAYER" | "SPONSOR" };
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.uid } });
    if (user.role !== null) {
      throw new ApiError(409, "ROLE_ALREADY_SET", "Role has already been chosen");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: user.id }, data: { role } });
      if (role === "PLAYER") {
        await tx.playerProfile.create({ data: { userId: user.id } });
      } else {
        await tx.sponsorProfile.create({ data: { userId: user.id } });
      }
      return u;
    });
    setSessionCookie(res, await signSession({ uid: updated.id, role: updated.role }));
    res.json({ data: { role: updated.role, redirect: dashboardPath(updated.role) } });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.uid },
      include: {
        playerProfile: { select: { id: true, verificationStatus: true, sportId: true } },
        sponsorProfile: { select: { id: true, verificationStatus: true, displayName: true } },
      },
    });
    if (!user || !user.isActive) {
      throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
    }
    res.json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
        playerProfile: user.playerProfile,
        sponsorProfile: user.sponsorProfile,
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ data: { ok: true } });
});
