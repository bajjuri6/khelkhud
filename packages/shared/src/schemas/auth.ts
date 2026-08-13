import { z } from "zod";

// Exactly two roles may be self-assigned, and the list is deliberately narrower than the
// Role enum. COORDINATOR is a delegation of trust an admin makes — CoordinatorProfile
// carries the appointing admin's id, which a self-signup has nothing to put in. SUPPLIER
// may write to the catalogue and so must be allowed by an admin first. ADMIN comes from
// ADMIN_EMAILS at sign-in, never from a request body. Adding any of them here would turn
// POST /api/auth/role into a self-serve privilege escalation.
export const SELF_SELECTABLE_ROLES = ["ATHLETE", "SPONSOR"] as const;

export const roleSelectSchema = z.object({
  role: z.enum(SELF_SELECTABLE_ROLES),
});

export type SelfSelectableRole = (typeof SELF_SELECTABLE_ROLES)[number];
export type RoleSelectInput = z.infer<typeof roleSelectSchema>;

// Native email + password, alongside Google. Many athletes and small sponsors either have
// no Google account or are wary of "continue with" flows, and requiring one is a silent
// filter on exactly the people this platform exists to reach.

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email address");

// 10 chars minimum, no composition rules. Length beats character-class requests —
// those mostly produce `Password1!` — and a minimum this low would be wrong without the
// login throttling in middleware/rate-limit.ts, which is what actually stops guessing.
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Password is too long");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80, "Name is too long"),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately NOT passwordSchema: an existing account whose password predates a rule
  // change must still be able to sign in, and echoing "use at least 10 characters" at
  // someone typing a correct password is nonsense.
  password: z.string().min(1, "Enter your password"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
