import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { pool } from "./db";

// Google and GitHub sign-in turn on when their keys are set; email and
// password always works, so the app runs with no OAuth setup at all.
const socialProviders = {
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
        },
      }
    : {}),
};

export const enabledProviders = Object.keys(socialProviders) as Array<"google" | "github">;

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  socialProviders,
  // Must stay last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type AuthUser = { id: string; name: string; email: string; image?: string | null };

/** The signed-in user for a request, or null. */
export async function getUser(headers: Headers): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}
