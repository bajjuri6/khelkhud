import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * Server-side fetch against the Express API, forwarding the session cookie.
 *
 * Returns null on ANY failure — non-2xx, unparseable body, or the connection itself
 * failing. Callers already handle null by degrading (an empty grid, a signed-out header),
 * and letting a transport error escape here is actively harmful in two places:
 *
 *   1. `next build` prerenders /404 and /500 with no API running. The root layout calls
 *      getMe(), the throw propagates, and Next masks it as the famously unhelpful
 *      "<Html> should not be imported outside of pages/_document". The production image
 *      cannot be built at all until this is caught.
 *   2. At runtime, a brief API blip would turn every page into a 500 rather than a page
 *      that renders with the signed-out header.
 */
export async function apiServer<T>(path: string, init?: RequestInit): Promise<T | null> {
  const cookieStore = await cookies();
  try {
    const res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...init,
      headers: { cookie: cookieStore.toString(), ...init?.headers },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    // Expected during `next build`; worth a line in the server log at runtime.
    console.warn(`[api-server] ${path} unreachable:`, (err as Error).message);
    return null;
  }
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
