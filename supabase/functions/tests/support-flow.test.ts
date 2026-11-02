import { handleSupportFlowRequest } from "../support-flow/index.ts";

const installationId = "i".repeat(43);
const intent = "a".repeat(43);
const supabaseUrl = "https://abcdefghijklmnopqrst.supabase.co";
const userId = "11111111-1111-4111-8111-111111111111";
const complete = "Support flow complete. You can return to Loopnote.";
const invalid = "This support link is invalid or expired. Return to Loopnote and try again.";
const unavailable = "Support is temporarily unavailable. Return to Loopnote and try again.";

function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function cookie(response: Response) {
  return response.headers.get("set-cookie") ?? "";
}

function dependencies(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const authCalls: string[] = [];
  const oauthCalls: unknown[] = [];
  const checkoutCalls: unknown[] = [];
  return {
    calls,
    authCalls,
    oauthCalls,
    checkoutCalls,
    supabaseUrl,
    priceId: "price_4999",
    service: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        if (name === "claim_support_intent") return { data: [{ id: "22222222-2222-4222-8222-222222222222", action: "support", installation_id: installationId }], error: null };
        if (name === "restore_installation") return { data: true, error: null };
        return { data: "checkout-row", error: null };
      },
    },
    createAuthClient: () => ({
      auth: {
        signInWithOAuth: async (options: unknown) => {
          authCalls.push("signInWithOAuth");
          oauthCalls.push(options);
          return { data: { url: "https://github.com/login/oauth/authorize?state=supabase-state" }, error: null };
        },
        exchangeCodeForSession: async () => {
          authCalls.push("exchangeCodeForSession");
          return { data: {}, error: null };
        },
        getUser: async () => {
          authCalls.push("getUser");
          return { data: { user: { id: userId, email: "never-returned@example.test" } }, error: null };
        },
      },
    }),
    stripe: {
      checkout: {
        sessions: {
          create: async (options: unknown) => {
            checkoutCalls.push(options);
            return { id: "cs_server", url: "https://checkout.stripe.example/c/server" };
          },
        },
      },
    },
    log: () => {},
    ...overrides,
  };
}

async function assertTerminal(response: Response, status: number, body: string) {
  assert(response.status === status);
  assert(response.headers.get("content-type") === "text/plain; charset=utf-8");
  const text = await response.text();
  assert(text === body);
  assert(new TextEncoder().encode(text).byteLength <= 96);
  assert(!/intent|code|token|state|email|profile|stripe|github|secret/i.test(text));
}

Deno.test("completion, invalid, and unavailable browser states are exact bounded plain text", async () => {
  await assertTerminal(
    await handleSupportFlowRequest(new Request(`${supabaseUrl}/functions/v1/support-flow/complete?code=provider-code`), dependencies()),
    200,
    complete,
  );
  await assertTerminal(
    await handleSupportFlowRequest(new Request(`${supabaseUrl}/functions/v1/support-flow/callback?code=provider-code`), dependencies()),
    400,
    invalid,
  );
  await assertTerminal(
    await handleSupportFlowRequest(new Request(`${supabaseUrl}/functions/v1/support-flow?intent=${intent}`), dependencies({
      createAuthClient: () => ({ auth: { signInWithOAuth: async () => ({ data: {}, error: { message: "provider failed" } }) } }),
    })),
    503,
    unavailable,
  );
});

Deno.test("flow start derives the canonical callback from Supabase URL and uses a script-inaccessible state cookie", async () => {
  const deps = dependencies();
  const response = await handleSupportFlowRequest(new Request(`${supabaseUrl}/functions/v1/support-flow?intent=${intent}`), deps);
  assert(response.status === 302 && response.headers.get("location")?.startsWith("https://github.com/"));
  assert(cookie(response).includes(`support-intent=${intent}`));
  assert(cookie(response).includes("HttpOnly") && cookie(response).includes("Secure") && cookie(response).includes("SameSite=Lax"));
  assert(cookie(response).includes("Path=/functions/v1/support-flow") && cookie(response).includes("Max-Age=600"));
  assert(JSON.stringify(deps.oauthCalls) === JSON.stringify([{
    provider: "github",
    options: { redirectTo: `${supabaseUrl}/functions/v1/support-flow/callback` },
  }]));
});

