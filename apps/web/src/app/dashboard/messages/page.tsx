"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";

interface ChatMessage {
  id: number;
  sender_address: string;
  receiver_address: string;
  content: string;
  is_flagged: boolean;
  created_at: string;
}

export default function MessagesPage() {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [recipient, setRecipient] = useState("");
  const [errorText, setErrorText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Poll for messages every 3 seconds
  useEffect(() => {
    if (!session?.user?.name || !recipient) return;

    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/chat/messages?otherUser=${recipient}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages);
          scrollToBottom();
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [session?.user?.name, recipient]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !recipient) return;
    setErrorText("");

    const currentUser = session?.user?.name;
    const previousMessages = [...messages];
    
    // Optistic update
    const tempMessage: ChatMessage = {
      id: Date.now(),
      sender_address: currentUser || "me",
      receiver_address: recipient,
      content: newMessage,
      is_flagged: false,
      created_at: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, tempMessage]);
    setNewMessage("");

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderAddress: currentUser,
          receiverAddress: recipient,
          content: tempMessage.content
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        setErrorText(errData.error || "Failed to send message (might be flagged by AI)");
        // Revert optimistic update
        setMessages(previousMessages);
      } else {
        const data = await res.json();
        setMessages(prev => [...prev.filter(m => m.id !== tempMessage.id), data.message]);
        scrollToBottom();
      }
    } catch (err) {
      console.error(err);
      setErrorText("Network error");
      setMessages(previousMessages);
    }
  };

  return (
    <div className="flex flex-col h-[80vh] bg-[#0A0A0A] border border-[#333] rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="bg-[#111] p-4 border-b border-[#333] flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-indigo-500">
            Secure AI Chat
          </h2>
          <p className="text-xs text-gray-400">All messages are scanned via OpenAI Antivirus</p>
        </div>
        <div className="flex gap-2 items-center">
          <input 
            type="text" 
            placeholder="Recipient username/wallet..." 
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="bg-[#222] border border-[#444] rounded-md px-3 py-1.5 focus:outline-none focus:border-indigo-500 text-sm w-48 transition-colors"
          />
        </div>
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm bg-black/50">
        {!recipient ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            Enter a recipient to start chatting
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-600 mt-10">
            No secure messages yet with {recipient}
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_address === session?.user?.name;
            return (
              <div key={msg.id || idx} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <span className="text-[10px] text-gray-500 mb-1 px-1">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div 
                  className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                    isMe 
                    ? "bg-indigo-600/20 text-indigo-100 border border-indigo-500/30 rounded-tr-none" 
                    : "bg-[#222] text-gray-200 border border-[#333] rounded-tl-none"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Box */}
      {errorText && (
        <div className="px-4 py-2 bg-red-500/10 text-red-400 text-xs text-center border-t border-red-500/20">
          ⚠️ {errorText}
        </div>
      )}
      <div className="p-4 bg-[#111] border-t border-[#333]">
        <form onSubmit={sendMessage} className="flex gap-3">
          <input
            type="text"
            className="flex-1 bg-black border border-[#444] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder-gray-500 transition-all font-mono text-sm"
            placeholder="Type your secure message..."
            value={newMessage}
            disabled={!recipient}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          <button 
            type="submit"
            disabled={!recipient || !newMessage.trim()}
            className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-teal-500 text-white rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
