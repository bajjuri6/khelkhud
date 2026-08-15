import crypto from "node:crypto";
import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { loginSchema, registerSchema, roleSelectSchema } from "@khelkhud/shared";
import type { LoginInput, RegisterInput, RoleSelectInput } from "@khelkhud/shared";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../lib/password.js";
import {
  clearSessionCookie,
  setSessionCookie,
  signSession,
} from "../lib/session.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/errors.js";
import { rateLimit } from "../middleware/rate-limit.js";
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
    case "ATHLETE":
      return "/dashboard/athlete";
    case "SPONSOR":
      return "/dashboard/sponsor";
    case "COORDINATOR":
      return "/dashboard/coordinator";
    case "SUPPLIER":
      return "/dashboard/supplier";
    case "ADMIN":
      return "/admin";
    default:
      return "/onboarding";
  }
}

// ---------------------------------------------------------------------------
// Native email + password
//
// Google stays the recommended path, but requiring it excludes people who have no Google
// account or simply distrust social sign-in — which, for district athletes and small
// individual sponsors, is a meaningful share of the intended users.
//
// Both handlers below return the SAME session cookie the OAuth callback issues, so every
// downstream route, middleware and role check is unchanged.
// ---------------------------------------------------------------------------

// Registration is IP-limited only: there is no target account yet, so there is nothing
// account-specific to key on. Generous enough for a shared connection, tight enough that
// scripted signup floods need real infrastructure.
const registerLimiter = rateLimit({ name: "register", max: 5, windowMs: 60 * 60 * 1000 });

// Login is keyed on IP *and* submitted email. Keying on IP alone lets one attacker lock
// out everyone behind the same NAT; keying on email alone lets them lock a known user out
// of their own account from anywhere. Both together throttles the actual attack —
// repeated guesses at one account — without either denial-of-service side effect.
const loginLimiter = rateLimit({
  name: "login",
  max: 10,
  windowMs: 15 * 60 * 1000,
  keyOn: (req) => String((req.body as { email?: unknown })?.email ?? "").toLowerCase(),
});

authRouter.post("/register", registerLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { name, email, password } = req.body as RegisterInput;

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      // An account already on this email. Two cases, and they need different handling.
      if (existing.passwordHash) {
        throw new ApiError(
          409,
          "EMAIL_TAKEN",
          "An account with this email already exists. Sign in instead.",
        );
      }
      // Google-only account (or one pre-created by seed/admin). Do NOT set a password
      // here just because someone knows the address — that is account takeover with extra
      // steps. Point them at the flow that proves they control the account.
      throw new ApiError(
        409,
        "USE_GOOGLE",
        "This email is already registered with Google. Continue with Google to sign in.",
      );
    }

    const isAdmin = config.adminEmails.includes(email);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await hashPassword(password),
        role: isAdmin ? "ADMIN" : null,
      },
    });

    setSessionCookie(res, await signSession({ uid: user.id, role: user.role }));
    logger.info({ email, role: user.role }, "User registered (password)");

    res.status(201).json({
      data: { role: user.role, redirect: user.role === null ? "/onboarding" : dashboardPath(user.role) },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", loginLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as LoginInput;
    const user = await prisma.user.findUnique({ where: { email } });

    // One error for every failure mode — wrong email, wrong password, Google-only account,
    // disabled account. Distinguishing them tells an attacker which emails are registered.
    const invalid = new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

    // Always run scrypt, even when there is no user or no stored hash. Returning early
    // makes a miss ~100ms faster than a hit, which is a usable account-enumeration oracle.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await verifyPassword(password, hash);

    if (!user || !user.passwordHash || !ok) throw invalid;
    if (!user.isActive) throw invalid;

    setSessionCookie(res, await signSession({ uid: user.id, role: user.role }));
    logger.info({ email, role: user.role }, "User signed in (password)");

    res.json({
      data: { role: user.role, redirect: user.role === null ? "/onboarding" : dashboardPath(user.role) },
    });
  } catch (err) {
    next(err);
  }
});

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
    // roleSelectSchema admits only ATHLETE and SPONSOR; COORDINATOR, SUPPLIER and ADMIN
    // are assigned by an admin and can never arrive here. The switch below is written to
    // fail closed rather than fall through to a profile type, so widening the schema
    // without widening this handler is a compile error, not a silently wrong profile.
    const { role } = req.body as RoleSelectInput;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.uid } });
    if (user.role !== null) {
      throw new ApiError(409, "ROLE_ALREADY_SET", "Role has already been chosen");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: user.id }, data: { role } });
      switch (role) {
        case "ATHLETE":
          await tx.athleteProfile.create({ data: { userId: user.id } });
          break;
        case "SPONSOR":
          await tx.sponsorProfile.create({ data: { userId: user.id } });
          break;
        default: {
          const exhaustive: never = role;
          throw new ApiError(
            400,
            "ROLE_NOT_SELF_ASSIGNABLE",
            `Role ${String(exhaustive)} is assigned by khelkhud, not chosen`,
          );
        }
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
        athleteProfile: { select: { id: true, verificationStatus: true, sportId: true } },
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
        athleteProfile: user.athleteProfile,
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
