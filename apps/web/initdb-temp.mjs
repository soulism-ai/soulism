import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DB,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    console.log("Starting DB init...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        sender_address VARCHAR(255) NOT NULL,
        receiver_address VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        is_flagged BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Created chat_messages table.");

    await pool.query(`
      ALTER TABLE souls_registry ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;
      ALTER TABLE souls_registry ADD COLUMN IF NOT EXISTS score FLOAT DEFAULT 0.0;
      ALTER TABLE souls_registry ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE;
    `);
    console.log("Updated souls_registry table.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
main();
