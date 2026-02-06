"use client";

import { useState, useEffect, useRef } from "react";
import { processScreenshot } from "./actions/process-screenshot";
import { createCampaign, getCampaigns, getCampaignWithContacts, updateCampaignIndex, updateContact, addContactsToCampaign } from "./actions/campaign";
import { 
  Upload, Phone, Play, Square, Loader2, CheckCircle, 
  AlertCircle, Edit2, Save, X, Trash2, PhoneCall, 
  MessageSquare, User, Mail, Smartphone, Globe, ChevronRight, Clock, FastForward
} from "lucide-react";
import clsx from "clsx";

const EXTENSION_ID = "eokbnkldempadajedgbphfmgfocnjfpl";

export default function Dashboard() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [conferenceInfo, setConferenceInfo] = useState("");
  const [dynamicPrompt, setDynamicPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [callStatus, setCallStatus] = useState<"idle" | "active">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  const logsEndRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const contactsRef = useRef(contacts);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  // --- Initialization ---

  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      // Basic event type check from Bridge/Extension
      if (event.data.type === "DIALPAD_CALL_CONNECTED") {
        addLog("Dialpad: Call connected");
        setCallStatus("active");
      } else if (event.data.type === "DIALPAD_CALL_DISCONNECTED") {
        addLog("Dialpad: Call ended");
        setCallStatus("idle");
        handlePostCall(currentIndexRef.current);
      }
    };

    window.addEventListener("message", handleExtensionMessage);

    const hydrate = async () => {
      const result = await getCampaigns();
      if (result.success && (result.campaigns?.length ?? 0) > 0) {
        const detailed = await getCampaignWithContacts(result.campaigns![0].id);
        if (detailed.success && detailed.campaign) {
          setContacts(detailed.campaign.contacts);
          setCurrentIndex(detailed.campaign.lastIndex || 0);
          setConferenceInfo(detailed.campaign.conferenceInfo || "");
          setDynamicPrompt(detailed.campaign.dynamicPrompt || "");
        }
      }
    };
    hydrate();

    return () => window.removeEventListener("message", handleExtensionMessage);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // --- Core Actions ---

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const openHubSpotSearch = (contact: any) => {
    if (!contact) return;
    const query = `${contact.email || ""}||${contact.name || ""}||${contact.mobile || ""}`;
    const url = `https://app.hubspot.com/search/6832097/search?query=${encodeURIComponent(query)}`;
    window.open(url, "_blank");
  };

  const getNextStatus = (currentStatus: string) => {
    if (currentStatus === "pending") return "call 1";
    if (currentStatus.startsWith("call ")) {
      const num = parseInt(currentStatus.split(" ")[1]);
      return `call ${num + 1}`;
    }
    return currentStatus;
  };

  const handlePostCall = async (idx: number) => {
    const contact = contactsRef.current[idx];
    if (contact?.id) {
      const newStatus = getNextStatus(contact.status);
      const now = new Date();
      
      addLog(`Registro: ${contact.name} (${newStatus})`);
      
      // 1. Update contact status & time
      setContacts(prev => prev.map(c => 
        c.id === contact.id ? { ...c, status: newStatus, lastCalledAt: now.toISOString() } : c
      ));
      
      await updateContact(contact.id, { 
        status: newStatus, 
        lastCalledAt: now 
      });

      // 2. Automatically advance progress to next contact
      const nextIdx = idx + 1;
      if (nextIdx < contactsRef.current.length) {
        addLog(`Progreso: Saltando al siguiente contacto...`);
        jumpToContact(nextIdx);
      } else {
        addLog("Fin de la lista: No hay más contactos.");
      }
    }
  };

  const jumpToContact = async (idx: number) => {
    if (idx < 0 || idx >= contacts.length) return;
    setCurrentIndex(idx);
    const campaignId = (contacts[0] as any)?.campaignId;
    if (campaignId) {
      await updateCampaignIndex(campaignId, idx);
      addLog(`Focus: Contacto #${idx + 1}`);
    }
  };

  const handleManualCall = async (idx: number, phone: string) => {
    const contact = contacts[idx];
    if (contact) openHubSpotSearch(contact);

    if (callStatus === "active") {
      (window as any).chrome.runtime.sendMessage(EXTENSION_ID, { type: "HANGUP_CALL" });
    }

    await jumpToContact(idx);

    addLog(`Llamando a ${contact?.name} (${phone})...`);
    setTimeout(() => {
      (window as any).chrome.runtime.sendMessage(EXTENSION_ID, { 
        type: "START_CAMPAIGN_CALL", 
        payload: { phone, conferenceInfo, dynamicPrompt } 
      });
    }, 6000);
  };

  const handleNext = async () => {
    if (callStatus === "active") {
      addLog("Colgando y pasando al siguiente...");
      (window as any).chrome.runtime.sendMessage(EXTENSION_ID, { type: "HANGUP_CALL" });
      await new Promise(r => setTimeout(r, 1200)); // Wait for hangup to process
    }

    const nextIdx = currentIndex + 1;
    if (nextIdx < contacts.length) {
      const nextContact = contacts[nextIdx];
      const targetPhone = nextContact.mobile || nextContact.phone;
      if (targetPhone) {
        handleManualCall(nextIdx, targetPhone);
      } else {
        addLog(`Siguiente (${nextContact.name}) no tiene número.`);
        jumpToContact(nextIdx);
      }
    } else {
      addLog("Final de la lista alcanzado.");
    }
  };

  const handleHangup = () => {
    (window as any).chrome.runtime.sendMessage(EXTENSION_ID, { type: "HANGUP_CALL" });
    setCallStatus("idle");
    handlePostCall(currentIndex);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsProcessing(true);
    addLog("Procesando captura...");
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const result = await processScreenshot(formData);
      const currentId = (contacts[0] as any)?.campaignId;
      if (currentId) {
        const dbRes = await addContactsToCampaign(currentId, result);
        if (dbRes.success && dbRes.contacts) setContacts(dbRes.contacts);
      } else {
        const dbRes = await createCampaign(`Campaign ${new Date().toLocaleString()}`, conferenceInfo, dynamicPrompt, result);
        if (dbRes.success && dbRes.campaign?.contacts) setContacts(dbRes.campaign.contacts);
      }
      addLog(`Éxito: ${result.length} nuevos contactos.`);
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setContacts(prev => prev.map(c => c.id === editingId ? { ...c, ...editValues } : c));
    const res = await updateContact(editingId, editValues);
    if (res.success) {
      setEditingId(null);
      addLog(`Editado: ${editValues.name}`);
    }
  };

  const currentContact = contacts[currentIndex];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <PhoneCall size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Dialpad AI Agent</h1>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Panel de Control</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className={clsx(
               "px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 transition-all border",
               callStatus === "active" ? "bg-red-50 text-red-600 border-red-100 animate-pulse" : "bg-emerald-50 text-emerald-600 border-emerald-100"
             )}>
               <div className={clsx("w-2 h-2 rounded-full", callStatus === "active" ? "bg-red-600" : "bg-green-600")} />
               {callStatus === "active" ? "EN LLAMADA" : "SISTEMA LISTO"}
             </div>
             <label className="cursor-pointer bg-slate-900 hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xl transition-all">
               <Upload size={14} />
               <span>Cargar HubSpot</span>
               <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
             </label>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-3 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-5">
            {currentContact ? (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">{currentContact.name}</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1">{currentContact.email || "Sin email"}</p>
                  </div>
                  <button onClick={() => openHubSpotSearch(currentContact)} className="p-2.5 bg-orange-50 text-orange-600 rounded-2xl hover:bg-orange-100 transition-all">
                    <Globe size={20} />
                  </button>
                </div>
                
                <div className="flex flex-col gap-3">
                  {callStatus === "active" ? (
                    <>
                      <button onClick={handleHangup} className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-black shadow-lg shadow-red-100 flex items-center justify-center gap-2 transition-all border-b-4 border-red-800 active:border-b-0 active:translate-y-1">
                        <Square size={20} fill="currentColor" /> COLGAR AHORA
                      </button>
                      <button onClick={handleNext} className="w-full bg-slate-800 hover:bg-black text-white py-4 rounded-2xl font-black shadow-lg flex items-center justify-center gap-2 transition-all">
                        COLGAR Y SIGUIENTE <FastForward size={20} />
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => handleManualCall(currentIndex, currentContact.mobile || currentContact.phone)} 
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 transition-all border-b-4 border-indigo-800 active:border-b-0 active:translate-y-1"
                    >
                      <PhoneCall size={20} /> LLAMAR AHORA
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button onClick={() => handleManualCall(currentIndex, currentContact.mobile)} disabled={!currentContact.mobile} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all group">
                    <Smartphone className="text-slate-400 group-hover:text-indigo-600" size={24} />
                    <span className="text-[10px] font-black text-slate-500 uppercase">Móvil</span>
                  </button>
                  <button onClick={() => handleManualCall(currentIndex, currentContact.phone)} disabled={!currentContact.phone} className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:border-indigo-200 hover:bg-white transition-all group">
                    <Phone className="text-slate-400 group-hover:text-indigo-600" size={24} />
                    <span className="text-[10px] font-black text-slate-500 uppercase">Oficina</span>
                  </button>
                </div>
              </>
            ) : <div className="py-10 text-center text-slate-400 font-bold italic">Selecciona un contacto</div>}
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-4 text-xs font-bold">
            <h2 className="text-slate-400 uppercase tracking-widest flex items-center gap-2">Configuración</h2>
            <div className="space-y-3">
              <textarea value={conferenceInfo} onChange={e => setConferenceInfo(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] transition-all" placeholder="Info de la conferencia..." />
              <textarea value={dynamicPrompt} onChange={e => setDynamicPrompt(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="Instrucciones AI..." />
            </div>
          </div>

          <div className="bg-slate-900 rounded-3xl p-5 shadow-2xl overflow-hidden">
            <div className="font-mono text-[10px] text-indigo-300 h-40 overflow-y-auto custom-scrollbar space-y-1">
              {logs.map((log, i) => <div key={i} className="opacity-70 leading-relaxed border-l border-indigo-500/30 pl-2">{log}</div>)}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-9">
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <h2 className="font-black text-slate-800 text-lg tracking-tight">Directorio</h2>
                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-xl text-[10px] font-black">{contacts.length} CONTACTOS</span>
              </div>
              <button onClick={() => jumpToContact(0)} className="text-[10px] font-black text-slate-400 hover:text-red-500 transition-all uppercase tracking-widest">Reiniciar Progreso</button>
            </div>

            <div className="overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-4">Progreso</th>
                    <th className="px-4 py-4">Estado</th>
                    <th className="px-4 py-4">Contacto</th>
                    <th className="px-4 py-4">Última Llamada</th>
                    <th className="px-4 py-4 text-center">Llamar</th>
                    <th className="px-8 py-4 text-right">Editar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {contacts.map((c, idx) => (
                    <tr key={c.id} className={clsx(
                      "group transition-all",
                      idx === currentIndex ? "bg-indigo-50/30" : "hover:bg-slate-50/50",
                      c.skip && "opacity-30 grayscale"
                    )}>
                      <td className="px-8 py-5">
                        {idx < currentIndex ? <CheckCircle size={20} className="text-emerald-500" /> : 
                         idx === currentIndex ? <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-indigo-200"><Play size={10} className="text-white ml-0.5" fill="currentColor" /></div> :
                         <span className="text-xs font-black text-slate-300 pl-1">{idx + 1}</span>}
                      </td>
                      <td className="px-4 py-5">
                        {editingId === c.id ? (
                          <select className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black outline-none shadow-sm" value={editValues.status} onChange={e => setEditValues({...editValues, status: e.target.value})}>
                            <option value="pending">PENDING</option>
                            {[...Array(30)].map((_, i) => (
                              <option key={i} value={`call ${i + 1}`}>CALL {i + 1}</option>
                            ))}
                            <option value="invalid">INVALID</option>
                          </select>
                        ) : <span className={clsx("text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider", 
                          c.status === "pending" ? "bg-slate-100 text-slate-500" : 
                          c.status === "invalid" ? "bg-red-100 text-red-600" :
                          "bg-blue-50 text-blue-600 border border-blue-100")}>{c.status}</span>}
                      </td>
                      <td className="px-4 py-5">
                        {editingId === c.id ? (
                          <div className="space-y-1">
                            <input className="w-full text-xs font-black p-1.5 border rounded-lg" value={editValues.name ?? ""} onChange={e => setEditValues({...editValues, name: e.target.value})} />
                            <input className="w-full text-[10px] p-1 border rounded-lg opacity-60" value={editValues.email ?? ""} onChange={e => setEditValues({...editValues, email: e.target.value})} />
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm font-black text-slate-700 tracking-tight">{c.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 truncate max-w-[150px]">{c.email || "Sin email"}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-5">
                        {c.lastCalledAt ? (
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                            <Clock size={12} className="text-slate-300" />
                            {new Date(c.lastCalledAt).toLocaleString()}
                          </div>
                        ) : <span className="text-[10px] text-slate-300 italic">Nunca</span>}
                      </td>
                      <td className="px-4 py-5">
                        <div className="flex flex-col gap-1.5 items-center">
                          {editingId === c.id ? (
                            <div className="space-y-1">
                              <input className="text-[10px] p-1 border rounded-lg w-28 font-mono" value={editValues.mobile ?? ""} placeholder="Móvil" onChange={e => setEditValues({...editValues, mobile: e.target.value})} />
                              <input className="text-[10px] p-1 border rounded-lg w-28 font-mono" value={editValues.phone ?? ""} placeholder="Oficina" onChange={e => setEditValues({...editValues, phone: e.target.value})} />
                            </div>
                          ) : (
                            <>
                              {c.mobile && <button onClick={() => handleManualCall(idx, c.mobile)} className="text-[9px] font-black text-slate-500 hover:text-indigo-600 flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all"><Smartphone size={10} /> {c.mobile}</button>}
                              {c.phone && <button onClick={() => handleManualCall(idx, c.phone)} className="text-[9px] font-black text-slate-500 hover:text-indigo-600 flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all"><Phone size={10} /> {c.phone}</button>}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {editingId === c.id ? (
                          <div className="flex justify-end gap-2">
                            <button onClick={saveEdit} className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-md transition-all"><Save size={14} /></button>
                            <button onClick={() => setEditingId(null)} className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-200 transition-all"><X size={14} /></button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => jumpToContact(idx)} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Enfocar"><Play size={14} /></button>
                            <button onClick={() => { setEditingId(c.id); setEditValues({...c}); }} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Editar"><Edit2 size={14} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contacts.length === 0 && !isProcessing && (
                <div className="py-24 flex flex-col items-center gap-4 bg-white">
                  <div className="w-20 h-20 bg-slate-50 rounded-[2.5rem] flex items-center justify-center text-slate-200 border-2 border-dashed border-slate-100"><User size={40} /></div>
                  <div className="text-center"><p className="text-slate-400 font-black uppercase tracking-widest text-xs">Sin contactos</p></div>
                </div>
              )}
              {isProcessing && (
                <div className="py-24 flex flex-col items-center gap-4 bg-white">
                  <Loader2 className="animate-spin text-indigo-600" size={40} />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Procesando IA...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E1; }
      `}</style>
    </div>
  );
}