import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "famous"; // "famous" or "trending"

    let query = "";
    if (type === "trending") {
      // Trending: Order by score (ML heuristics proxy)
      query = `
        SELECT id, package_name, description, uploader, views, score
        FROM souls_registry
        WHERE is_flagged = FALSE
        ORDER BY score DESC
        LIMIT 10
      `;
    } else {
      // Famous: Order by views/popularity
      query = `
        SELECT id, package_name, description, uploader, views, score
        FROM souls_registry
        WHERE is_flagged = FALSE
        ORDER BY views DESC
        LIMIT 10
      `;
    }

    const result = await pool.query(query);

    return NextResponse.json({ souls: result.rows });
  } catch (error: any) {
    console.error("Leaderboard API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
