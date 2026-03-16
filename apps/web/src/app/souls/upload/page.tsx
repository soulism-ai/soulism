"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function UploadSoul() {
  const { data: session } = useSession();
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    // In a real app we'd validate and upload the soul bundle here
    alert("Bundle drop captured!");
  };

  if (!session) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <h2 className="font-display text-3xl font-bold mb-4">Authentication Required</h2>
        <p className="text-zinc-400 mb-8">You must be signed in to upload and manage custom Souls.</p>
        <Link href="/souls" className="px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors">
          Return to Hub
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">Publish a Soul</h1>
          <p className="text-zinc-400">Upload a `.tar.gz` or `.zip` Soulism persona bundle.</p>
        </div>
        <Link href="/souls" className="px-4 py-2 border border-white/10 hover:bg-white/5 rounded-full text-sm font-medium transition-colors">
          Cancel
        </Link>
      </div>

      <div className="dashboard-card p-8">
        <div 
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragActive ? "border-soul-purple bg-soul-purple/5" : "border-white/20 hover:border-white/40"}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="w-16 h-16 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-6">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-zinc-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <h3 className="font-bold text-xl mb-2">Drag and drop your bundle here</h3>
          <p className="text-zinc-500 mb-6 text-sm">Supported formats: .tar.gz, .zip (Max 50MB)</p>
          <button className="px-6 py-3 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold rounded-full transition-colors">
            Select File
          </button>
        </div>

        <div className="mt-8 space-y-6">
          <div className="grid grid-cols-2 gap-6">
             <div>
               <label className="block text-sm font-bold text-zinc-300 mb-2">Package Name</label>
               <input type="text" placeholder="e.g. github-agent" className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-soul-purple transition-colors" />
               <p className="text-xs text-zinc-500 mt-2">Must be lowercase and URL-safe.</p>
             </div>
             <div>
               <label className="block text-sm font-bold text-zinc-300 mb-2">Version</label>
               <input type="text" placeholder="1.0.0" className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-soul-purple transition-colors" />
             </div>
          </div>
          
          <div>
            <label className="block text-sm font-bold text-zinc-300 mb-2">Description</label>
            <textarea rows={3} placeholder="Briefly describe what this soul/persona does..." className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-soul-purple transition-colors resize-none"></textarea>
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-white/10 flex justify-end">
          <button className="px-6 py-2 bg-soul-purple hover:bg-purple-600 font-bold rounded-full transition-colors opacity-50 cursor-not-allowed">
            Validate & Publish
          </button>
        </div>
      </div>
    </div>
  );
}
