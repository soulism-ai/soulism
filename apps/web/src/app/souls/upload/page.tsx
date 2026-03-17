"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ethers } from "ethers";

// ABIs & Config
import Factory from "@/utils/pump/abis/Factory.json";
import config from "@/utils/pump/config.json";

export default function UploadSoul() {
  const { data: session } = useSession();
  const router = useRouter();

  const [dragActive, setDragActive] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [version, setVersion] = useState("");
  const [description, setDescription] = useState("");
  const [web3Account, setWeb3Account] = useState<string | null>(null);
  const [isCheckingWeb3, setIsCheckingWeb3] = useState(true);

  React.useEffect(() => {
    const checkWeb3 = async () => {
      if (typeof window !== "undefined" && typeof (window as any).ethereum !== "undefined") {
        if (localStorage.getItem("web3_disconnected") !== "true") {
          try {
            const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) setWeb3Account(accounts[0]);
          } catch (err) {
            console.error(err);
          }
        }
      }
      setIsCheckingWeb3(false);
    };
    checkWeb3();
  }, []);

  const [file, setFile] = useState<File | null>(null);

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
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handlePublish = async () => {
    if (!packageName || !version || !description) {
      alert("Please fill out Package Name, Version, and Description");
      return;
    }

    setIsPublishing(true);

    try {
      // 1. Post to Backend DB
      const formData = new FormData();
      formData.append("packageName", packageName);
      formData.append("version", version);
      formData.append("description", description);
      if (web3Account) formData.append("web3Account", web3Account);
      if (file) formData.append("file", file);

      const dbResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!dbResponse.ok) {
        const errData = await dbResponse.json();
        throw new Error(errData.error || "Failed to save to database");
      }

      // 2. Transact on Web3
      if (typeof window === "undefined" || typeof (window as any).ethereum === "undefined") {
        alert("Web3 Wallet not found. Please select 'Connect Wallet' in the top right Auth Modal first.");
        return;
      }

      await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
      const web3Provider = new ethers.BrowserProvider((window as any).ethereum);
      const network = await web3Provider.getNetwork();
      const chainId = network.chainId.toString();

      if (!(config as any)[chainId]) {
        alert("Factory contract not deployed to this EVM network.");
        return;
      }

      const factoryAddress = (config as any)[chainId].factory.address;
      const factoryContract = new ethers.Contract(factoryAddress, Factory, web3Provider);
      const fee = await factoryContract.fee();

      const signer = await web3Provider.getSigner();
      const ticker = packageName.replace(/[^a-zA-Z]/g, "").substring(0, 4).toUpperCase();

      const transaction = await (factoryContract as any).connect(signer).create(packageName, ticker || "SOUL", { value: fee });
      await transaction.wait();

      alert(`Success! ${packageName} (${ticker || "SOUL"}) has been bound to the Curve and saved to DB.`);
      router.push("/souls");
    } catch (err: any) {
      console.error("Failed to publish bundle", err);
      alert(err.message || "User rejected transaction or contract failed.");
    } finally {
      setIsPublishing(false);
    }
  };

  if (isCheckingWeb3) {
    return <div className="max-w-2xl mx-auto py-20 text-center text-zinc-500">Checking authentication...</div>;
  }

  if (!session && !web3Account) {
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
    <div className="max-w-3xl mx-auto py-20">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">Publish a Soul</h1>
          <p className="text-zinc-400">Upload a `.tar.gz` or `.zip` Soulism persona bundle and deploy its bonding curve.</p>
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
              <label className="block text-sm font-bold text-zinc-300 mb-2">Package Name / Key ID</label>
              <input type="text" value={packageName} onChange={(e) => setPackageName(e.target.value)} placeholder="e.g. github-agent" className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-soul-purple transition-colors" />
              <p className="text-xs text-zinc-500 mt-2">Will be wrapped in a smart contract.</p>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-300 mb-2">Version</label>
              <input type="text" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-soul-purple transition-colors" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-zinc-300 mb-2">Description</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Briefly describe what this soul/persona does..." className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-soul-purple transition-colors resize-none"></textarea>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 flex justify-end">
          <button
            onClick={handlePublish}
            disabled={isPublishing || !packageName}
            className={`px-6 py-2 font-bold rounded-full transition-colors ${!packageName || isPublishing ? "bg-white/10 text-zinc-500 cursor-not-allowed" : "bg-soul-purple hover:bg-purple-600 text-white"}`}
          >
            {isPublishing ? "Deploying..." : "Validate & Publish (Requires Gas)"}
          </button>
        </div>
      </div>
    </div>
  );
}
