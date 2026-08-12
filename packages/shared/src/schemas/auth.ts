import { z } from "zod";

export const roleSelectSchema = z.object({
  role: z.enum(["PLAYER", "SPONSOR"]),
});

export type RoleSelectInput = z.infer<typeof roleSelectSchema>;
