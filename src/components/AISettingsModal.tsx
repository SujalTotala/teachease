import React, { useState, useEffect } from "react";
import { storage } from "../services/storageService";
import { testGeminiApiKey, AVAILABLE_MODELS } from "../services/geminiService";
import {
  Key,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  X,
  RefreshCw,
  Cpu,
  Zap,
  HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  onKeyUpdated?: (hasKey: boolean) => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  isOpen,
  onClose,
  teacherId,
  onKeyUpdated
}) => {
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [autoFallback, setAutoFallback] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [rememberKey, setRememberKey] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string; modelUsed?: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && teacherId) {
      const existing = storage.getTeacherApiKey(teacherId);
      const model = storage.getTeacherModel(teacherId);
      const fallback = storage.getTeacherAutoFallback(teacherId);
      setApiKey(existing || "");
      setSelectedModel(model || "gemini-2.5-flash");
      setAutoFallback(fallback);
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [isOpen, teacherId]);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    if (!apiKey.trim()) {
      setTestResult({ valid: false, message: "Please enter a Gemini API key to test." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testGeminiApiKey(apiKey.trim(), selectedModel);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ valid: false, message: err.message || "Test failed unexpectedly." });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!apiKey.trim()) {
      storage.clearTeacherApiKey(teacherId);
      storage.setTeacherModel(teacherId, selectedModel, rememberKey);
      storage.setTeacherAutoFallback(teacherId, autoFallback);
      onKeyUpdated?.(false);
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 700);
      return;
    }

    storage.setTeacherApiKey(teacherId, apiKey.trim(), rememberKey);
    storage.setTeacherModel(teacherId, selectedModel, rememberKey);
    storage.setTeacherAutoFallback(teacherId, autoFallback);
    onKeyUpdated?.(true);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 700);
  };

  const handleClear = () => {
    storage.clearTeacherApiKey(teacherId);
    setApiKey("");
    setTestResult(null);
    onKeyUpdated?.(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-xl glass-card p-6 md:p-8 border border-white/10 relative overflow-hidden bg-[#12151f] shadow-2xl rounded-2xl max-h-[90vh] flex flex-col"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5 shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Key size={22} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              AI Settings & Model Selection
              <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                BYOK
              </span>
            </h3>
            <p className="text-xs text-white/50">Configure your Google Gemini API Key and resilient generation models</p>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto space-y-5 pr-1 flex-1 custom-scrollbar">
          {/* Info Banner */}
          <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200/80 leading-relaxed flex items-start gap-3">
            <ShieldCheck size={18} className="text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Privacy & Resilient Architecture: </span>
              Your key is stored securely in your browser. TeachEase includes automatic 502 Bad Gateway recovery with model cascade fallback if Google servers experience high traffic.
            </div>
          </div>

          {/* API Key Input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline"
              >
                Get Free Key from AI Studio <ExternalLink size={12} />
              </a>
            </div>

            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="AIzaSy..."
                className="w-full bg-black/50 border border-white/10 rounded-xl p-3.5 pr-24 text-white font-mono text-sm focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-white/20"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-2 text-white/40 hover:text-white rounded-lg transition-colors"
                  title={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-white/60 pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberKey}
                  onChange={(e) => setRememberKey(e.target.checked)}
                  className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500/40"
                />
                <span>Remember key on this browser</span>
              </label>
              {apiKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-white/40 hover:text-red-400 transition-colors text-[11px]"
                >
                  Clear Key
                </button>
              )}
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
                <Cpu size={14} className="text-indigo-400" />
                Active Generation Model
              </label>
              <span className="text-[10px] text-white/40">Select engine for notes, assignments & PPTs</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {AVAILABLE_MODELS.map((m) => {
                const isSelected = selectedModel === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      setSelectedModel(m.id);
                      setTestResult(null);
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "bg-indigo-600/20 border-indigo-500/70 text-white shadow-lg shadow-indigo-500/10"
                        : "bg-white/5 border-white/10 hover:bg-white/10 text-white/70 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-semibold text-xs text-white">{m.name}</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          m.id === "gemini-2.5-flash"
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            : m.id === "gemini-2.0-flash"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-white/10 text-white/60"
                        }`}
                      >
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed mt-1">{m.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gateway Resiliency Toggle */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Zap size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-white">Gateway Auto-Recovery & Model Cascade</p>
                <p className="text-[11px] text-white/50 leading-tight mt-0.5">
                  Automatically retry and fallback to Gemini 2.0 / 1.5 Flash if Google's server gateway returns 502 Bad Gateway
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={autoFallback}
                onChange={(e) => setAutoFallback(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>

          {/* Validation Result Box */}
          <AnimatePresence>
            {testResult && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={`p-3.5 rounded-xl text-xs flex items-start gap-3 border ${
                  testResult.valid
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                {testResult.valid ? (
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold">{testResult.valid ? "Validation Successful" : "Validation Issue"}</p>
                  <p className="opacity-90 mt-0.5 leading-relaxed">{testResult.message}</p>
                  {!testResult.valid && testResult.message.includes("502") && (
                    <div className="mt-2 pt-2 border-t border-rose-500/20 text-[11px] text-rose-200">
                      <strong>How to solve:</strong> Click on <span className="font-bold underline cursor-pointer" onClick={() => setSelectedModel("gemini-2.0-flash")}>Gemini 2.0 Flash</span> or <span className="font-bold underline cursor-pointer" onClick={() => setSelectedModel("gemini-1.5-flash")}>Gemini 1.5 Flash</span> above and test again.
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/5 mt-4 shrink-0">
          <button
            type="button"
            onClick={handleTestKey}
            disabled={testing || !apiKey.trim()}
            className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-white/80 hover:text-white text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? (
              <>
                <RefreshCw size={14} className="animate-spin text-indigo-400" />
                Testing {selectedModel}...
              </>
            ) : (
              <>
                <Sparkles size={14} className="text-indigo-400" />
                Test API Key
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-white/50 hover:text-white text-xs font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/25 active:scale-95"
            >
              {saveSuccess ? (
                <>
                  <CheckCircle2 size={15} />
                  Saved!
                </>
              ) : (
                "Save AI Settings"
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AISettingsModal;
