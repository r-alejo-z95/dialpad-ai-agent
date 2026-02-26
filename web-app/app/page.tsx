"use client";

import { useState, useEffect, useRef } from "react";
import { processScreenshot } from "./actions/process-screenshot";
import {
  createCampaign, getCampaigns, getCampaignWithContacts, updateCampaignIndex,
  updateContact, addContactsToCampaign, deleteCampaign, deleteContact,
  createContact, updateCampaign
} from "./actions/campaign";
import {
  Upload, Phone, Play, Square, Loader2, CheckCircle,
  Edit2, Save, X, Trash2, PhoneCall,
  MessageSquare, User, Smartphone, Globe, Clock, FastForward,
  Plus, Database, ChevronDown, FolderOpen
} from "lucide-react";
import clsx from "clsx";

const EXTENSION_ID = "eokbnkldempadajedgbphfmgfocnjfpl";

type Campaign = { id: string; name: string; conferenceInfo?: string | null; dynamicPrompt?: string | null; lastIndex: number; _count?: { contacts: number } };

export default function Dashboard() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [callStatus, setCallStatus] = useState<"idle" | "active">("idle");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});

  // DB Panel state
  const [showDbPanel, setShowDbPanel] = useState(false);
  const [dbTab, setDbTab] = useState<"campaigns" | "contacts">("campaigns");
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ name: "", conferenceInfo: "", dynamicPrompt: "" });
  const [newContact, setNewContact] = useState({ name: "", email: "", mobile: "", phone: "" });
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [editCampaignValues, setEditCampaignValues] = useState<any>({});
  const [confirmDelete, setConfirmDelete] = useState<{ type: "campaign" | "contact"; id: string; name: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const contactsRef = useRef(contacts);
  const activeContactIdRef = useRef<string | null>(null);
  const lastProcessedContactId = useRef<string | null>(null);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  // --- Initialization ---

  useEffect(() => {
    const handleExtensionMessage = (event: MessageEvent) => {
      if (event.data.type === "DIALPAD_CALL_CONNECTED") {
        addLog("Dialpad: Call connected");
        setCallStatus("active");
      } else if (event.data.type === "DIALPAD_CALL_DISCONNECTED") {
        addLog("Dialpad: Call ended");
        setCallStatus("idle");
        if (activeContactIdRef.current) {
          handlePostCall(activeContactIdRef.current);
        }
      }
    };

    window.addEventListener("message", handleExtensionMessage);

    const hydrate = async () => {
      const result = await getCampaigns();
      if (result.success && (result.campaigns?.length ?? 0) > 0) {
        setCampaigns(result.campaigns as Campaign[]);
        const first = result.campaigns![0];
        const detailed = await getCampaignWithContacts(first.id);
        if (detailed.success && detailed.campaign) {
          setActiveCampaign(first as Campaign);
          setContacts(detailed.campaign.contacts);
          setCurrentIndex(detailed.campaign.lastIndex || 0);
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
      const parts = currentStatus.split(" ");
      const num = parseInt(parts[parts.length - 1]);
      return isNaN(num) ? currentStatus : `call ${num + 1}`;
    }
    return currentStatus;
  };

  const handlePostCall = async (contactId: string) => {
    if (lastProcessedContactId.current === contactId) return;

    const contact = contactsRef.current.find(c => c.id === contactId);
    if (contact) {
      const newStatus = getNextStatus(contact.status);
      const now = new Date();

      lastProcessedContactId.current = contactId;
      addLog(`Sincronizando: ${contact.name} -> ${newStatus}`);

      setContacts(prev => prev.map(c =>
        c.id === contactId ? { ...c, status: newStatus, lastCalledAt: now.toISOString() } : c
      ));

      const res = await updateContact(contactId, {
        status: newStatus,
        lastCalledAt: now
      });

      if (res.success) addLog(`DB OK: ${contact.name} guardado.`);

      const finishedIdx = contactsRef.current.findIndex(c => c.id === contactId);
      if (finishedIdx === currentIndexRef.current) {
        jumpToContact(finishedIdx + 1);
      }
    }
  };

  const jumpToContact = async (idx: number) => {
    if (idx < 0 || idx >= contactsRef.current.length) return;
    setCurrentIndex(idx);
    const campaignId = (contactsRef.current[0] as any)?.campaignId;
    if (campaignId) {
      await updateCampaignIndex(campaignId, idx);
    }
  };

  const handleManualCall = async (idx: number, phone: string) => {
    const contact = contacts[idx];
    if (!contact) return;

    openHubSpotSearch(contact);

    if (callStatus === "active" && activeContactIdRef.current) {
      addLog("Cerrando sesión anterior...");
      await handlePostCall(activeContactIdRef.current);
      (window as any).chrome.runtime.sendMessage(EXTENSION_ID, { type: "HANGUP_CALL" });
    }

    activeContactIdRef.current = contact.id;
    lastProcessedContactId.current = null;
    await jumpToContact(idx);

    addLog(`Llamando a ${contact.name} (${phone})...`);
    setTimeout(() => {
      (window as any).chrome.runtime.sendMessage(EXTENSION_ID, {
        type: "START_CAMPAIGN_CALL",
        payload: { phone, conferenceInfo: "", dynamicPrompt: "" }
      });
    }, 6000);
  };

  const handleNext = async () => {
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
    if (activeContactIdRef.current) {
      handlePostCall(activeContactIdRef.current);
    }
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditValues({ ...c });
  };

  const saveEdit = async () => {
    if (!editingId) return;

    addLog(`Guardando cambios para ${editValues.name}...`);

    setContacts(prev => prev.map(c => c.id === editingId ? { ...c, ...editValues } : c));

    const res = await updateContact(editingId, editValues);
    if (res.success) {
      setEditingId(null);
      addLog(`Manual OK: ${editValues.name} actualizado.`);

      if (editValues.status === "invalid" || editValues.status === "wrong_person") {
        const currentIdx = contacts.findIndex(c => c.id === editingId);
        if (currentIdx === currentIndex) {
          addLog("Avance automático.");
          jumpToContact(currentIdx + 1);
        }
      }
    } else {
      addLog(`Error al guardar: ${res.error}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setIsProcessing(true);
    addLog("Extrayendo contactos...");
    const formData = new FormData();
    formData.append("file", e.target.files[0]);

    try {
      const result = await processScreenshot(formData);
      const currentId = activeCampaign?.id || (contacts[0] as any)?.campaignId;
      if (currentId) {
        const dbRes = await addContactsToCampaign(currentId, result);
        if (dbRes.success && dbRes.contacts) setContacts(dbRes.contacts);
      } else {
        const dbRes = await createCampaign(`Campaign ${new Date().toLocaleString()}`, "", "", result);
        if (dbRes.success && dbRes.campaign?.contacts) {
          setContacts(dbRes.campaign.contacts);
          setActiveCampaign(dbRes.campaign as any);
          refreshCampaigns();
        }
      }
      addLog(`Éxito: ${result.length} contactos cargados.`);
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Campaign switching ---

  const switchCampaign = async (campaign: Campaign) => {
    const detailed = await getCampaignWithContacts(campaign.id);
    if (detailed.success && detailed.campaign) {
      setActiveCampaign(campaign);
      setContacts(detailed.campaign.contacts);
      setCurrentIndex(detailed.campaign.lastIndex || 0);
      addLog(`Campaña cargada: ${campaign.name}`);
    }
  };

  const refreshCampaigns = async () => {
    const result = await getCampaigns();
    if (result.success) setCampaigns(result.campaigns as Campaign[]);
  };

  // --- DB Panel: Campaign CRUD ---

  const handleCreateCampaign = async () => {
    if (!newCampaign.name.trim()) return;
    setIsSaving(true);
    const res = await createCampaign(newCampaign.name, newCampaign.conferenceInfo, newCampaign.dynamicPrompt, []);
    if (res.success) {
      addLog(`Campaña creada: ${newCampaign.name}`);
      setNewCampaign({ name: "", conferenceInfo: "", dynamicPrompt: "" });
      setShowCampaignForm(false);
      await refreshCampaigns();
    }
    setIsSaving(false);
  };

  const handleSaveCampaign = async () => {
    if (!editingCampaignId) return;
    setIsSaving(true);
    const res = await updateCampaign(editingCampaignId, editCampaignValues);
    if (res.success) {
      addLog(`Campaña actualizada.`);
      setCampaigns(prev => prev.map(c => c.id === editingCampaignId ? { ...c, ...editCampaignValues } : c));
      if (activeCampaign?.id === editingCampaignId) {
        setActiveCampaign(prev => prev ? { ...prev, ...editCampaignValues } : prev);
      }
      setEditingCampaignId(null);
    }
    setIsSaving(false);
  };

  const handleDeleteCampaign = async (id: string) => {
    setIsSaving(true);
    const res = await deleteCampaign(id);
    if (res.success) {
      addLog(`Campaña eliminada.`);
      const remaining = campaigns.filter(c => c.id !== id);
      setCampaigns(remaining);
      if (activeCampaign?.id === id) {
        if (remaining.length > 0) {
          switchCampaign(remaining[0]);
        } else {
          setActiveCampaign(null);
          setContacts([]);
        }
      }
    }
    setConfirmDelete(null);
    setIsSaving(false);
  };

  // --- DB Panel: Contact CRUD ---

  const handleCreateContact = async () => {
    if (!newContact.name.trim() || !activeCampaign) return;
    setIsSaving(true);
    const res = await createContact(activeCampaign.id, newContact);
    if (res.success && res.contact) {
      setContacts(prev => [...prev, res.contact]);
      addLog(`Contacto creado: ${newContact.name}`);
      setNewContact({ name: "", email: "", mobile: "", phone: "" });
      setShowContactForm(false);
    }
    setIsSaving(false);
  };

  const handleDeleteContact = async (id: string) => {
    setIsSaving(true);
    const res = await deleteContact(id);
    if (res.success) {
      setContacts(prev => prev.filter(c => c.id !== id));
      addLog(`Contacto eliminado.`);
    }
    setConfirmDelete(null);
    setIsSaving(false);
  };

  const currentContact = contacts[currentIndex];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full mx-4 space-y-5">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="text-red-500" size={22} />
            </div>
            <div className="text-center">
              <h3 className="font-black text-slate-800 text-lg">Confirmar eliminación</h3>
              <p className="text-sm text-slate-500 mt-1">
                ¿Eliminar <span className="font-bold text-slate-700">{confirmDelete.name}</span>?
                {confirmDelete.type === "campaign" && <span className="block text-red-500 text-xs mt-1 font-bold">Esto eliminará todos los contactos de la campaña.</span>}
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-all">Cancelar</button>
              <button
                onClick={() => confirmDelete.type === "campaign" ? handleDeleteCampaign(confirmDelete.id) : handleDeleteContact(confirmDelete.id)}
                disabled={isSaving}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DB Panel Modal */}
      {showDbPanel && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
            {/* Panel Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                  <Database size={16} />
                </div>
                <h2 className="font-black text-slate-800 text-lg">Gestión de Base de Datos</h2>
              </div>
              <button onClick={() => setShowDbPanel(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => setDbTab("campaigns")}
                className={clsx("px-6 py-3.5 text-xs font-black uppercase tracking-widest transition-all border-b-2", dbTab === "campaigns" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600")}
              >
                Campañas ({campaigns.length})
              </button>
              <button
                onClick={() => setDbTab("contacts")}
                className={clsx("px-6 py-3.5 text-xs font-black uppercase tracking-widest transition-all border-b-2", dbTab === "contacts" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600")}
              >
                Contactos {activeCampaign ? `(${contacts.length})` : ""}
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* ---- CAMPAIGNS TAB ---- */}
              {dbTab === "campaigns" && (
                <>
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-slate-500">Crea, edita o elimina campañas.</p>
                    <button
                      onClick={() => setShowCampaignForm(v => !v)}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
                    >
                      <Plus size={14} /> Nueva Campaña
                    </button>
                  </div>

                  {/* Create Campaign Form */}
                  {showCampaignForm && (
                    <div className="bg-indigo-50 rounded-2xl p-5 space-y-3 border border-indigo-100">
                      <h3 className="text-xs font-black text-indigo-700 uppercase tracking-widest">Nueva Campaña</h3>
                      <input
                        className="w-full text-sm p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                        placeholder="Nombre de la campaña *"
                        value={newCampaign.name}
                        onChange={e => setNewCampaign(p => ({ ...p, name: e.target.value }))}
                      />
                      <input
                        className="w-full text-sm p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-400"
                        placeholder="Conference Info (opcional)"
                        value={newCampaign.conferenceInfo}
                        onChange={e => setNewCampaign(p => ({ ...p, conferenceInfo: e.target.value }))}
                      />
                      <textarea
                        className="w-full text-sm p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-400 resize-none"
                        rows={2}
                        placeholder="Dynamic Prompt (opcional)"
                        value={newCampaign.dynamicPrompt}
                        onChange={e => setNewCampaign(p => ({ ...p, dynamicPrompt: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <button onClick={handleCreateCampaign} disabled={isSaving || !newCampaign.name.trim()} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-indigo-700 transition-all">
                          {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Crear
                        </button>
                        <button onClick={() => setShowCampaignForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">Cancelar</button>
                      </div>
                    </div>
                  )}

                  {/* Campaigns List */}
                  <div className="space-y-2">
                    {campaigns.map(c => (
                      <div key={c.id} className={clsx("rounded-2xl border p-4 transition-all", activeCampaign?.id === c.id ? "border-indigo-200 bg-indigo-50/50" : "border-slate-100 bg-white hover:border-slate-200")}>
                        {editingCampaignId === c.id ? (
                          <div className="space-y-2">
                            <input className="w-full text-sm p-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-400" value={editCampaignValues.name ?? ""} onChange={e => setEditCampaignValues((p: any) => ({ ...p, name: e.target.value }))} />
                            <input className="w-full text-xs p-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-400" placeholder="Conference Info" value={editCampaignValues.conferenceInfo ?? ""} onChange={e => setEditCampaignValues((p: any) => ({ ...p, conferenceInfo: e.target.value }))} />
                            <textarea className="w-full text-xs p-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-400 resize-none" rows={2} placeholder="Dynamic Prompt" value={editCampaignValues.dynamicPrompt ?? ""} onChange={e => setEditCampaignValues((p: any) => ({ ...p, dynamicPrompt: e.target.value }))} />
                            <div className="flex gap-2">
                              <button onClick={handleSaveCampaign} disabled={isSaving} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold disabled:opacity-50 hover:bg-indigo-700">
                                {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />} Guardar
                              </button>
                              <button onClick={() => setEditingCampaignId(null)} className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-500">Cancelar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                <FolderOpen size={14} className="text-slate-400" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-sm text-slate-800 truncate">{c.name}</p>
                                  {activeCampaign?.id === c.id && <span className="text-[9px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full flex-shrink-0">ACTIVA</span>}
                                </div>
                                <p className="text-[10px] text-slate-400">{c._count?.contacts ?? "?"} contactos</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                              {activeCampaign?.id !== c.id && (
                                <button onClick={() => { switchCampaign(c); setShowDbPanel(false); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Cargar campaña">
                                  <Play size={14} />
                                </button>
                              )}
                              <button onClick={() => { setEditingCampaignId(c.id); setEditCampaignValues({ name: c.name, conferenceInfo: c.conferenceInfo ?? "", dynamicPrompt: c.dynamicPrompt ?? "" }); }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={() => setConfirmDelete({ type: "campaign", id: c.id, name: c.name })} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Eliminar">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {campaigns.length === 0 && (
                      <div className="py-12 text-center text-slate-400">
                        <FolderOpen size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-xs font-bold">No hay campañas</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ---- CONTACTS TAB ---- */}
              {dbTab === "contacts" && (
                <>
                  {!activeCampaign ? (
                    <div className="py-12 text-center text-slate-400">
                      <User size={32} className="mx-auto mb-2 opacity-30" />
                      <p className="text-xs font-bold">Selecciona una campaña primero</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-slate-500">Campaña: <span className="font-bold text-slate-700">{activeCampaign.name}</span></p>
                        <button
                          onClick={() => setShowContactForm(v => !v)}
                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all"
                        >
                          <Plus size={14} /> Nuevo Contacto
                        </button>
                      </div>

                      {/* Create Contact Form */}
                      {showContactForm && (
                        <div className="bg-indigo-50 rounded-2xl p-5 space-y-3 border border-indigo-100">
                          <h3 className="text-xs font-black text-indigo-700 uppercase tracking-widest">Nuevo Contacto</h3>
                          <input className="w-full text-sm p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-400" placeholder="Nombre *" value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} />
                          <input className="w-full text-sm p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-400" placeholder="Email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} />
                          <div className="grid grid-cols-2 gap-2">
                            <input className="text-sm p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-400" placeholder="Móvil" value={newContact.mobile} onChange={e => setNewContact(p => ({ ...p, mobile: e.target.value }))} />
                            <input className="text-sm p-3 border border-slate-200 rounded-xl outline-none focus:border-indigo-400" placeholder="Oficina" value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={handleCreateContact} disabled={isSaving || !newContact.name.trim()} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-indigo-700 transition-all">
                              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Crear
                            </button>
                            <button onClick={() => setShowContactForm(false)} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all">Cancelar</button>
                          </div>
                        </div>
                      )}

                      {/* Contacts Table */}
                      <div className="rounded-2xl border border-slate-100 overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50">
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              <th className="px-4 py-3">Nombre</th>
                              <th className="px-4 py-3">Email</th>
                              <th className="px-4 py-3">Móvil</th>
                              <th className="px-4 py-3">Oficina</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Acción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {contacts.map(c => (
                              <tr key={c.id} className="hover:bg-slate-50 transition-all">
                                <td className="px-4 py-3 text-xs font-bold text-slate-700">{c.name}</td>
                                <td className="px-4 py-3 text-[10px] text-slate-400 truncate max-w-[120px]">{c.email || "—"}</td>
                                <td className="px-4 py-3 text-[10px] font-mono text-slate-500">{c.mobile || "—"}</td>
                                <td className="px-4 py-3 text-[10px] font-mono text-slate-500">{c.phone || "—"}</td>
                                <td className="px-4 py-3">
                                  <span className={clsx("text-[9px] font-black px-2 py-0.5 rounded-md uppercase",
                                    c.status === "pending" ? "bg-slate-100 text-slate-500" :
                                    c.status === "invalid" ? "bg-red-100 text-red-600" :
                                    c.status === "wrong_person" ? "bg-amber-100 text-amber-600" :
                                    "bg-blue-50 text-blue-600")}>{c.status}</span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => setConfirmDelete({ type: "contact", id: c.id, name: c.name })}
                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    title="Eliminar contacto"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {contacts.length === 0 && (
                          <div className="py-10 text-center text-slate-400">
                            <p className="text-xs font-bold">Sin contactos en esta campaña</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-3">
             {/* Campaign selector */}
             {campaigns.length > 0 && (
               <div className="relative group">
                 <button className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 transition-all max-w-[200px]">
                   <FolderOpen size={13} className="text-slate-400 flex-shrink-0" />
                   <span className="truncate">{activeCampaign?.name || "Sin campaña"}</span>
                   <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
                 </button>
                 <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 min-w-[220px] hidden group-hover:block z-50">
                   {campaigns.map(c => (
                     <button key={c.id} onClick={() => switchCampaign(c)} className={clsx("w-full text-left px-4 py-2.5 text-xs font-bold transition-all hover:bg-slate-50 flex items-center justify-between gap-2", activeCampaign?.id === c.id ? "text-indigo-600" : "text-slate-700")}>
                       <span className="truncate">{c.name}</span>
                       <span className="text-[9px] font-black text-slate-400 flex-shrink-0">{c._count?.contacts}</span>
                     </button>
                   ))}
                 </div>
               </div>
             )}
             <div className={clsx(
               "px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 transition-all border",
               callStatus === "active" ? "bg-red-50 text-red-600 border-red-100 animate-pulse" : "bg-emerald-50 text-emerald-600 border-emerald-100"
             )}>
               <div className={clsx("w-2 h-2 rounded-full", callStatus === "active" ? "bg-red-600" : "bg-emerald-600")} />
               {callStatus === "active" ? "EN LLAMADA" : "SISTEMA LISTO"}
             </div>
             <button onClick={() => setShowDbPanel(true)} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-bold transition-all" title="Gestión de DB">
               <Database size={14} />
               <span className="hidden sm:inline">DB</span>
             </button>
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
                <div className="flex justify-between items-start" onDoubleClick={() => startEdit(currentContact)}>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight cursor-text">{currentContact.name}</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1 cursor-text">{currentContact.email || "Sin email"}</p>
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

          <div className="bg-slate-900 rounded-3xl p-5 shadow-2xl overflow-hidden">
            <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <MessageSquare size={14} /> Feed del Sistema
            </h2>
            <div className="font-mono text-[10px] text-indigo-300 h-60 overflow-y-auto custom-scrollbar space-y-1">
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
                {activeCampaign && <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-xl text-[10px] font-bold truncate max-w-[150px]">{activeCampaign.name}</span>}
              </div>
              <button onClick={() => jumpToContact(0)} className="text-[10px] font-black text-slate-400 hover:text-red-500 transition-all uppercase tracking-widest">Reiniciar Progreso</button>
            </div>

            <div className="overflow-y-auto max-h-[calc(100vh-250px)] custom-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
                  <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-4 text-center">Progreso</th>
                    <th className="px-4 py-4">Estado</th>
                    <th className="px-4 py-4">Contacto</th>
                    <th className="px-4 py-4">Última Llamada</th>
                    <th className="px-4 py-4 text-center">Llamar</th>
                    <th className="px-8 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {contacts.map((c, idx) => (
                    <tr key={c.id} className={clsx(
                      "group transition-all",
                      idx === currentIndex ? "bg-indigo-50/30" : "hover:bg-slate-50/50",
                      c.skip && "opacity-30 grayscale"
                    )} onDoubleClick={() => startEdit(c)}>
                      <td className="px-8 py-5">
                        <div className="flex items-center justify-center">
                          {idx < currentIndex ? <CheckCircle size={20} className="text-emerald-500" /> :
                           idx === currentIndex ? <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center animate-pulse shadow-lg shadow-indigo-200"><Play size={10} className="text-white ml-0.5" fill="currentColor" /></div> :
                           <span className="text-xs font-black text-slate-300">{idx + 1}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-5">
                        {editingId === c.id ? (
                          <select className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black outline-none shadow-sm" value={editValues.status} onChange={e => setEditValues({...editValues, status: e.target.value})}>
                            <option value="pending">PENDING</option>
                            {[...Array(30)].map((_, i) => (
                              <option key={i} value={`call ${i + 1}`}>CALL {i + 1}</option>
                            ))}
                            <option value="invalid">INVALID</option>
                            <option value="wrong_person">WRONG PERSON</option>
                          </select>
                        ) : <span className={clsx("text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider",
                          c.status === "pending" ? "bg-slate-100 text-slate-500" :
                          c.status === "invalid" ? "bg-red-100 text-red-600" :
                          c.status === "wrong_person" ? "bg-amber-100 text-amber-600" :
                          "bg-blue-50 text-blue-600 border border-blue-100")}>{c.status === "wrong_person" ? "CONTACTO AJENO" : c.status}</span>}
                      </td>
                      <td className="px-4 py-5">
                        {editingId === c.id ? (
                          <div className="space-y-1">
                            <input className="w-full text-xs font-black p-1.5 border rounded-lg" value={editValues.name ?? ""} onChange={e => setEditValues({...editValues, name: e.target.value})} />
                            <input className="w-full text-[10px] p-1 border rounded-lg opacity-60" value={editValues.email ?? ""} onChange={e => setEditValues({...editValues, email: e.target.value})} />
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm font-black text-slate-700 tracking-tight cursor-text">{c.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 truncate max-w-[150px] cursor-text">{c.email || "Sin email"}</p>
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
                              {c.mobile && <button onClick={(e) => { e.stopPropagation(); handleManualCall(idx, c.mobile); }} className="text-[9px] font-black text-slate-500 hover:text-indigo-600 flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all"><Smartphone size={10} /> {c.mobile}</button>}
                              {c.phone && <button onClick={(e) => { e.stopPropagation(); handleManualCall(idx, c.phone); }} className="text-[9px] font-black text-slate-500 hover:text-indigo-600 flex items-center gap-2 bg-white px-3 py-1 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all"><Phone size={10} /> {c.phone}</button>}
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
                          <div className="flex justify-end gap-1">
                            <button onClick={(e) => { e.stopPropagation(); jumpToContact(idx); }} className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Enfocar"><Play size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDelete({ type: "contact", id: c.id, name: c.name }); }} className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100" title="Eliminar"><Trash2 size={14} /></button>
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
