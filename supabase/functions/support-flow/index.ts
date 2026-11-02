import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

import { InstallationIdSchema, SupportActionSchema } from "../_shared/validation.ts";
import { postgresBytea } from "../_shared/postgres.ts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type AuthClient = {
  auth: {
    signInWithOAuth(input: unknown): Promise<{ data: { url?: string | null }; error: unknown }>;
    exchangeCodeForSession(code: string): Promise<{ data: unknown; error: unknown }>;
    getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  };
};
type StripeClient = { checkout: { sessions: { create(input: unknown): Promise<{ id?: string; url?: string | null }> } } };
type SupportFlowDependencies = Readonly<{
  service: { rpc: Rpc };
  createAuthClient: (request: Request, setCookie: (value: string) => void) => AuthClient;
  stripe: StripeClient;
  supabaseUrl: string;
  priceId: string;
  log?: (value: string) => void;
}>;
type ClaimedIntent = Readonly<{ id: string; action: "support" | "restore"; installation_id: string }>;
type BrowserState = "complete" | "invalid" | "unavailable";

const browserMessages: Record<BrowserState, string> = {
  complete: "Support flow complete. You can return to Loopnote.",
  invalid: "This support link is invalid or expired. Return to Loopnote and try again.",
  unavailable: "Support is temporarily unavailable. Return to Loopnote and try again.",
};

function browserResponse(state: BrowserState) {
  const status = state === "complete" ? 200 : state === "invalid" ? 400 : 503;
  return new Response(browserMessages[state], { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function parseCookies(request: Request) {
  return (request.headers.get("cookie") ?? "").split(/;\s*/u).flatMap((part) => {
    const index = part.indexOf("=");
    return index < 1 ? [] : [[part.slice(0, index), part.slice(index + 1)] as const];
  });
}

function defaultDependencies(): SupportFlowDependencies {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { httpClient: Stripe.createFetchHttpClient() });
  return {
    service: createClient(supabaseUrl, key) as unknown as { rpc: Rpc },
    createAuthClient: (request, setCookie) => createServerClient(supabaseUrl, key, {
      cookies: {
        getAll: () => parseCookies(request).map(([name, value]) => ({ name, value })),
        setAll: (values) => {
          for (const value of values) setCookie(`${value.name}=${value.value}; Path=${value.options.path ?? "/"}; HttpOnly; Secure; SameSite=${value.options.sameSite ?? "Lax"}`);
        },
      },
    }) as unknown as AuthClient,
    stripe: stripe as unknown as StripeClient,
    supabaseUrl,
    priceId: Deno.env.get("STRIPE_PRICE_ID") ?? "",
    log: (value) => console.error(value),
  };
}

function allowedOrigin(request: Request, supabaseUrl: string) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(supabaseUrl).origin;
}

function stateCookie(intent: string) {
  return `support-intent=${intent}; Path=/functions/v1/support-flow; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

function clearStateCookie() {
  return "support-intent=; Path=/functions/v1/support-flow; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function opaqueIntent(value: string | null) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : undefined;
}

async function intentHash(intent: string) {
  const base64 = intent.replaceAll("-", "+").replaceAll("_", "/") + "=";
  const binary = atob(base64);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(binary, (character) => character.charCodeAt(0))));
  return postgresBytea(digest);
}

function claimedIntent(value: unknown): ClaimedIntent | undefined {
  if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== "object") return undefined;
  const candidate = value[0] as Record<string, unknown>;
  if (typeof candidate.id !== "string" || !SupportActionSchema.safeParse(candidate.action).success || !InstallationIdSchema.safeParse(candidate.installation_id).success) return undefined;
  return candidate as ClaimedIntent;
}

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ location });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export async function handleSupportFlowRequest(request: Request, dependencies = defaultDependencies()): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" || !allowedOrigin(request, dependencies.supabaseUrl)) return browserResponse("invalid");
  const callbackPath = "/functions/v1/support-flow/callback";
  const completionPath = "/functions/v1/support-flow/complete";

  if (url.pathname.endsWith("/complete")) return browserResponse("complete");
  if (url.pathname.endsWith("/callback")) {
    const code = url.searchParams.get("code");
    const intent = opaqueIntent(parseCookies(request).find(([name]) => name === "support-intent")?.[1] ?? null);
    if (!code || !intent) return browserResponse("invalid");
    const cookies: string[] = [clearStateCookie()];
    const auth = dependencies.createAuthClient(request, (cookie) => cookies.push(cookie));
    const exchanged = await auth.auth.exchangeCodeForSession(code);
    if (exchanged.error) return browserResponse("invalid");
    const user = await auth.auth.getUser();
    if (user.error || !user.data.user?.id) return browserResponse("invalid");
    const claim = await dependencies.service.rpc("claim_support_intent", {
      p_intent_hash: await intentHash(intent),
      p_user_id: user.data.user.id,
    });
    const claimed = !claim.error ? claimedIntent(claim.data) : undefined;
    if (!claimed) return browserResponse("invalid");

    if (claimed.action === "restore") {
      await dependencies.service.rpc("restore_installation", { p_user_id: user.data.user.id, p_installation_id: claimed.installation_id });
      return redirect(new URL(completionPath, dependencies.supabaseUrl).toString(), cookies);
    }

    try {
      const checkout = await dependencies.stripe.checkout.sessions.create({
        mode: "payment",
        allow_promotion_codes: true,
        line_items: [{ price: dependencies.priceId, quantity: 1 }],
        customer_creation: "always",
        client_reference_id: user.data.user.id,
        metadata: { user_id: user.data.user.id, installation_id: claimed.installation_id, intent_id: claimed.id },
        success_url: new URL(completionPath, dependencies.supabaseUrl).toString(),
        cancel_url: new URL(completionPath, dependencies.supabaseUrl).toString(),
      });
      if (!checkout.id || !checkout.url) throw new Error("checkout unavailable");
      const recorded = await dependencies.service.rpc("record_checkout_session", {
        p_intent_id: claimed.id,
        p_stripe_session_id: checkout.id,
        p_user_id: user.data.user.id,
        p_installation_id: claimed.installation_id,
        p_currency: "usd",
        p_price_id: dependencies.priceId,
        p_amount_total: 4999,
        p_quantity: 1,
      });
      if (recorded.error) throw new Error("checkout unavailable");
      return redirect(checkout.url, cookies);
    } catch {
      dependencies.log?.("support_flow_unavailable");
      return browserResponse("unavailable");
    }
  }

  if (url.pathname.endsWith("/support-flow")) {
    const intent = opaqueIntent(url.searchParams.get("intent"));
    if (!intent || url.searchParams.size !== 1) return browserResponse("invalid");
    const cookies: string[] = [];
    const auth = dependencies.createAuthClient(request, (cookie) => cookies.push(cookie));
    const login = await auth.auth.signInWithOAuth({ provider: "github", options: { redirectTo: new URL(callbackPath, dependencies.supabaseUrl).toString() } });
    if (login.error || !login.data.url) return browserResponse("unavailable");
    cookies.unshift(stateCookie(intent));
    return redirect(login.data.url, cookies);
  }

  return browserResponse("invalid");
}

if (import.meta.main) Deno.serve((request) => handleSupportFlowRequest(request));
