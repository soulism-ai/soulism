"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";

// Components
import { PumpHeader } from "@/components/pump/PumpHeader";
import { ListToken } from "@/components/pump/ListToken";
import { TokenCard } from "@/components/pump/TokenCard";
import { TradeToken } from "@/components/pump/TradeToken";

// ABIs & Config
import Factory from "@/utils/pump/abis/Factory.json";
import config from "@/utils/pump/config.json";
import images from "@/utils/pump/images.json";

export default function TradePage() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [factory, setFactory] = useState<ethers.Contract | null>(null);
  const [fee, setFee] = useState<bigint>(0n);
  const [tokens, setTokens] = useState<any[]>([]);
  const [token, setToken] = useState<any | null>(null);
  
  const [showCreate, setShowCreate] = useState(false);
  const [showTrade, setShowTrade] = useState(false);

  function toggleCreate() {
    setShowCreate(!showCreate);
  }

  function toggleTrade(selectedToken?: any) {
    if (selectedToken) setToken(selectedToken);
    setShowTrade(!showTrade);
  }

  async function loadBlockchainData() {
    if (typeof window === "undefined" || typeof window.ethereum === "undefined") {
      return; 
    }

    try {
      // Use MetaMask for our connection
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      setProvider(web3Provider);

      // Get the current network
      const network = await web3Provider.getNetwork();
      const chainId = network.chainId.toString();

      // Check if network is in config
      if (!(config as any)[chainId]) return;

      // Create reference to Factory contract
      const factoryAddress = (config as any)[chainId].factory.address;
      const factoryContract = new ethers.Contract(factoryAddress, Factory, web3Provider);
      setFactory(factoryContract);

      // Fetch the fee
      const fetchedFee = await factoryContract.fee();
      setFee(fetchedFee);

      // Fetch active token/soul keys
      const totalTokens = await factoryContract.totalTokens();
      const fetchedTokens = [];

      // Get up to exactly 6 tokens listed (mirrors original logic)
      for (let i = 0; i < Number(totalTokens); i++) {
        if (i === 6) break;

        const tokenSale = await factoryContract.getTokenSale(i);

        const tokenObj = {
          token: tokenSale.token,
          name: tokenSale.name,
          creator: tokenSale.creator,
          sold: tokenSale.sold,
          raised: tokenSale.raised,
          isOpen: tokenSale.isOpen,
          image: images[i] || "https://pump.mypinata.cloud/ipfs/QmZ4ea3wmwzwYwyWnhzs35hyxw4YryWB82TknGY3L5Wbxn"
        };
        fetchedTokens.push(tokenObj);
      }

      setTokens(fetchedTokens.reverse());
    } catch (err) {
      console.error("Failed to load blockchain data", err);
    }
  }

  useEffect(() => {
    loadBlockchainData();
  }, [showCreate, showTrade]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto py-8 px-4 sm:px-8 pt-24 min-h-screen text-zinc-300">
      <PumpHeader account={account} setAccount={setAccount} />

      <main className="flex flex-col gap-8 flex-1">
        
        {/* Call to Action Bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
           <div className="flex flex-col">
             <h1 className="text-3xl font-display font-bold text-white tracking-tight mb-2">Soul Key Listings</h1>
             <p className="text-zinc-500 text-sm max-w-xl">Purchase tokens mapped to AI agents directly off the bonding curve. Buying these keys grants installation permissions exclusively for your self-hosted setups.</p>
           </div>
           
           <button 
             onClick={() => factory && account && toggleCreate()} 
             className="px-6 py-3 bg-[#1c1c1c] text-white text-sm font-bold rounded-xl transition-colors hover:bg-white/10 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed hidden md:block"
             disabled={!factory || !account}
           >
             {!factory ? (
               "Contract Not Deployed"
             ) : !account ? (
               "Please Connect Wallet"
             ) : (
               "+ Create Soul Curve"
             )}
           </button>
        </div>

        {/* Listings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {!account ? (
            <div className="col-span-full py-20 text-center border border-white/5 border-dashed rounded-xl bg-black/40">
              <span className="text-4xl">🔌</span>
              <p className="text-zinc-500 mt-4">Please connect your Web3 wallet to load active metrics.</p>
            </div>
          ) : tokens.length === 0 ? (
            <div className="col-span-full py-20 text-center border border-white/5 border-dashed rounded-xl bg-black/40">
              <span className="text-4xl text-zinc-600">🪫</span>
              <p className="text-zinc-500 mt-4">No active Soul Keys listed on this network.</p>
            </div>
          ) : (
            tokens.map((t, index) => (
              <TokenCard
                toggleTrade={toggleTrade}
                token={t}
                key={index}
              />
            ))
          )}
        </div>

        {/* Floating Create Button for Mobile */}
        <button 
          onClick={() => factory && account && toggleCreate()} 
          className="md:hidden fixed bottom-6 right-6 px-6 py-4 bg-soul-purple text-white text-sm font-bold shadow-2xl rounded-full transition-transform active:scale-95 z-40 disabled:opacity-50"
          disabled={!factory || !account}
        >
           +
        </button>

        {/* Modals */}
        {showCreate && factory && provider && (
          <ListToken toggleCreate={toggleCreate} fee={fee} provider={provider} factory={factory} />
        )}

        {showTrade && factory && provider && token && (
          <TradeToken toggleTrade={toggleTrade} token={token} provider={provider} factory={factory} />
        )}
      </main>
    </div>
  );
}
