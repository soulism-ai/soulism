"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/");
    },
  });

  const [activeTab, setActiveTab] = useState("Souls");

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-zinc-500">Loading...</div>;
  }

  // Use the GitHub username or email as a fallback
  const username = session?.user?.name || session?.user?.email?.split('@')[0] || "User";
  const userImage = session?.user?.image || "";

  const tabs = ["Balances", "Souls", "Creator Rewards", "Replies", "Notifications"];

  return (
    <main className="min-h-screen pt-24 pb-20 px-6 sm:px-12 max-w-5xl mx-auto">
      {/* Profile Header section imitating Pump.fun */}
      <div className="mb-12">
        <Link href="/" className="inline-flex items-center text-zinc-400 hover:text-white mb-8 transition-colors">
          <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/10 pb-8">
          <div className="flex items-center gap-6">
            {userImage ? (
              <img src={userImage} alt={username} className="w-24 h-24 rounded-full border-2 border-soul-purple shadow-[0_0_15px_rgba(234,88,12,0.5)]" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-zinc-800 border-2 border-soul-purple flex items-center justify-center text-2xl font-bold p-1">
                 <div className="w-full h-full rounded-full bg-zinc-700 flex items-center justify-center">
                    {username.charAt(0).toUpperCase()}
                 </div>
              </div>
            )}
            
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-bold flex items-center gap-3">
                {username}
                <button className="text-xs px-3 py-1 bg-white/10 hover:bg-white/20 rounded font-medium transition-colors">edit</button>
              </h1>
              
              <div className="flex items-center gap-2 text-sm text-zinc-500 font-mono">
                 <span className="truncate max-w-[120px]">4X7Y6...5sce</span>
                 <button className="hover:text-white"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg></button>
                 <a href="#" className="hover:text-white ml-2 flex items-center gap-1">View on solscan <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>
              </div>

              <div className="flex items-center gap-6 mt-2 text-sm">
                <div className="flex flex-col"><span className="font-bold text-white text-lg">0</span><span className="text-zinc-500">Followers</span></div>
                <div className="flex flex-col"><span className="font-bold text-white text-lg">0</span><span className="text-zinc-500">Following</span></div>
                <div className="flex flex-col"><span className="font-bold text-white text-lg">0</span><span className="text-zinc-500">Created souls</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-6 border-b border-white/5 mt-6 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "text-white border-b-2 border-soul-purple"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area based on Active Tab */}
      <div className="min-h-[400px]">
         {activeTab === "Souls" ? (
            <div className="flex flex-col border border-white/10 rounded-2xl bg-[#1d1513] p-12 text-center items-center justify-center h-[350px]">
               <div className="w-12 h-12 mb-4 bg-white/5 rounded flex items-center justify-center text-zinc-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
               </div>
               <h3 className="text-xl font-bold mb-2">No souls yet</h3>
               <p className="text-zinc-400 mb-8 max-w-sm mx-auto">Upload your first soul to share it with the community.</p>
               <Link href="/souls/upload" className="px-6 py-3 bg-[#c2410c] hover:bg-[#9a3412] text-white font-bold rounded-lg transition-colors flex items-center gap-2">
                 <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                 </svg>
                 Upload a Soul
               </Link>
            </div>
         ) : (
            <div className="flex flex-col items-center justify-center text-zinc-500 h-[200px]">
               {activeTab} content goes here
            </div>
         )}
      </div>

    </main>
  );
}
