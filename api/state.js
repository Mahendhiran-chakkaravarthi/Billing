import { neon } from "@neondatabase/serverless";

const defaultMembers = { admin: { name: "Admin", password: "123456" } };
const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_DATABASE_URL ||
  process.env.DATABASE_URL_POSTGRES_URL ||
  process.env.DATABASE_URL_POSTGRES_PRISMA_URL;

function json(response, payload, status = 200) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  return response.status(status).json(payload);
}

function requestBody(request) {
  if (!request.body) return null;
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body;
}

async function table(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS app_state (
      id integer PRIMARY KEY,
      state_json jsonb NOT NULL,
      members_json jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

export default async function handler(request, response) {
  if (!databaseUrl) {
    return json(response, { ok: false, error: "DATABASE_URL is not configured" }, 500);
  }

  const sql = neon(databaseUrl);
  await table(sql);

  if (request.method === "GET") {
    const rows = await sql`SELECT state_json, members_json, updated_at FROM app_state WHERE id = 1`;
    const row = rows[0];
    return json(response, {
      ok: true,
      hasData: Boolean(row),
      state: row?.state_json ?? null,
      members: row?.members_json ?? defaultMembers,
      updatedAt: row?.updated_at ?? null
    });
  }

  if (request.method === "POST") {
    const body = requestBody(request);
    if (!body?.state || !body?.members) {
      return json(response, { ok: false, error: "Invalid payload" }, 422);
    }

    await sql`
      INSERT INTO app_state (id, state_json, members_json, updated_at)
      VALUES (1, ${JSON.stringify(body.state)}::jsonb, ${JSON.stringify(body.members)}::jsonb, now())
      ON CONFLICT (id)
      DO UPDATE SET
        state_json = EXCLUDED.state_json,
        members_json = EXCLUDED.members_json,
        updated_at = now()
    `;

    return json(response, { ok: true });
  }

  return json(response, { ok: false, error: "Method not allowed" }, 405);
}
