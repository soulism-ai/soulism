import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getServerSession } from "next-auth";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    const searchParams = req.nextUrl.searchParams;
    const web3Account = searchParams.get("web3Account");
    
    const userId = session?.user?.email || web3Account;
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tradesResult = await pool.query(
      `SELECT * FROM user_trades WHERE wallet_address = $1 ORDER BY created_at DESC`,
      [userId]
    );
    
    const trades = tradesResult.rows;

    // Follower and Following counts
    const followersResult = await pool.query(
      `SELECT COUNT(*) FROM user_followers WHERE following_id = $1`,
      [userId]
    );

    const followingResult = await pool.query(
      `SELECT COUNT(*) FROM user_followers WHERE follower_id = $1`,
      [userId]
    );

    const followersCount = parseInt(followersResult.rows[0].count || "0", 10);
    const followingCount = parseInt(followingResult.rows[0].count || "0", 10);

    // Calculate roughly some stats based on trades
    let portfolioValue = 0;
    let realizedPnl = 0;
    let totalRevenue = 0;

    trades.forEach(trade => {
        if (trade.trade_type === 'buy') {
            portfolioValue += Number(trade.price_eth);
        } else if (trade.trade_type === 'sell') {
            portfolioValue -= Number(trade.price_eth);
            realizedPnl += Number(trade.price_eth); // simplified
        }
        totalRevenue += Number(trade.fee_eth);
    });

    // In a real app we would also join with the souls table, but here we mock missing data simply
    return NextResponse.json({ 
        portfolioValue: portfolioValue.toFixed(3), 
        realizedPnl: realizedPnl.toFixed(3),
        totalRevenue: totalRevenue.toFixed(3),
        followersCount,
        followingCount,
        trades,
        boughtSouls: trades.filter(t => t.trade_type === 'buy'),
        soldSouls: trades.filter(t => t.trade_type === 'sell')
    });
  } catch (error: any) {
    console.error("Dashboard GET Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
