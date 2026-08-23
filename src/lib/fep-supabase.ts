const FEP_SUPABASE_URL = process.env.NEXT_PUBLIC_FEP_SUPABASE_URL ?? "https://lbsskynkwlfdexwncoud.supabase.co";
const FEP_SUPABASE_KEY = process.env.NEXT_PUBLIC_FEP_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_w34Dz8WJ36Se8u01vcNgfw_o08kfoBe";
const FEP_SUPABASE_SECRET_KEY = process.env.FEP_SUPABASE_SECRET_KEY;

export class SupabaseApiError extends Error {
  constructor(public status: number, public payload: unknown) {
    const record = typeof payload === "object" && payload ? payload as Record<string, unknown> : {};
    super(String(record.message ?? record.msg ?? record.error_description ?? record.error ?? `FEP database request failed (${status})`));
  }

  get code() {
    const record = typeof this.payload === "object" && this.payload ? this.payload as Record<string, unknown> : {};
    return String(record.error_code ?? record.code ?? "");
  }
}

export async function fepRequest<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${FEP_SUPABASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: FEP_SUPABASE_KEY,
      "content-type": "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new SupabaseApiError(response.status, payload);
  return payload as T;
}

export async function fepServiceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!FEP_SUPABASE_SECRET_KEY) throw new Error("FEP_SUPABASE_SECRET_KEY is not configured");
  const serviceHeaders: Record<string, string> = { apikey: FEP_SUPABASE_SECRET_KEY };
  if (!FEP_SUPABASE_SECRET_KEY.startsWith("sb_secret_")) {
    serviceHeaders.authorization = `Bearer ${FEP_SUPABASE_SECRET_KEY}`;
  }
  const response = await fetch(`${FEP_SUPABASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...serviceHeaders,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new SupabaseApiError(response.status, payload);
  return payload as T;
}

export const fepAuth = {
  signIn(email: string, password: string) {
    return fepRequest<AuthSession>("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  signUp(email: string, password: string, redirectTo?: string) {
    const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    return fepRequest<AuthSession>(`/auth/v1/signup${query}`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
  resendConfirmation(email: string, redirectTo?: string) {
    const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    return fepRequest(`/auth/v1/resend${query}`, { method: "POST", body: JSON.stringify({ type: "signup", email }) });
  },
  recoverPassword(email: string, redirectTo?: string) {
    const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : "";
    return fepRequest(`/auth/v1/recover${query}`, { method: "POST", body: JSON.stringify({ email }) });
  },
  user(accessToken: string) {
    return fepRequest<{ id: string; email?: string }>("/auth/v1/user", { method: "GET" }, accessToken);
  },
};

export interface AuthSession {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id: string; email?: string };
}

export interface Workspace {
  tenant_id: string;
  name: string;
  slug: string;
  role: string;
}

export interface DashboardSnapshot {
  tenant_id: string;
  orders_total: number;
  orders_open: number;
  exceptions_open: number;
  work_open: number;
  documents_missing: number;
  pallets_open: number;
  recent_orders: Array<{
    id: string;
    tracking_number: string;
    source: string;
    source_order_id: string | null;
    state: string;
    service_level: string;
    destination_city: string | null;
    created_at: string;
  }>;
  planning_packages: Array<{
    package_id: string;
    package_reference: string;
    order_id: string;
    tracking_number: string;
    source: string;
    service_level: string;
    origin_country: string;
    length_cm: number;
    width_cm: number;
    height_cm: number;
    weight_kg: number;
    piece_count: number;
    stackable: boolean;
    fragile: boolean;
  }>;
}
