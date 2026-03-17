import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    // 1. Support Messages Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        sender_type VARCHAR(50) NOT NULL DEFAULT 'user', -- 'user' or 'agent'
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. User Profiles Table for Dashboard customization
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        wallet_address VARCHAR(255) UNIQUE,
        username VARCHAR(255),
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. User Trades Table for Dashboard Revenue / Bought / Sold
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_trades (
        id SERIAL PRIMARY KEY,
        wallet_address VARCHAR(255) NOT NULL,
        soul_name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        trade_type VARCHAR(50) NOT NULL, -- 'buy' or 'sell'
        amount DECIMAL NOT NULL,
        price_eth DECIMAL NOT NULL,
        fee_eth DECIMAL NOT NULL DEFAULT 0,
        tx_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. User Followers Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_followers (
        id SERIAL PRIMARY KEY,
        follower_id VARCHAR(255) NOT NULL,
        following_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);

    // 5. Chat Messages Table
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

    // 6. Extend souls_registry for trending and AI Moderation
    await pool.query(`
      ALTER TABLE souls_registry ADD COLUMN IF NOT EXISTS views INT DEFAULT 0;
      ALTER TABLE souls_registry ADD COLUMN IF NOT EXISTS score FLOAT DEFAULT 0.0;
      ALTER TABLE souls_registry ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT FALSE;
    `);

    return NextResponse.json({ success: true, message: "Database tables initialized successfully." });
  } catch (error: any) {
    console.error("DB Init Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
