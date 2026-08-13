import { z } from "zod";

export const roleSelectSchema = z.object({
  role: z.enum(["ATHLETE", "SPONSOR"]),
});

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
