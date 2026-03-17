"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Soul {
  id: number;
  package_name: string;
  description: string;
  uploader: string;
  views: number;
  score: number;
}

export default function LeaderboardsPage() {
  const [famousSouls, setFamousSouls] = useState<Soul[]>([]);
  const [trendingSouls, setTrendingSouls] = useState<Soul[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboards() {
      try {
        const [famousRes, trendingRes] = await Promise.all([
          fetch("/api/leaderboards?type=famous"),
          fetch("/api/leaderboards?type=trending"),
        ]);
        
        if (famousRes.ok) {
          const data = await famousRes.json();
          setFamousSouls(data.souls);
        }
        if (trendingRes.ok) {
          const data = await trendingRes.json();
          setTrendingSouls(data.souls);
        }
      } catch (err) {
        console.error("Failed to fetch leaderboards:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboards();
  }, []);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex flex-col items-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-indigo-500 to-purple-500 mb-4 text-center">
          Global Leaderboards
        </h1>
        <p className="text-gray-400 text-center max-w-2xl">
          Discover the most renowned and rapidly rising AI Souls in the ecosystem. Ranked by community engagement and AI-driven heuristics.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Famous Column */}
          <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              🏆 Famous 
              <span className="text-sm font-normal text-gray-500 bg-[#222] px-3 py-1 rounded-full">Most Viewed</span>
            </h2>
            <div className="space-y-4">
              {famousSouls.length === 0 ? (
                <p className="text-gray-500 text-center py-10">No famous souls yet.</p>
              ) : (
                famousSouls.map((soul, index) => (
                  <div key={soul.id} className="flex items-center gap-4 p-4 rounded-xl bg-[#151515] border border-[#333] hover:border-indigo-500/50 transition-colors">
                    <div className="w-8 flex-shrink-0 text-center text-xl font-bold text-gray-600">
                      #{index + 1}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-800 to-black flex items-center justify-center flex-shrink-0 border border-[#333]">
                      🧬
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white truncate">{soul.package_name}</h3>
                      <p className="text-xs text-gray-500 truncate">by {soul.uploader || "Anonymous"}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-indigo-400 font-mono font-bold text-sm">
                        {soul.views.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-gray-500 tracking-wider">VIEWS</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Trending Column */}
          <div className="bg-[#0f0f0f] border border-[#222] rounded-2xl p-6 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              🔥 Trending 
              <span className="text-sm font-normal text-gray-500 bg-[#222] px-3 py-1 rounded-full">Rising Stars</span>
            </h2>
            <div className="space-y-4">
              {trendingSouls.length === 0 ? (
                <p className="text-gray-500 text-center py-10">No trending souls yet.</p>
              ) : (
                trendingSouls.map((soul, index) => (
                  <div key={soul.id} className="flex items-center gap-4 p-4 rounded-xl bg-[#151515] border border-[#333] hover:border-teal-500/50 transition-colors">
                    <div className="w-8 flex-shrink-0 text-center text-xl font-bold text-gray-600">
                      #{index + 1}
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-800 to-black flex items-center justify-center flex-shrink-0 border border-[#333]">
                      🚀
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-white truncate">{soul.package_name}</h3>
                      <p className="text-xs text-gray-500 truncate">by {soul.uploader || "Anonymous"}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-teal-400 font-mono font-bold text-sm">
                        {Number(soul.score).toFixed(1)}
                      </div>
                      <div className="text-[10px] text-gray-500 tracking-wider">SCORE</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
