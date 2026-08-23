import { cookies } from "next/headers";

export const ACCESS_COOKIE = "go_fep_access";
export const REFRESH_COOKIE = "go_fep_refresh";

export async function operatorToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function setOperatorSession(accessToken: string, refreshToken: string | undefined, expiresIn = 3600) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(ACCESS_COOKIE, accessToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: expiresIn });
  if (refreshToken) jar.set(REFRESH_COOKIE, refreshToken, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearOperatorSession() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}