Deno.test("callback validates the hosted user then makes one server-owned support Checkout", async () => {
  const deps = dependencies();
  const response = await handleSupportFlowRequest(new Request(`${supabaseUrl}/functions/v1/support-flow/callback?code=provider-code`, {
    headers: { cookie: `support-intent=${intent}` },
  }), deps);
  assert(response.status === 302 && response.headers.get("location") === "https://checkout.stripe.example/c/server");
  assert(deps.authCalls.join(",") === "exchangeCodeForSession,getUser");
  assert(deps.calls[0]?.name === "claim_support_intent" && deps.calls[0]?.args.p_user_id === userId);
  assert(typeof deps.calls[0]?.args.p_intent_hash === "string" && /^\\x[0-9a-f]{64}$/u.test(deps.calls[0].args.p_intent_hash));
  assert(deps.calls[1]?.name === "record_checkout_session");
  assert(JSON.stringify(deps.calls[1]?.args) === JSON.stringify({
    p_intent_id: "22222222-2222-4222-8222-222222222222",
    p_stripe_session_id: "cs_server",
    p_user_id: userId,
    p_installation_id: installationId,
    p_currency: "usd",
    p_price_id: "price_4999",
    p_amount_total: 4999,
    p_quantity: 1,
  }));
  assert(JSON.stringify(deps.checkoutCalls[0]) === JSON.stringify({
    mode: "payment",
    allow_promotion_codes: true,
    line_items: [{ price: "price_4999", quantity: 1 }],
    customer_creation: "always",
    client_reference_id: userId,
    metadata: { user_id: userId, installation_id: installationId, intent_id: "22222222-2222-4222-8222-222222222222" },
    success_url: `${supabaseUrl}/functions/v1/support-flow/complete`,
    cancel_url: `${supabaseUrl}/functions/v1/support-flow/complete`,
  }));
});

Deno.test("callback refuses missing, mismatched, reused, expired, and unauthenticated proof without Checkout", async () => {
  const cases = [
    { request: new Request(`${supabaseUrl}/functions/v1/support-flow/callback`), override: {} },
    { request: new Request(`${supabaseUrl}/functions/v1/support-flow/callback?code=code`, { headers: { cookie: "support-intent=bad" } }), override: {} },
    { request: new Request(`${supabaseUrl}/functions/v1/support-flow/callback?code=code`, { headers: { cookie: `support-intent=${intent}` } }), override: { service: { rpc: async () => ({ data: null, error: { message: "invalid support intent" } }) } } },
    { request: new Request(`${supabaseUrl}/functions/v1/support-flow/callback?code=code`, { headers: { cookie: `support-intent=${intent}` } }), override: { createAuthClient: () => ({ auth: { exchangeCodeForSession: async () => ({ data: {}, error: null }), getUser: async () => ({ data: { user: null }, error: null }) } }) } },
  ];
  for (const item of cases) {
    const deps = dependencies(item.override);
    await assertTerminal(await handleSupportFlowRequest(item.request, deps), 400, invalid);
    assert(deps.checkoutCalls.length === 0);
  }
});

Deno.test("restore keeps paid and unpaid completion indistinguishable and rejects foreign origins", async () => {
  const restoreDeps = dependencies({
    service: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        restoreDeps.calls.push({ name, args });
        if (name === "claim_support_intent") return { data: [{ id: "22222222-2222-4222-8222-222222222222", action: "restore", installation_id: installationId }], error: null };
        return { data: true, error: null };
      },
    },
  });
  const restore = await handleSupportFlowRequest(new Request(`${supabaseUrl}/functions/v1/support-flow/callback?code=provider-code`, { headers: { cookie: `support-intent=${intent}` } }), restoreDeps);
  assert(restore.status === 302 && restore.headers.get("location") === `${supabaseUrl}/functions/v1/support-flow/complete`);
  assert(restoreDeps.calls.at(-1)?.name === "restore_installation" && restoreDeps.checkoutCalls.length === 0);
  const foreignDeps = dependencies();
  await assertTerminal(await handleSupportFlowRequest(new Request(`${supabaseUrl}/functions/v1/support-flow?intent=${intent}`, { headers: { origin: "https://attacker.example" } }), foreignDeps), 400, invalid);
  assert(foreignDeps.calls.length === 0 && foreignDeps.checkoutCalls.length === 0);
});
