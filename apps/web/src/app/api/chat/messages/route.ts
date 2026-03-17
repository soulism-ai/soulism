import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";
import { moderateContent } from "@/lib/openai";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const url = new URL(req.url);
    const otherUser = url.searchParams.get("otherUser");

    const currentUser = session?.user?.name || url.searchParams.get("walletAddress");
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!otherUser) return NextResponse.json({ error: "Missing otherUser parameter" }, { status: 400 });

    const result = await pool.query(`
      SELECT * FROM chat_messages 
      WHERE (sender_address = $1 AND receiver_address = $2) 
         OR (sender_address = $2 AND receiver_address = $1)
      ORDER BY created_at ASC
      LIMIT 100
    `, [currentUser, otherUser]);

    return NextResponse.json({ messages: result.rows });
  } catch (error: any) {
    console.error("Chat GET Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const { receiverAddress, content, senderAddress } = body;

    const currentUser = session?.user?.name || senderAddress;
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!receiverAddress || !content) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // AI Moderation: Check if content is harmful
    const isFlagged = await moderateContent(content);
    
    if (isFlagged) {
      // We can either block it entirely, or save it as flagged. Let's block it for safety.
      return NextResponse.json({ error: "Message blocked by AI Moderation due to inappropriate content." }, { status: 403 });
    }

    const result = await pool.query(`
      INSERT INTO chat_messages (sender_address, receiver_address, content, is_flagged)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [currentUser, receiverAddress, content, isFlagged]);

    return NextResponse.json({ message: result.rows[0] });
  } catch (error: any) {
    console.error("Chat POST Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
