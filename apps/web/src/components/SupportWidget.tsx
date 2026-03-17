"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

type ViewState = "home" | "messages" | "help" | "chat" | "article";

export function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ViewState>("home");
  const [isClosing, setIsClosing] = useState(false);
  const [showLauncher, setShowLauncher] = useState(true);

  useEffect(() => {
    const handleToggle = () => {
      if (isOpen) {
        handleClose();
      } else {
        setIsOpen(true);
        setIsClosing(false);
        setShowLauncher(false);
      }
    };
    
    window.addEventListener("toggle-support", handleToggle);
    return () => window.removeEventListener("toggle-support", handleToggle);
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setShowLauncher(true);
    }, 300); // match animation duration
  };

  if (!isOpen && !showLauncher) return null;

  return (
    <>
      {/* Floating Launcher Button */}
      {showLauncher && !isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setShowLauncher(false);
          }}
          className="fixed bottom-6 right-6 w-14 h-14 bg-green-900 rounded-full shadow-lg flex items-center justify-center hover:bg-green-800 transition-colors z-[100] border border-white/10"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      {/* Main Widget */}
      {isOpen && (
        <div className={`fixed bottom-6 right-6 w-[380px] h-[680px] max-h-[calc(100vh-48px)] bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden z-[100] text-zinc-900 font-sans origin-bottom-right transition-all duration-300 ${isClosing ? 'scale-95 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}>
          {view === "home" && <HomeView setView={setView} onClose={handleClose} />}
          {view === "help" && <HelpView setView={setView} onClose={handleClose} />}
          {view === "messages" && <MessagesView setView={setView} onClose={handleClose} />}
          {view === "chat" && <ChatView setView={setView} onClose={handleClose} />}
          {view === "article" && <ArticleView setView={setView} onClose={handleClose} />}

          {/* Bottom Navigation */}
          {["home", "messages", "help"].includes(view) && (
            <div className="flex items-center justify-around border-t border-zinc-100 bg-white py-3 px-2 shrink-0">
              <button onClick={() => setView("home")} className={`flex flex-col items-center gap-1 w-20 transition-colors ${view === "home" ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}>
                <svg className="w-6 h-6" fill={view === "home" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={view === "home" ? 0 : 1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                <span className="text-[11px] font-medium">Home</span>
              </button>
              <button onClick={() => setView("messages")} className={`flex flex-col items-center gap-1 w-20 transition-colors ${view === "messages" ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}>
                <svg className="w-6 h-6" fill={view === "messages" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={view === "messages" ? 0 : 1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <span className="text-[11px] font-medium">Messages</span>
              </button>
              <button onClick={() => setView("help")} className={`flex flex-col items-center gap-1 w-20 transition-colors ${view === "help" ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-700"}`}>
                <svg className="w-6 h-6" fill={view === "help" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={view === "help" ? 0 : 1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[11px] font-medium">Help</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// --- VIEWS ---

function HomeView({ setView, onClose }: { setView: (v: ViewState) => void, onClose: () => void }) {
  return (
    <div className="flex-1 bg-[#fcfcfc] overflow-y-auto overflow-x-hidden flex flex-col relative w-full h-full">
      {/* Dark green header section */}
      <div className="bg-[#0b3b24] text-white p-6 pt-10 pb-[60px] relative shrink-0">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="flex items-center justify-between mb-6">
          <div className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center p-1 overflow-hidden shadow-sm">
             <div className="w-full h-full bg-white rounded-full flex items-center justify-center text-xs">💊</div>
          </div>
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-zinc-800 border-2 border-[#0b3b24] flex items-center justify-center text-[10px] overflow-hidden">
               <Image src="/logo.png" alt="Soulism" width={32} height={32} className="object-cover" />
            </div>
            <div className="w-8 h-8 rounded-full bg-zinc-200 border-2 border-[#0b3b24] flex items-center justify-center text-[10px] overflow-hidden">
                🤖
            </div>
          </div>
        </div>
        <h1 className="text-3xl font-bold leading-tight tracking-tight">Hi there 👋<br/>How may we help?</h1>
      </div>

      <div className="flex-1 px-4 -mt-8 pb-6 flex flex-col gap-4 relative z-10 w-full">
        {/* Send us a message card */}
        <div 
          onClick={() => setView("chat")}
          className="bg-white rounded-xl shadow-sm border border-zinc-100 p-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow group relative z-20 w-full"
        >
          <div>
            <h3 className="font-semibold text-[15px] mb-0.5">Send us a message</h3>
            <p className="text-zinc-500 text-[13px]">We typically reply in under 5 minutes</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center group-hover:bg-zinc-50 transition-colors">
            <svg className="w-4 h-4 text-zinc-900 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-100 p-2 relative z-20 w-full">
          <div className="relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <input 
              type="text" 
              placeholder="Search for help" 
              className="w-full bg-amber-50/20 py-2.5 pl-9 pr-4 rounded-lg text-[14px] focus:outline-none placeholder:text-zinc-500 border-none transition-colors"
            />
          </div>
          <div className="mt-2 divide-y divide-zinc-50">
            <ArticleLink title="Create a Persona on Soulism" onClick={() => setView("article")} />
            <ArticleLink title="Memory Context Limits on Soulism" onClick={() => setView("article")} />
            <ArticleLink title="How to Edit Soul Image, Description, and Instructions?" onClick={() => setView("article")} />
            <ArticleLink title="Tools configuration" onClick={() => setView("article")} />
          </div>
        </div>

        {/* Follow CTA */}
        <a href="https://twitter.com/soulism" target="_blank" rel="noopener noreferrer" className="bg-white rounded-xl shadow-sm border border-zinc-100 p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors w-full z-20">
          <span className="font-medium text-[14px]">Follow Our X For The Latest Updates!</span>
          <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      </div>
    </div>
  )
}

function ArticleLink({ title, onClick }: { title: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left py-3 px-2 flex items-center justify-between hover:bg-zinc-50 rounded-lg group transition-colors">
      <span className="text-[14px] text-zinc-700">{title}</span>
      <svg className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
    </button>
  )
}

function HelpView({ setView, onClose }: { setView: (v: ViewState) => void, onClose: () => void }) {
  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col w-full h-full">
      <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-100 shrink-0">
        <h2 className="font-semibold text-[17px]">Help</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="p-4 border-b border-zinc-100 shrink-0">
        <div className="relative">
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
            <svg className="w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <input 
            type="text" 
            placeholder="Search for help" 
            className="w-full bg-zinc-100/80 py-2.5 pl-4 pr-9 rounded-xl text-[14px] focus:outline-none focus:ring-2 focus:ring-green-500/20 placeholder:text-zinc-500 transition-shadow"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto w-full">
        <div className="px-5 py-4">
          <h3 className="font-semibold text-[15px] mb-3">8 collections</h3>
          <div className="divide-y divide-zinc-100">
            <CollectionItem title="Creating and Managing Souls: Everything You Need to Know" desc="Details about persona creation." count="3 articles" onClick={() => setView("article")} />
            <CollectionItem title="Managing Your Prompts" desc="Context window, usage limits, formatting." count="3 articles" onClick={() => setView("article")} />
            <CollectionItem title="Tokens & Limits" desc="Everything you need to know about your request limits." count="4 articles" onClick={() => setView("article")} />
            <CollectionItem title="SoulSwap" desc="How to use SoulSwap" count="2 articles" onClick={() => setView("article")} />
          </div>
        </div>
      </div>
    </div>
  )
}

function CollectionItem({ title, desc, count, onClick }: { title: string, desc: string, count: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left py-4 flex items-center justify-between group hover:bg-zinc-50 rounded-lg -mx-2 px-2 transition-colors">
      <div className="pr-4">
        <h4 className="font-medium text-[14px] text-zinc-900 mb-1 leading-snug">{title}</h4>
        <p className="text-[13px] text-zinc-500 leading-snug">{desc}</p>
        <p className="text-[12px] text-zinc-400 mt-2">{count}</p>
      </div>
      <svg className="w-4 h-4 text-zinc-400 group-hover:text-zinc-900 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
    </button>
  )
}

function MessagesView({ setView, onClose }: { setView: (v: ViewState) => void, onClose: () => void }) {
  return (
    <div className="flex-1 bg-white flex flex-col w-full h-full relative">
      <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-100 shrink-0 absolute top-0 w-full z-10 bg-white">
        <div className="w-5"></div>
        <h2 className="font-semibold text-[17px]">Messages</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center mt-14 mb-[80px]">
        <svg className="w-12 h-12 text-zinc-900 mb-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
        </svg>
        <h3 className="text-[20px] font-bold mb-2">No messages</h3>
        <p className="text-zinc-600 text-[15px]">Messages from the team will be shown here</p>
      </div>

      <div className="absolute bottom-4 left-6 right-6 pb-2">
        <button 
          onClick={() => setView("chat")}
          className="w-full bg-[#8ae1a5] hover:bg-[#7dd798] text-zinc-900 font-semibold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
        >
          <span>Send us a message</span>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  )
}

function ChatView({ setView, onClose }: { setView: (v: ViewState) => void, onClose: () => void }) {
  return (
    <div className="flex-1 bg-white flex flex-col w-full h-full">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-100 shadow-sm shrink-0">
        <button onClick={() => setView("home")} className="text-zinc-500 hover:text-zinc-800 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-400 flex items-center justify-center p-0.5 border border-zinc-200">
            <div className="w-full h-full bg-white rounded-full flex items-center justify-center text-xs">💊</div>
          </div>
          <div className="flex flex-col">
            <h2 className="font-semibold text-[15px] leading-tight">Soulism</h2>
            <span className="text-[12px] text-zinc-500 leading-tight">The team can also help</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="text-zinc-500 hover:text-zinc-800 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-[#fcfcfc] w-full">
        <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-zinc-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-[13px] text-zinc-600 leading-relaxed">
              This chat is dedicated to Soulism platform support. Please keep your messages focused on support-related inquiries. Thank you!
            </p>
          </div>
        </div>

        <div className="mb-4">
          <div className="bg-zinc-100 rounded-2xl rounded-tl-sm py-3 px-4 inline-block max-w-[85%] text-zinc-900 border border-zinc-200">
            <p className="text-[15px] font-semibold mb-1">How may we assist you today?</p>
          </div>
          <div className="text-[11px] text-zinc-400 mt-1.5 ml-1 flex items-center gap-1.5">
            <span>Soulism • AI Agent • Just now</span>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white border-t border-zinc-100 w-full shrink-0">
        <div className="flex flex-wrap gap-2 justify-end">
          <QuickReply label="Soul Details" />
          <QuickReply label="Configuration Issues" />
          <QuickReply label="Submit Your Feedback" />
          <QuickReply label="Speak to Support" />
        </div>
      </div>
    </div>
  )
}

function QuickReply({ label }: { label: string }) {
  return (
    <button className="bg-white border border-green-200 text-green-800 px-4 py-2 rounded-full text-[13px] font-medium hover:bg-green-50 transition-colors shadow-sm">
      {label}
    </button>
  )
}

function ArticleView({ setView, onClose }: { setView: (v: ViewState) => void, onClose: () => void }) {
  return (
    <div className="flex-1 bg-white flex flex-col w-full h-full">
      <div className="px-4 py-3 flex items-center justify-between border-b border-zinc-100 shrink-0">
        <button onClick={() => setView("home")} className="text-zinc-500 hover:text-zinc-800 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="flex items-center gap-1">
          <button className="text-zinc-500 hover:text-zinc-800 p-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-800 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 pb-10 w-full">
        <h1 className="text-[22px] font-bold mb-4 leading-tight">Create a Persona on Soulism</h1>
        
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white shrink-0 shadow-sm border border-orange-700">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.48 13.03A4 4 0 0116 19h-4a2 2 0 110-4h3a2 2 0 100-4h-1.5a2 2 0 110-4H16a4 4 0 013.48 5.97z"/></svg>
          </div>
          <div>
            <p className="text-[12px] text-zinc-500 leading-tight">Written by Fire Doji</p>
            <p className="text-[12px] text-zinc-400 leading-tight">Updated over 7 months ago</p>
          </div>
        </div>

        <div className="prose prose-sm prose-zinc max-w-none text-[15px] leading-relaxed">
          <p>
            Persona creation in itself is free on Soulism, but the persona will be local and not seen by the public until published. To get it cloud-hosted, it must be deployed by you.
          </p>
          
          <h3 className="text-[16px] font-semibold mt-8 mb-4 border-b border-zinc-100 pb-2">▼ How much does it cost to deploy?</h3>
          <p>
            If you wish to deploy your persona to our infrastructure to set it online, the following usage fees apply:
          </p>
          <ul className="list-disc pl-5 my-4 space-y-1.5 marker:text-zinc-400">
            <li>Free tier includes 1,000 requests.</li>
            <li>$0.01 per additional compute unit.</li>
            <li>Recommended extra buffer for future transactions.</li>
          </ul>

          <div className="bg-[#f0f9f4] border border-[#d3ecd9] rounded-xl p-4 my-6 text-[#1f4e30] font-medium text-[14px]">
            Example: If you deposit $10 in wallet minus $1 as mentioned above, you have $9 to power ongoing usage.
          </div>

          <h3 className="text-[16px] font-semibold mt-8 mb-4 border-b border-zinc-100 pb-2">▶ What is a handle?</h3>
          <h3 className="text-[16px] font-semibold mt-6 mb-4 border-b border-zinc-100 pb-2">▶ What kind of images can I use for my persona?</h3>
          <h3 className="text-[16px] font-semibold mt-6 mb-4 border-b border-zinc-100 pb-2">▶ How do I add my website and socials?</h3>
        </div>
      </div>
    </div>
  )
}
