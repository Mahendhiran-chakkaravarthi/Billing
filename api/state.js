import { neon } from "@neondatabase/serverless";

const defaultMembers = { admin: { name: "Admin", password: "123456" } };

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
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

export default async function handler(request) {
  if (!process.env.DATABASE_URL) {
    return json({ ok: false, error: "DATABASE_URL is not configured" }, 500);
  }

  const sql = neon(process.env.DATABASE_URL);
  await table(sql);

  if (request.method === "GET") {
    const rows = await sql`SELECT state_json, members_json, updated_at FROM app_state WHERE id = 1`;
    const row = rows[0];
    return json({
      ok: true,
      hasData: Boolean(row),
      state: row?.state_json ?? null,
      members: row?.members_json ?? defaultMembers,
      updatedAt: row?.updated_at ?? null
    });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body?.state || !body?.members) {
      return json({ ok: false, error: "Invalid payload" }, 422);
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

    return json({ ok: true });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}

