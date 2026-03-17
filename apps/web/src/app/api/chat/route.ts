import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const searchParams = req.nextUrl.searchParams;
    const web3Account = searchParams.get("web3Account");
    
    // We ideally want a single user_id to track them by
    const userId = session?.user?.email || web3Account;
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT * FROM support_messages WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );

    return NextResponse.json({ messages: result.rows });
  } catch (error: any) {
    console.error("Chat GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const { message, web3Account } = body;
    
    const userId = session?.user?.email || web3Account;

    if (!userId || !message) {
      return NextResponse.json({ error: "Unauthorized or Missing message" }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO support_messages (user_id, message, sender_type)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, message, "user"]
    );

    return NextResponse.json({ success: true, message: result.rows[0] });
  } catch (error: any) {
    console.error("Chat POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
