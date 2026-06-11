import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bootstrap-secret",
};

type PortalRole = "super_admin" | "admin" | "customer";

interface UserPayload {
  action: "bootstrap" | "create" | "update" | "deactivate" | "reset-password";
  userId?: string;
  email?: string;
  displayName?: string;
  role?: PortalRole;
  adminPermissions?: Record<string, boolean>;
  clientName?: string;
  address?: string;
  vatNumber?: string;
  registration?: string;
  clientId?: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `${btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, "A")}a9!`;
}

function splitAddress(address?: string) {
  return {
    address_line_1: address?.trim() || null,
    address_line_2: null,
    city: null,
    province: null,
    postal_code: null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !publishableKey || !secretKey) {
    return json({ error: "Function configuration is incomplete." }, 500);
  }

  const payload = await request.json() as UserPayload;
  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (payload.action === "bootstrap") {
    const bootstrapSecret = Deno.env.get("PORTAL_BOOTSTRAP_SECRET");
    if (!bootstrapSecret || request.headers.get("x-bootstrap-secret") !== bootstrapSecret) {
      return json({ error: "Unauthorized." }, 401);
    }

    const { count, error: countError } = await admin
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("is_active", true);
    if (countError) return json({ error: countError.message }, 500);
    if ((count ?? 0) > 0) return json({ error: "A super admin already exists." }, 409);

    payload.email = "benjamin.godigi@gmail.com";
    payload.displayName = "Benjamin";
    payload.role = "super_admin";
  } else {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ error: "Authentication required." }, 401);

    const caller = createClient(url, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: claims, error: claimsError } = await caller.auth.getClaims(
      authorization.replace(/^Bearer\s+/i, ""),
    );
    if (claimsError || !claims?.claims?.sub) return json({ error: "Invalid session." }, 401);

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role, admin_permissions, is_active")
      .eq("user_id", claims.claims.sub)
      .single();
    if (profileError || !profile?.is_active) return json({ error: "Portal access denied." }, 403);

    const canManageUsers = profile.role === "super_admin"
      || (profile.role === "admin" && profile.admin_permissions?.manageUsers === true);
    if (!canManageUsers) return json({ error: "You do not have permission to manage users." }, 403);
    if (payload.role === "super_admin" && profile.role !== "super_admin") {
      return json({ error: "Only a super admin can grant super-admin access." }, 403);
    }
    if (payload.userId === claims.claims.sub && payload.action === "deactivate") {
      return json({ error: "You cannot deactivate your own account." }, 400);
    }
  }

  if (payload.action === "bootstrap" || payload.action === "create") {
    if (!payload.email || !payload.displayName || !payload.role) {
      return json({ error: "Email, display name, and role are required." }, 400);
    }
    if (payload.role === "customer" && !payload.clientName) {
      return json({ error: "A client name is required for customer accounts." }, 400);
    }

    const temporaryPassword = randomPassword();
    const normalizedEmail = payload.email.trim().toLowerCase();
    let userId = "";
    let createdNewUser = false;
    let reactivating = false;

    if (payload.action === "bootstrap") {
      const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) return json({ error: usersError.message }, 400);
      const existingUser = users.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
      if (existingUser) {
        userId = existingUser.id;
        const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
          password: temporaryPassword,
          email_confirm: true,
          ban_duration: "none",
          user_metadata: { display_name: payload.displayName.trim() },
        });
        if (updateError) return json({ error: updateError.message }, 400);
      }
    }

    if (!userId) {
      const { data: existingUsers, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) return json({ error: usersError.message, code: "AUTH_LOOKUP_FAILED" }, 400);
      const existingAuthUser = existingUsers.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
      if (existingAuthUser) {
        // Check whether the existing auth user's profile was deactivated — if so, reactivate instead of rejecting.
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("is_active")
          .eq("user_id", existingAuthUser.id)
          .single();
        if (!existingProfile || existingProfile.is_active === false) {
          userId = existingAuthUser.id;
          reactivating = true;
          const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
            password: temporaryPassword,
            email_confirm: true,
            ban_duration: "none",
            user_metadata: { display_name: payload.displayName.trim() },
          });
          if (updateError) return json({ error: updateError.message }, 400);
        } else {
          return json({ error: `A portal account already exists for ${normalizedEmail}.`, code: "EMAIL_EXISTS" }, 409);
        }
      }
    }

    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { display_name: payload.displayName.trim() },
      });
      if (createError || !created.user) {
        return json({
          error: /already.*registered|already.*exists/i.test(createError?.message ?? "")
            ? `A portal account already exists for ${normalizedEmail}.`
            : createError?.message ?? "Could not create user.",
          code: "AUTH_CREATE_FAILED",
        }, 400);
      }
      userId = created.user.id;
      createdNewUser = true;
    }

    let linkedClientId: number | null = null;
    if (payload.role === "customer") {
      const { data: clients, error: findClientError } = await admin.from("clients").select("id, name");
      if (findClientError) {
        if (createdNewUser) await admin.auth.admin.deleteUser(userId);
        return json({ error: findClientError.message, code: "CLIENT_LOOKUP_FAILED" }, 400);
      }
      const existingClient = payload.clientId
        ? clients?.find((client) => client.id === payload.clientId)
        : clients?.find((client) => client.name.trim().toLowerCase() === payload.clientName!.trim().toLowerCase());
      if (existingClient) {
        linkedClientId = existingClient.id;
        // A newly added user must be able to sign in, so ensure the linked client is active.
        // loadPortalData filters clients by is_active, and an inactive client blocks sign-in.
        const { error: reactivateError } = await admin
          .from("clients")
          .update({ is_active: true })
          .eq("id", existingClient.id);
        if (reactivateError) {
          if (createdNewUser) await admin.auth.admin.deleteUser(userId);
          return json({ error: reactivateError.message, code: "CLIENT_REACTIVATE_FAILED" }, 400);
        }
      } else {
        const { data: createdClient, error: clientCreateError } = await admin
          .from("clients")
          .insert({
            user_id: null,
            name: payload.clientName!.trim(),
            contact_name: payload.displayName.trim(),
            contact_email: normalizedEmail,
            vat_number: payload.vatNumber?.trim() || null,
            registration_number: payload.registration?.trim() || null,
            ...splitAddress(payload.address),
            is_active: true,
          })
          .select("id")
          .single();
        if (clientCreateError || !createdClient) {
          if (createdNewUser) await admin.auth.admin.deleteUser(userId);
          return json({ error: clientCreateError?.message ?? "Could not create the client.", code: "CLIENT_CREATE_FAILED" }, 400);
        }
        linkedClientId = createdClient.id;
      }
    }

    const profileValues = {
      user_id: userId,
      email: normalizedEmail,
      display_name: payload.displayName.trim(),
      role: payload.role,
      admin_permissions: payload.adminPermissions ?? {},
      is_active: true,
      must_change_password: true,
      client_id: linkedClientId,
    };
    const profileQuery = (payload.action === "bootstrap" || reactivating)
      ? admin.from("profiles").upsert(profileValues, { onConflict: "user_id" })
      : admin.from("profiles").insert(profileValues);
    const { error: profileError } = await profileQuery;
    if (profileError) {
      if (createdNewUser) await admin.auth.admin.deleteUser(userId);
      return json({ error: profileError.message }, 400);
    }

    return json({
      user: { id: userId, email: payload.email, displayName: payload.displayName, role: payload.role },
      temporaryPassword,
    }, 201);
  }

  if (!payload.userId) return json({ error: "User ID is required." }, 400);

  if (payload.action === "reset-password") {
    const temporaryPassword = randomPassword();
    const { error: authError } = await admin.auth.admin.updateUserById(payload.userId, {
      password: temporaryPassword,
      ban_duration: "none",
    });
    if (authError) return json({ error: authError.message }, 400);
    const { error: profileError } = await admin
      .from("profiles")
      .update({ must_change_password: true, is_active: true })
      .eq("user_id", payload.userId);
    if (profileError) return json({ error: profileError.message }, 400);
    return json({ temporaryPassword });
  }

  if (payload.action === "deactivate") {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ is_active: false })
      .eq("user_id", payload.userId);
    if (profileError) return json({ error: profileError.message }, 400);
    await admin.auth.admin.updateUserById(payload.userId, { ban_duration: "876000h" });
    return json({ ok: true });
  }

  if (!payload.email || !payload.displayName || !payload.role) {
    return json({ error: "Email, display name, and role are required." }, 400);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(payload.userId, {
    email: payload.email.trim().toLowerCase(),
    email_confirm: true,
    user_metadata: { display_name: payload.displayName.trim() },
  });
  if (authError) return json({ error: authError.message }, 400);

  let updateClientId: number | null = null;
  if (payload.role === "customer") {
    const { data: clients, error: clientLookupError } = await admin.from("clients").select("id, name");
    if (clientLookupError) return json({ error: clientLookupError.message, code: "CLIENT_LOOKUP_FAILED" }, 400);
    const matchingClient = payload.clientId
      ? clients?.find((client) => client.id === payload.clientId)
      : clients?.find((client) => client.name.trim().toLowerCase() === payload.clientName?.trim().toLowerCase());
    if (!matchingClient) return json({ error: `Client "${payload.clientName}" could not be found.`, code: "CLIENT_NOT_FOUND" }, 404);
    updateClientId = matchingClient.id;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      email: payload.email.trim().toLowerCase(),
      display_name: payload.displayName.trim(),
      role: payload.role,
      admin_permissions: payload.adminPermissions ?? {},
      client_id: updateClientId,
    })
    .eq("user_id", payload.userId);
  if (profileError) return json({ error: profileError.message }, 400);

  if (payload.role === "customer" && updateClientId) {
    const clientValues = {
      name: payload.clientName?.trim() || "Unassigned client",
      contact_name: payload.displayName.trim(),
      contact_email: payload.email.trim().toLowerCase(),
      vat_number: payload.vatNumber?.trim() || null,
      registration_number: payload.registration?.trim() || null,
      is_active: true,
      ...splitAddress(payload.address),
    };
    const clientResult = await admin.from("clients").update(clientValues).eq("id", updateClientId);
    if (clientResult.error) return json({ error: clientResult.error.message }, 400);
  }

  return json({ ok: true });
});
