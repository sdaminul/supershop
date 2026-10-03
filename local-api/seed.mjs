// Seed local PostgreSQL with admin user + demo branch.
// Run: node local-api/seed.mjs [email] [password]
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@127.0.0.1:5432/supershop";

const email = process.argv[2] || "admin@nikobazar.local";
const password = process.argv[3] || "Admin123!";
const branchName = "Main Branch";
const branchCode = "MAIN";

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Branch
    let branchId;
    const b = await client.query(`SELECT id FROM branches WHERE code = $1`, [branchCode]);
    if (b.rows.length) {
      branchId = b.rows[0].id;
      console.log(`branch exists: ${branchCode} (${branchId})`);
    } else {
      const ins = await client.query(
        `INSERT INTO branches (name, code, address, phone, status) VALUES ($1,$2,$3,$4,'active') RETURNING id`,
        [branchName, branchCode, "Dhaka, Bangladesh", "01XXXXXXXXX"]
      );
      branchId = ins.rows[0].id;
      console.log(`branch created: ${branchCode} (${branchId})`);
    }

    // User
    let userId;
    const u = await client.query(`SELECT id FROM app_users WHERE email = $1`, [email]);
    if (u.rows.length) {
      userId = u.rows[0].id;
      const hash = await bcrypt.hash(password, 10);
      await client.query(`UPDATE app_users SET password_hash=$1 WHERE id=$2`, [hash, userId]);
      console.log(`user exists, password reset: ${email}`);
    } else {
      const hash = await bcrypt.hash(password, 10);
      const ins = await client.query(
        `INSERT INTO app_users (email, password_hash) VALUES ($1,$2) RETURNING id`,
        [email, hash]
      );
      userId = ins.rows[0].id;
      console.log(`user created: ${email}`);
    }

    await client.query(
      `INSERT INTO profiles (id, name, username, email) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, username=EXCLUDED.username, email=EXCLUDED.email`,
      [userId, "Owner", "owner", email]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1,'admin',NULL)
       ON CONFLICT DO NOTHING`,
      [userId]
    );

    await client.query(
      `UPDATE settings SET company_name='NikoBazar', currency='৳', updated_at=now() WHERE id=1`
    );

    // Demo category + supplier + product (idempotent-ish)
    const c = await client.query(`SELECT id FROM categories WHERE name='General' AND branch_id=$1`, [branchId]);
    let catId = c.rows[0]?.id;
    if (!catId) {
      const ins = await client.query(
        `INSERT INTO categories (name, branch_id) VALUES ('General',$1) RETURNING id`,
        [branchId]
      );
      catId = ins.rows[0].id;
    }
    console.log("seed ok");
    console.log(`  login: ${email} / ${password}`);
    console.log(`  branch: ${branchName} (${branchCode})`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
