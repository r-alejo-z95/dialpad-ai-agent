"use client";

import { useState, useEffect, useRef } from "react";
import { processScreenshot, Contact } from "./actions/process-screenshot";
import Vapi from "@vapi-ai/web";
import { Upload, Phone, Play, Pause, Square, ExternalLink, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import clsx from "clsx";

const vapiPublicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || "";

export default function Dashboard() {
  // State
  const [extensionId, setExtensionId] = useState("");
  const [conferenceInfo, setConferenceInfo] = useState("");
  const [dynamicPrompt, setDynamicPrompt] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [campaignState, setCampaignState] = useState<"idle" | "running" | "paused">("idle");
  const [currentContactIndex, setCurrentContactIndex] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Vapi
  const [vapi, setVapi] = useState<Vapi | null>(null);
  const [isVapiConnected, setIsVapiConnected] = useState(false);
  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "active" | "ended">("idle");
  const [callReport, setCallReport] = useState<any>(null);
  const [agentMode, setAgentMode] = useState<"assistant" | "voicemail" | "human_only">("assistant");
  const [isAlerting, setIsAlerting] = useState(false);
  const [bypassVapi, setBypassVapi] = useState(true);
  const [skipTimer, setSkipTimer] = useState(20);
  const [countdown, setCountdown] = useState<number | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // --- Helpers ---

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const playAlertSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.5);
      
      // Second beep
      setTimeout(() => {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1109.12, audioCtx.currentTime); // C#6
        gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.5);
      }, 200);
    } catch (e) {
      console.error("Failed to play alert sound", e);
    }
  };

  const sendToExtension = async (type: string, payload: any) => {
    if (!extensionId) {
      alert("Please enter your Chrome Extension ID first.");
      return;
    }

    if (!(window as any).chrome?.runtime) {
      addLog("Error: Chrome Runtime not found. Are you using Chrome?");
      return;
    }

    try {
      (window as any).chrome.runtime.sendMessage(extensionId, { type, payload }, (response: any) => {
        if ((window as any).chrome.runtime.lastError) {
          addLog(`Extension Error: ${(window as any).chrome.runtime.lastError.message}`);
        } else {
          addLog(`Sent to Extension: ${type}`);
        }
      });
    } catch (e: any) {
      addLog(`Communication Error: ${e.message}`);
    }
  };

  // --- Persistence ---
  useEffect(() => {
    const savedContacts = localStorage.getItem("dialpad_contacts");
    const savedIndex = localStorage.getItem("dialpad_current_index");
    const savedMode = localStorage.getItem("dialpad_agent_mode");
    const savedBypass = localStorage.getItem("dialpad_bypass_vapi");
    const savedTimer = localStorage.getItem("dialpad_skip_timer");

    if (savedContacts) setContacts(JSON.parse(savedContacts));
    if (savedIndex) setCurrentContactIndex(parseInt(savedIndex));
    if (savedMode) setAgentMode(savedMode as any);
    if (savedBypass) setBypassVapi(savedBypass === "true");
    if (savedTimer) setSkipTimer(parseInt(savedTimer));
  }, []);

  useEffect(() => {
    localStorage.setItem("dialpad_contacts", JSON.stringify(contacts));
    localStorage.setItem("dialpad_current_index", currentContactIndex.toString());
    localStorage.setItem("dialpad_agent_mode", agentMode);
    localStorage.setItem("dialpad_bypass_vapi", bypassVapi.toString());
    localStorage.setItem("dialpad_skip_timer", skipTimer.toString());
  }, [contacts, currentContactIndex, agentMode, bypassVapi, skipTimer]);

  // --- Effects ---

  // Initialize Vapi
  useEffect(() => {
    if (!vapiPublicKey) {
      addLog("Warning: NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set.");
      return;
    }
    const vapiInstance = new Vapi(vapiPublicKey);
    setVapi(vapiInstance);
  }, []);

  // Scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Vapi Event Listeners
  useEffect(() => {
    if (!vapi) return;

    const onCallStart = () => {
      addLog("Vapi: Call started");
      setCallStatus("active");
      setIsAlerting(true);
      playAlertSound();
      
      // Stop alerting after 5 seconds
      setTimeout(() => setIsAlerting(false), 5000);
    };

    const onCallEnd = (report: any) => {
      addLog("Vapi: Call ended");
      setCallStatus("ended");
      setCallReport(report); // Store report to show summary
      
      // Auto-advance if running
      if (campaignState === "running") {
        setTimeout(() => {
          handleNextContact();
        }, 2000);
      }
    };

    const onError = (error: any) => {
      addLog(`Vapi Error: ${JSON.stringify(error)}`);
    };

    vapi.on("call-start", onCallStart);
    vapi.on("call-end", onCallEnd as any);
    vapi.on("error", onError);

    return () => {
      vapi.off("call-start", onCallStart);
      vapi.off("call-end", onCallEnd as any);
      vapi.off("error", onError);
    };

  }, [vapi, campaignState]); // Check dependencies carefully


  // Listen for messages from Extension (via Bridge)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "DIALPAD_CALL_CONNECTED") {
        addLog("Received CALL_CONNECTED from Extension");
        
        setIsAlerting(true);
        playAlertSound();
        setCallStatus("active");

        if (!bypassVapi) {
          startVapiSession(event.data.payload);
        } else {
          addLog("Vapi Bypassed. Waiting for human interaction.");
        }
      } else if (event.data.type === "DIALPAD_CALL_FAILED") {
        addLog(`Call Failed: ${event.data.payload?.reason || "Unknown reason"}`);
        setCallStatus("ended");
        if (campaignState === "running") {
          setTimeout(() => handleNextContact(), 2000);
        }
      } else if (event.data.type === "DIALPAD_CALL_DISCONNECTED") {
        addLog("Call disconnected via Dialpad");
        setCallStatus("ended");
        setIsAlerting(false);
        if (campaignState === "running") {
          addLog("Advancing to next contact...");
          setTimeout(() => handleNextContact(), 2000);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [conferenceInfo, dynamicPrompt, campaignState, currentContactIndex, bypassVapi]);

  // --- Handlers ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    
    setIsProcessing(true);
    addLog("Processing screenshot...");
    
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const result = await processScreenshot(formData);
      setContacts(result);
      addLog(`Extracted ${result.length} contacts.`);
    } catch (error: any) {
      addLog(`Error processing file: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartCampaign = () => {
    if (contacts.length === 0) {
      alert("No contacts to call.");
      return;
    }
    if (!extensionId) {
      alert("Extension ID is required.");
      return;
    }
    setCampaignState("running");
    processCurrentContact();
  };

  const handleSkip = () => {
    addLog("Skipping current contact. Closing call...");
    sendToExtension("HANGUP_CALL", {});
    setCallStatus("ended");
    setIsAlerting(false);
    
    // Start countdown for email
    setCountdown(skipTimer);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      handleNextContact();
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const processCurrentContact = () => {
    const contact = contacts[currentContactIndex];
    if (!contact) {
      addLog("Campaign Finished.");
      setCampaignState("idle");
      return;
    }

    if ((contact as any).skip) {
      addLog(`Skipping ${contact.name} (flagged as government line).`);
      handleNextContact();
      return;
    }

    const targetPhone = (contact as any).mobile || contact.phone;
    if (!targetPhone) {
      addLog(`No valid phone found for ${contact.name}. Skipping.`);
      handleNextContact();
      return;
    }

    addLog(`Initiating call for: ${contact.name} (${targetPhone})`);
    
    sendToExtension("START_CAMPAIGN_CALL", {
      phone: targetPhone,
      conferenceInfo,
      dynamicPrompt
    });
  };

  const handleNextContact = () => {
    if (currentContactIndex < contacts.length - 1) {
      setCurrentContactIndex(prev => prev + 1);
      // If we are still running, process next
      if (campaignState === "running") {
         // Tiny delay
         setTimeout(() => processCurrentContact(), 1000);
      }
    } else {
      setCampaignState("idle");
      addLog("All contacts processed.");
    }
  };

  const handlePause = () => {
    setCampaignState("paused");
    addLog("Campaign Paused.");
  };

  const handleResume = () => {
    setCampaignState("running");
    addLog("Campaign Resumed.");
    processCurrentContact(); // Retry current or move next? Usually retry current if it wasn't finished.
  };

  const handleStop = () => {
    setCampaignState("idle");
    setCurrentContactIndex(0);
    vapi?.stop();
    addLog("Campaign Stopped.");
  };

  const startVapiSession = async (payload: { conferenceInfo: string, dynamicPrompt: string }) => {
    if (!vapi) {
      addLog("Error: Vapi not initialized.");
      return;
    }
    addLog(`Starting Vapi Session (${agentMode} mode)...`);
    
    let systemPrompt = "";
    let firstMessage = "";

    if (agentMode === "human_only") {
      systemPrompt = "You are a brief assistant. Your only job is to tell the person to wait one second while you connect them to a representative. Do not engage in long conversation.";
      firstMessage = "Hello, please stay on the line for one moment while I connect you...";
    } else if (agentMode === "voicemail") {
      systemPrompt = "You are an automated assistant. If you detect you are speaking to a voicemail or answering machine, leave a message about our upcoming conference. If a human answers, ask them if you can send them an email and then end the call.";
      firstMessage = "Hello, I'm calling from Public Sector Network regarding our upcoming event.";
    } else {
      systemPrompt = `
        You are an AI assistant for Public Sector Network. Your role is to call public sector professionals to invite them to our upcoming conferences. 
        Your tone should be professional, polite, and articulate. 
        You need to gather interest and, if positive, offer to send an email with more information. 
        Adapt your pitch using the provided conference details and any specific instructions given. 
        Handle objections gracefully. Speak naturally in English.
        
        --- CONFERENCE DETAILS ---
        ${payload.conferenceInfo}
        
        --- SPECIFIC INSTRUCTIONS ---
        ${payload.dynamicPrompt}
      `;
      firstMessage = "Hello, am I speaking with " + (contacts[currentContactIndex]?.name || "the relevant contact") + "?";
    }

    try {
      // Use messages for system prompt to avoid type errors with OpenAIModel
      await vapi.start({
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt }
          ]
        },
        voice: {
          provider: "11labs", 
          voiceId: "cjVigVc5kqxnPczPaOcf", 
        },
        firstMessage: firstMessage,
      });
    } catch (e: any) {
      addLog(`Failed to start Vapi: ${e.message}`);
    }
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Col: Setup & Controls */}
        <div className="lg:col-span-1 space-y-6">
          <header className="mb-8">
            <h1 className="text-2xl font-bold text-blue-800">Dialpad AI Agent</h1>
            <p className="text-sm text-gray-500">Public Sector Network Invitation System</p>
          </header>

          {/* Config */}
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <CheckCircle size={18} /> Configuration
            </h2>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Extension ID</label>
              <input 
                type="text" 
                value={extensionId} 
                onChange={e => setExtensionId(e.target.value)}
                placeholder="e.g. abcdefghijklmnop..." 
                className="w-full p-2 border rounded-md text-sm font-mono bg-gray-50"
              />
              <p className="text-[10px] text-gray-400 mt-1">Find this in chrome://extensions</p>
            </div>
          </section>

          {/* Screenshot Upload */}
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Upload size={18} /> Load Contacts
            </h2>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition">
              <input 
                type="file" 
                onChange={handleFileUpload} 
                className="hidden" 
                id="file-upload" 
                accept="image/*"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                 {isProcessing ? <Loader2 className="animate-spin text-blue-600" /> : <Upload className="text-gray-400" />}
                 <span className="text-sm text-blue-600 font-medium">Click to upload HubSpot Screenshot</span>
              </label>
            </div>
          </section>

          {/* Context Inputs */}
          <section className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
            <h2 className="font-semibold text-gray-700">Campaign Context</h2>
            
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Agent Mode</label>
              <div className="grid grid-cols-3 gap-2">
                {(["assistant", "voicemail", "human_only"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setAgentMode(mode)}
                    disabled={bypassVapi}
                    className={clsx(
                      "text-[10px] py-2 px-1 rounded border capitalize transition",
                      agentMode === mode ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100",
                      bypassVapi && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {mode.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="space-y-0.5">
                <label className="text-sm font-semibold text-blue-900">Bypass Vapi (Manual Mode)</label>
                <p className="text-[10px] text-blue-600">The agent will not talk. Only alerts when connected.</p>
              </div>
              <button 
                onClick={() => setBypassVapi(!bypassVapi)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                  bypassVapi ? "bg-blue-600" : "bg-gray-200"
                )}
              >
                <span className={clsx(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  bypassVapi ? "translate-x-6" : "translate-x-1"
                )} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-500">Wait time after Skip (seconds)</label>
              <input 
                type="number" 
                value={skipTimer}
                onChange={e => setSkipTimer(parseInt(e.target.value))}
                className="w-full p-2 border rounded-md text-sm bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Conference Info / URL</label>
              <textarea 
                className="w-full p-2 border rounded-md text-sm min-h-[80px]"
                placeholder="Paste conference details here..."
                value={conferenceInfo}
                onChange={e => setConferenceInfo(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Dynamic Prompting</label>
              <textarea 
                className="w-full p-2 border rounded-md text-sm min-h-[80px]"
                placeholder="Instructions for Vapi (e.g. Focus on cybersecurity...)"
                value={dynamicPrompt}
                onChange={e => setDynamicPrompt(e.target.value)}
              />
            </div>
          </section>
        </div>

        {/* Middle Col: Contacts & Status */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Controls */}
          <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200 sticky top-4 z-10">
            {campaignState === "idle" && (
              <button 
                onClick={handleStartCampaign}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full font-medium transition"
              >
                <Play size={18} fill="currentColor" /> Start Campaign
              </button>
            )}
            
            {campaignState === "running" && (
              <button 
                onClick={handlePause}
                className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-2 rounded-full font-medium transition"
              >
                <Pause size={18} fill="currentColor" /> Pause
              </button>
            )}

            {campaignState === "paused" && (
              <button 
                onClick={handleResume}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-full font-medium transition"
              >
                <Play size={18} fill="currentColor" /> Resume
              </button>
            )}

            <button 
              onClick={handleStop}
              className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-full font-medium transition ml-auto"
            >
              <Square size={16} fill="currentColor" /> Stop
            </button>
          </div>

          {/* Visual Alert */}
          {isAlerting && (
            <div className="bg-red-600 text-white p-6 rounded-xl shadow-lg flex items-center justify-between animate-bounce">
              <div className="flex items-center gap-4">
                <AlertCircle size={32} />
                <div>
                  <h3 className="text-xl font-bold">HUMAN ANSWERED!</h3>
                  <p className="text-sm opacity-90">Switch to Dialpad now to take over if needed.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleSkip}
                  className="bg-yellow-400 text-black px-6 py-2 rounded-full text-sm font-bold hover:bg-yellow-500"
                >
                  SKIP & EMAIL
                </button>
                <button 
                  onClick={() => setIsAlerting(false)}
                  className="bg-white text-red-600 px-4 py-1 rounded-full text-sm font-bold"
                >
                  DISMISS
                </button>
              </div>
            </div>
          )}

          {/* Countdown for Skip */}
          {countdown !== null && (
            <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-xl flex flex-col items-center gap-2">
              <span className="text-yellow-800 font-bold text-lg text-center">
                MANUAL STEP: Send email to {(contacts[currentContactIndex] as any)?.email || "contact"}
              </span>
              <div className="text-3xl font-black text-yellow-600">Next call in: {countdown}s</div>
              <button 
                onClick={() => setCountdown(0)}
                className="text-xs text-yellow-600 underline"
              >
                Skip waiting
              </button>
            </div>
          )}

          {/* Current Call Status */}
          {callStatus === "active" && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-600 rounded-full animate-ping" />
                <span className="text-blue-800 font-semibold">Call in Progress...</span>
              </div>
              <span className="text-sm text-blue-600">Listening via Vapi</span>
            </div>
          )}

          {/* Last Call Report */}
          {callReport && (
            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
              <h3 className="font-semibold text-gray-700 mb-2">Last Call Report</h3>
              <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-40">
                {JSON.stringify(callReport, null, 2)}
              </pre>
            </div>
          )}

          {/* Contact List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="font-semibold text-gray-700">Campaign List ({contacts.length})</h2>
              <span className="text-xs text-gray-400">Next: #{currentContactIndex + 1}</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Name</th>
                    <th className="p-3 font-medium">Mobile</th>
                    <th className="p-3 font-medium">Phone</th>
                    <th className="p-3 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map((contact, idx) => (
                    <tr key={idx} className={clsx(
                      idx === currentContactIndex ? "bg-blue-50" : "hover:bg-gray-50",
                      (contact as any).skip && "opacity-40 grayscale",
                      "transition"
                    )}>
                      <td className="p-3">
                        {idx < currentContactIndex && <CheckCircle size={16} className="text-green-500" />}
                        {idx === currentContactIndex && campaignState === "running" && <Loader2 size={16} className="animate-spin text-blue-500" />}
                        {idx === currentContactIndex && campaignState !== "running" && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                        {idx > currentContactIndex && <div className="w-2 h-2 rounded-full bg-gray-300" />}
                        {(contact as any).skip && <span className="text-[10px] text-red-500 font-bold ml-1">GOV LINE</span>}
                      </td>
                      <td className="p-3 font-medium">{contact.name}</td>
                      <td className="p-3 text-gray-600 font-mono">{(contact as any).mobile || "-"}</td>
                      <td className="p-3 text-gray-600 font-mono">{(contact as any).phone || "-"}</td>
                      <td className="p-3 text-gray-500">{(contact as any).email || "-"}</td>
                    </tr>
                  ))}
                  {contacts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-gray-400 italic">
                        No contacts loaded. Upload a screenshot to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* System Logs */}
          <div className="bg-black text-green-400 p-4 rounded-xl font-mono text-xs h-48 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="mb-1">{log}</div>
            ))}
            <div ref={logsEndRef} />
          </div>

        </div>
      </div>
    </div>
  );
}