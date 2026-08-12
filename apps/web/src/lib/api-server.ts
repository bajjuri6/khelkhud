import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/** Server-side fetch against the Express API, forwarding the session cookie. */
export async function apiServer<T>(path: string, init?: RequestInit): Promise<T | null> {
  const cookieStore = await cookies();
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: { cookie: cookieStore.toString(), ...init?.headers },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export type Me = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "PLAYER" | "SPONSOR" | "ADMIN" | null;
  playerProfile: { id: string; verificationStatus: string; sportId: string | null } | null;
  sponsorProfile: { id: string; verificationStatus: string; displayName: string | null } | null;
};

export async function getMe(): Promise<Me | null> {
  const res = await apiServer<{ data: Me }>("/api/auth/me");
  return res?.data ?? null;
}
