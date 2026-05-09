import React, { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Copy, RefreshCw, Droplets, Wallet, ShieldCheck, Zap, 
  AlertCircle, Send, Sun, Moon, Info, ExternalLink, 
  Globe, MessageCircle, Terminal, Cpu, Layers, CheckCircle2,
  ArrowRightLeft, Sparkles, Activity
} from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { 
  Connection, clusterApiUrl, LAMPORTS_PER_SOL, 
  PublicKey, SystemProgram, Transaction 
} from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility for Tailwind class merging
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const endpoints = [
  clusterApiUrl("devnet"),
  "https://api.devnet.solana.com",
  "https://solana-devnet.g.alchemy.com/v2/JkrHjtVtHtegREvk8bi_D"
];

const App = () => {
  const hasMounted = useRef(false);
  const [balance, setBalance] = useState(null);
  const [airdropAmount, setAirdropAmount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [lastAirdropTime, setLastAirdropTime] = useState(0);
  const [theme, setTheme] = useState("dark");
  const [activeTab, setActiveTab] = useState("airdrop");
  const [navSection, setNavSection] = useState("home"); // home, how, faucets

  const [cooldownTime, setCooldownTime] = useState(0);
  const [currentRpcIndex, setCurrentRpcIndex] = useState(0);

  const { connected, publicKey, sendTransaction } = useWallet();

  const toggleTheme = () => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    let timer;
    if (cooldownTime > 0) {
      timer = setInterval(() => {
        setCooldownTime(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldownTime]);

  const getConnection = async (forceNext = false) => {
    let index = forceNext ? (currentRpcIndex + 1) % endpoints.length : currentRpcIndex;
    for (let i = 0; i < endpoints.length; i++) {
      const targetIndex = (index + i) % endpoints.length;
      try {
        const endpoint = endpoints[targetIndex];
        const connection = new Connection(endpoint, {
          commitment: "confirmed",
          confirmTransactionInitialTimeout: 30000
        });
        await connection.getSlot();
        setCurrentRpcIndex(targetIndex);
        return connection;
      } catch (error) {
        console.warn(`RPC ${targetIndex} failed, trying next...`);
      }
    }
    return new Connection(clusterApiUrl("devnet"), "confirmed");
  };

  const fetchBalance = async () => {
    if (!publicKey) return;
    try {
      const connection = await getConnection();
      const lamports = await connection.getBalance(publicKey);
      setBalance((lamports / LAMPORTS_PER_SOL).toFixed(4));
    } catch (error) {
      toast.error("Balance fetch failed.");
    }
  };

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      toast.info("Copied!", { icon: <Copy size={16} /> });
    }
  };

  const handleAirdrop = async (isRetry = false) => {
    if (isLoading || !publicKey || cooldownTime > 0) return;

    const amount = parseFloat(airdropAmount);
    if (isNaN(amount) || amount <= 0 || amount > 2) {
      toast.error("Valid range: 0.1 - 2.0 SOL");
      return;
    }

    setIsLoading(true);
    try {
      const connection = await getConnection(isRetry);
      toast.info(isRetry ? "Trying Fallback RPC..." : "Requesting Mint...", { autoClose: 2000, icon: <Droplets size={16} /> });
      
      const signature = await connection.requestAirdrop(publicKey, amount * LAMPORTS_PER_SOL);
      
      toast.info("Confirming on Solana...", { autoClose: 3000, icon: <RefreshCw size={16} className="animate-spin" /> });
      
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }, "confirmed");

      toast.success(`🎉 ${amount} SOL Minted!`);
      setLastAirdropTime(Date.now());
      setAirdropAmount("");
      fetchBalance();
    } catch (error) {
      console.error("Airdrop Error:", error);
      
      if (error.message?.includes("429") && !isRetry) {
        // Automatically retry with a different RPC once
        handleAirdrop(true);
        return;
      }

      let message = "Airdrop failed. Try again.";
      if (error.message?.includes("429")) {
        message = "Rate Limit Hit! Cooldown active.";
        setCooldownTime(60); // 60s cooldown
      } else if (error.message?.includes("insufficient funds")) {
        message = "Faucet Empty! Try the alternatives tab.";
      }
      
      toast.error(message, { icon: <AlertCircle size={16} />, autoClose: 5000 });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (isTransferring || !publicKey) return;

    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Invalid amount");
      return;
    }

    try {
      new PublicKey(recipientAddress);
    } catch (e) {
      toast.error("Invalid Solana address");
      return;
    }

    setIsTransferring(true);
    try {
      const connection = await getConnection();
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(recipientAddress),
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );

      const signature = await sendTransaction(transaction, connection);
      toast.info("Sending...");
      
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }, "confirmed");

      toast.success(`Successfully sent ${amount} SOL!`);
      setTransferAmount("");
      setRecipientAddress("");
      fetchBalance();
    } catch (error) {
      toast.error("Transfer failed. Check balance.");
    } finally {
      setIsTransferring(false);
    }
  };

  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
      if (!hasMounted.current) {
        toast.success("Wallet Synchronized", { icon: <CheckCircle2 size={16} /> });
        hasMounted.current = true;
      }
    } else {
      setBalance(null);
      hasMounted.current = false;
    }
  }, [connected, publicKey]);

  const bgColor = theme === "dark" ? "bg-black" : "bg-slate-50";
  const textColor = theme === "dark" ? "text-white" : "text-slate-900";
  const cardBg = theme === "dark" ? "bg-[#0a0a0a] border-white/5" : "bg-white border-black/5 shadow-xl shadow-slate-200";

  return (
    <div className={cn("min-h-screen transition-all duration-500 font-nm2 overflow-x-hidden", bgColor, textColor)}>
      
      {/* Visual Accents */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className={cn("absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full blur-[150px] opacity-10", 
          theme === "dark" ? "bg-purple-600" : "bg-purple-300")} />
        <div className={cn("absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full blur-[150px] opacity-10", 
          theme === "dark" ? "bg-blue-600" : "bg-blue-300")} />
      </div>

      {/* Navbar */}
      <motion.nav 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 w-[92%] max-w-6xl z-50"
      >
        <div className={cn(
          "backdrop-blur-3xl border rounded-[2.5rem] px-6 md:px-10 py-4 flex items-center justify-between shadow-2xl transition-all",
          theme === "dark" ? "bg-white/5 border-white/10" : "bg-black/5 border-black/10"
        )}>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setNavSection("home")}>
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Zap className="text-white fill-white" size={20} />
            </div>
            <h1 className="text-xl md:text-2xl font-bold font-lg tracking-tighter">
              DRIP<span className="text-purple-600">X</span>
            </h1>
          </div>
          
          <div className="hidden lg:flex items-center gap-10 font-nm3 text-[10px] uppercase tracking-[0.25em] opacity-50">
            <button onClick={() => setNavSection("home")} className={cn("hover:opacity-100 transition-all", navSection === "home" && "text-purple-600 opacity-100")}>Engine</button>
            <button onClick={() => setNavSection("how")} className={cn("hover:opacity-100 transition-all", navSection === "how" && "text-purple-600 opacity-100")}>Protocol</button>
            <button onClick={() => setNavSection("faucets")} className={cn("hover:opacity-100 transition-all", navSection === "faucets" && "text-purple-600 opacity-100")}>Network</button>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className={cn("p-2.5 rounded-2xl border transition-all", 
                theme === "dark" ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-black/5 border-black/10 hover:bg-black/10")}
            >
              {theme === "dark" ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-slate-600" />}
            </button>
            <div className="scale-75 md:scale-90 origin-right">
              <WalletMultiButton className={cn(
                "!rounded-2xl !transition-all !border-none !font-nm3 !text-[10px] !uppercase !tracking-widest !h-12 !px-8",
                theme === "dark" ? "!bg-white !text-black hover:!opacity-90" : "!bg-black !text-white hover:!opacity-90"
              )} />
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Main Container */}
      <main className="container mx-auto px-6 pt-36 pb-32 relative z-10">
        <div className="flex flex-col lg:flex-row items-start justify-between gap-16 lg:gap-24">
          
          {/* LEFT: Contextual Content */}
          <div className="flex-1 space-y-12 max-w-2xl pt-6">
            <AnimatePresence mode="wait">
              {navSection === "home" && (
                <motion.div 
                  key="home-ui"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  className="space-y-8"
                >
                  <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-purple-600/10 border border-purple-600/20 text-purple-600 text-[10px] font-bold uppercase tracking-[0.2em]">
                    <Activity size={12} className="animate-pulse" />
                    Solana Devnet Status: Optimized
                  </div>
                  <h1 className="text-6xl md:text-8xl lg:text-9xl font-lg leading-[0.85] tracking-tight">
                    Fuel Your <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-500 via-blue-500 to-pink-500 animate-gradient-flow">
                      Ambition.
                    </span>
                  </h1>
                  <p className={cn("text-lg md:text-xl font-nm1 leading-relaxed max-w-lg", 
                    theme === "dark" ? "text-gray-400" : "text-slate-500")}>
                    The definitive devnet engine for high-performance Solana engineers. 
                    Mint, swap, and transfer with atomic precision.
                  </p>
                  
                  <div className="flex flex-wrap gap-4 pt-4">
                    <div className={cn("flex items-center gap-3 px-5 py-3 rounded-2xl border", 
                      theme === "dark" ? "bg-white/5 border-white/5" : "bg-black/5 border-black/5")}>
                      <Terminal size={18} className="text-purple-500" />
                      <span className="text-xs font-bold uppercase tracking-widest opacity-60">CLI Integrated</span>
                    </div>
                    <div className={cn("flex items-center gap-3 px-5 py-3 rounded-2xl border", 
                      theme === "dark" ? "bg-white/5 border-white/5" : "bg-black/5 border-black/5")}>
                      <ShieldCheck size={18} className="text-blue-500" />
                      <span className="text-xs font-bold uppercase tracking-widest opacity-60">Verified Nodes</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {navSection === "how" && (
                <motion.div 
                  key="how-ui"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  className="space-y-10"
                >
                  <h2 className="text-5xl md:text-6xl font-lg tracking-tight">How it Works</h2>
                  <div className="grid gap-8">
                    {[
                      { icon: <Wallet />, title: "Secure Connection", desc: "Link your development wallet using industry-standard Solana Wallet Adapters." },
                      { icon: <Cpu />, title: "Atomic Request", desc: "Trigger a request to our load-balanced RPC cluster to initiate a devnet airdrop." },
                      { icon: <Layers />, title: "On-Chain Validation", desc: "Our engine waits for cluster confirmation before finalizing your local balance." }
                    ].map((step, i) => (
                      <div key={i} className="flex gap-6 items-start group">
                        <div className="w-14 h-14 rounded-2xl bg-purple-600/10 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                          {step.icon}
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-xl font-bold tracking-tight">{step.title}</h4>
                          <p className="text-sm opacity-50 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {navSection === "faucets" && (
                <motion.div 
                  key="faucets-ui"
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  className="space-y-8"
                >
                  <h2 className="text-5xl md:text-6xl font-lg tracking-tight">Alternative Nodes</h2>
                  <p className="opacity-50 text-lg">If our primary engine is under high load, utilize these verified fallback faucets:</p>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      { name: "Solana Official", desc: "Direct from the source", url: "https://faucet.solana.com" },
                      { name: "Alchemy Node", desc: "High reliability fallback", url: "https://solanafaucet.com" },
                      { name: "QuickNode", desc: "Fast atomic delivery", url: "https://faucet.quicknode.com/solana/devnet" },
                      { name: "Hello Moon", desc: "Community powered", url: "https://www.hellomoon.io/faucet" }
                    ].map((node, i) => (
                      <a 
                        key={i} 
                        href={node.url} 
                        target="_blank" 
                        className={cn("p-6 rounded-3xl border transition-all hover:border-purple-500/50 hover:bg-purple-500/5 group", 
                          theme === "dark" ? "bg-white/5 border-white/5" : "bg-black/5 border-black/5")}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold">{node.name}</h4>
                          <ExternalLink size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="text-[10px] opacity-40 uppercase tracking-widest font-bold">{node.desc}</p>
                      </a>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT: Action Dashboard */}
          <div className="w-full max-w-md lg:sticky lg:top-36 self-start">
            <motion.div 
              layout
              className={cn("relative rounded-[3rem] p-8 md:p-10 border transition-all duration-700", cardBg)}
            >
              <AnimatePresence mode="wait">
                {!connected ? (
                  <motion.div 
                    key="disconnected-state"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="py-6 text-center space-y-10"
                  >
                    <div className="relative inline-block mx-auto">
                      <div className="absolute inset-0 bg-purple-600/20 blur-[40px] rounded-full animate-pulse" />
                      <div className={cn("relative w-24 h-24 rounded-[2.5rem] flex items-center justify-center border transition-all",
                        theme === "dark" ? "bg-black border-white/10" : "bg-white border-black/10")}>
                        <Wallet size={40} className="text-purple-600" />
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-3xl font-bold font-nm3 tracking-tight">Sync Wallet</h3>
                      <p className="text-sm opacity-50 font-nm1 max-w-[240px] mx-auto leading-relaxed">
                        Establish a secure connection to unlock the DripX protocol dashboard.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-8 opacity-30">
                        <div className="flex flex-col items-center gap-2">
                          <Activity size={18} />
                          <span className="text-[8px] font-bold uppercase tracking-widest text-center">Live Monitoring</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          <ShieldCheck size={18} />
                          <span className="text-[8px] font-bold uppercase tracking-widest text-center">Secure Sync</span>
                        </div>
                      </div>
                      <WalletMultiButton className={cn(
                        "!w-full !rounded-2xl !h-16 !font-bold !text-sm !uppercase !tracking-[0.3em] !transition-all !border-none !shadow-2xl",
                        theme === "dark" ? "!bg-white !text-black shadow-white/5" : "!bg-black !text-white shadow-black/10"
                      )} />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="connected-state"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-8"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center">
                          <Wallet size={20} className="text-purple-600" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Active Wallet</p>
                          <div 
                            className="flex items-center gap-2 cursor-pointer group hover:text-purple-600 transition-colors" 
                            onClick={copyAddress}
                          >
                            <span className="text-xs font-mono font-bold tracking-tight">
                              {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                            </span>
                            <Copy size={12} className="opacity-30 group-hover:opacity-100" />
                          </div>
                        </div>
                      </div>
                      <div className={cn("px-4 py-2 rounded-2xl border flex flex-col items-end",
                        theme === "dark" ? "bg-white/5 border-white/5" : "bg-black/5 border-black/5")}>
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-40">SOL Balance</p>
                        <div className="flex items-center gap-1">
                          <span className="text-lg font-bold font-lg leading-none">{balance || "0.00"}</span>
                          <RefreshCw 
                            size={12} 
                            className="opacity-30 cursor-pointer hover:rotate-180 transition-transform duration-500" 
                            onClick={fetchBalance}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Dashboard Tabs */}
                    <div className={cn("flex p-1.5 rounded-2xl border", theme === "dark" ? "bg-white/5 border-white/5" : "bg-black/5 border-black/5")}>
                      <button 
                        onClick={() => setActiveTab("airdrop")}
                        className={cn("flex-1 py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2", 
                          activeTab === "airdrop" 
                            ? (theme === "dark" ? "bg-white text-black shadow-lg" : "bg-black text-white shadow-lg") 
                            : "opacity-40 hover:opacity-100")}
                      >
                        <Droplets size={14} />
                        Mint
                      </button>
                      <button 
                        onClick={() => setActiveTab("transfer")}
                        className={cn("flex-1 py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2", 
                          activeTab === "transfer" 
                            ? (theme === "dark" ? "bg-white text-black shadow-lg" : "bg-black text-white shadow-lg") 
                            : "opacity-40 hover:opacity-100")}
                      >
                        <ArrowRightLeft size={14} />
                        Transfer
                      </button>
                    </div>

                    {/* Tab Views */}
                    <AnimatePresence mode="wait">
                      {activeTab === "airdrop" && (
                        <motion.div 
                          key="airdrop-view"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="space-y-6"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between px-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Mint Amount</label>
                              <span className="text-[10px] font-bold text-purple-600">Max 2.0 SOL</span>
                            </div>
                            <div className="relative group">
                              <input
                                type="number"
                                value={airdropAmount}
                                onChange={(e) => setAirdropAmount(e.target.value)}
                                placeholder="0.0"
                                className={cn(
                                  "w-full p-6 rounded-[1.5rem] text-3xl font-bold font-lg focus:outline-none border transition-all",
                                  theme === "dark" ? "bg-black border-white/10 focus:border-purple-600/50" : "bg-slate-50 border-black/10 focus:border-purple-600/50"
                                )}
                              />
                              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-xs font-bold opacity-30">SOL</div>
                            </div>
                          </div>

                          <motion.button
                            whileHover={cooldownTime === 0 ? { scale: 1.02 } : {}}
                            whileTap={cooldownTime === 0 ? { scale: 0.98 } : {}}
                            onClick={() => handleAirdrop(false)}
                            disabled={isLoading || !airdropAmount || cooldownTime > 0}
                            className={cn(
                              "w-full py-6 rounded-3xl font-bold text-xs uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-2xl overflow-hidden relative",
                              (isLoading || !airdropAmount || cooldownTime > 0)
                                ? "bg-slate-500 opacity-30 cursor-not-allowed" 
                                : "bg-purple-600 text-white shadow-purple-600/30"
                            )}
                          >
                            {isLoading ? <RefreshCw className="animate-spin" size={18} /> : (cooldownTime > 0 ? <AlertCircle size={18} /> : <Sparkles size={18} />)}
                            {isLoading ? "Executing..." : (cooldownTime > 0 ? `Wait ${cooldownTime}s` : "Request Mint")}
                          </motion.button>
                        </motion.div>
                      )}

                      {activeTab === "transfer" && (
                        <motion.div 
                          key="transfer-view"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="space-y-5"
                        >
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 px-2">Recipient Public Key</label>
                            <input
                              type="text"
                              value={recipientAddress}
                              onChange={(e) => setRecipientAddress(e.target.value)}
                              placeholder="Enter Address..."
                              className={cn(
                                "w-full p-5 rounded-2xl text-[11px] font-mono focus:outline-none border transition-all",
                                theme === "dark" ? "bg-black border-white/10" : "bg-slate-50 border-black/10"
                              )}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 px-2">Amount</label>
                            <div className="relative">
                              <input
                                type="number"
                                value={transferAmount}
                                onChange={(e) => setTransferAmount(e.target.value)}
                                placeholder="0.0"
                                className={cn(
                                  "w-full p-5 rounded-2xl text-xl font-bold font-lg focus:outline-none border transition-all",
                                  theme === "dark" ? "bg-black border-white/10" : "bg-slate-50 border-black/10"
                                )}
                              />
                              <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-30 uppercase tracking-widest">SOL</div>
                            </div>
                          </div>

                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleTransfer}
                            disabled={isTransferring || !transferAmount || !recipientAddress}
                            className={cn(
                              "w-full py-6 rounded-3xl font-bold text-xs uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-2xl",
                              isTransferring || !transferAmount || !recipientAddress
                                ? "bg-slate-500 opacity-30 cursor-not-allowed" 
                                : "bg-blue-600 text-white shadow-blue-600/30"
                            )}
                          >
                            {isTransferring ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                            {isTransferring ? "Processing..." : "Execute Transfer"}
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    <div className="pt-4 flex items-center justify-center gap-2 opacity-30 text-[9px] font-bold uppercase tracking-[0.2em]">
                      <Info size={10} />
                      <span>Protocol limited to Devnet Operations</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Footer / Credits */}
      <footer className="container mx-auto px-10 pt-20 pb-16">
        <div className={cn("flex flex-col md:flex-row items-center justify-between pt-10 border-t gap-10", 
          theme === "dark" ? "border-white/5" : "border-black/5")}>
          <div className="text-center md:text-left space-y-4">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-600/10 flex items-center justify-center text-purple-600">
                <Zap size={14} fill="currentColor" />
              </div>
              <h3 className="font-bold text-lg tracking-tighter">DRIPX</h3>
            </div>
            <p className="text-xs opacity-40 max-w-[200px] leading-relaxed">The atomic engine for Solana devnet fuel. Built for high-frequency testing.</p>
          </div>
          
          <div className="flex items-center gap-16">
            <div className="flex flex-col items-center md:items-end gap-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-purple-600 animate-pulse">Architect</p>
              <h4 className="text-lg font-bold font-lg tracking-widest uppercase">ayushjava07</h4>
            </div>
            
            <div className="flex items-center gap-4">
              <a href="https://github.com/ayushjava07" target="_blank" className="p-4 rounded-full border border-white/5 hover:bg-purple-600 hover:text-white transition-all duration-500">
                <Globe size={20} />
              </a>
              <a href="#" className="p-4 rounded-full border border-white/5 hover:bg-blue-600 hover:text-white transition-all duration-500">
                <MessageCircle size={20} />
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Global Notifications */}
      <ToastContainer 
        position="bottom-right"
        theme={theme}
        toastStyle={{ 
          backgroundColor: theme === "dark" ? "#111" : "#fff", 
          color: theme === "dark" ? "#fff" : "#000",
          border: theme === "dark" ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)", 
          borderRadius: "2rem",
          fontFamily: "NM2",
          fontSize: "12px",
          padding: "18px 28px"
        }}
      />
    </div>
  );
};

export default App;
