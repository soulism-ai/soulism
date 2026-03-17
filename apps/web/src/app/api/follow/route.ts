import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const searchParams = req.nextUrl.searchParams;
    const targetUserId = searchParams.get("targetUserId");
    const web3Account = searchParams.get("web3Account");
    
    // Who is currently logged in?
    const currentUserId = session?.user?.email || web3Account || "guest_user";
    
    if (!targetUserId) {
      return NextResponse.json({ error: "Missing target targetUserId parameter" }, { status: 400 });
    }

    // 1. Get follower count for targetUserId
    const countResult = await pool.query(
      `SELECT COUNT(*) as follower_count FROM user_followers WHERE following_id = $1`,
      [targetUserId]
    );
    const followersCount = parseInt(countResult.rows[0].follower_count || "0", 10);

    // 2. Check if current user is following the target user
    const isFollowingResult = await pool.query(
      `SELECT id FROM user_followers WHERE follower_id = $1 AND following_id = $2`,
      [currentUserId, targetUserId]
    );
    const isFollowing = (isFollowingResult.rowCount || 0) > 0;

    return NextResponse.json({ followersCount, isFollowing });
  } catch (error: any) {
    console.error("Follow GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const { targetUserId, web3Account } = body;
    
    const followerId = session?.user?.email || web3Account;

    if (!followerId) {
      return NextResponse.json({ error: "Unauthorized. Must be logged in to follow users." }, { status: 401 });
    }

    if (!targetUserId) {
      return NextResponse.json({ error: "Missing config: targetUserId" }, { status: 400 });
    }
    
    if (followerId === targetUserId) {
      return NextResponse.json({ error: "Cannot follow yourself." }, { status: 400 });
    }

    // Check existing follow
    const checkResult = await pool.query(
      `SELECT id FROM user_followers WHERE follower_id = $1 AND following_id = $2`,
      [followerId, targetUserId]
    );

    if ((checkResult.rowCount || 0) > 0) {
      // Unfollow (delete the record)
      await pool.query(
        `DELETE FROM user_followers WHERE follower_id = $1 AND following_id = $2`,
        [followerId, targetUserId]
      );
      return NextResponse.json({ success: true, action: "unfollowed" });
    } else {
      // Follow (insert record)
      await pool.query(
        `INSERT INTO user_followers (follower_id, following_id) VALUES ($1, $2)`,
        [followerId, targetUserId]
      );
      return NextResponse.json({ success: true, action: "followed" });
    }

  } catch (error: any) {
    console.error("Follow POST Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
