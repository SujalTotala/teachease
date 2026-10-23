import React, { useState, useEffect } from "react";
import { generatePPTContent } from "../services/geminiService";
import { 
  Presentation, 
  Sparkles, 
  Download, 
  Copy, 
  RefreshCw, 
  History, 
  Key, 
  Check, 
  Trash2, 
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
  Zap
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { storage, UserProfile, AIContent } from "../services/storageService";
import { AISettingsModal } from "./AISettingsModal";

interface PPTModuleProps {
  user: UserProfile;
}

export const PPTModule: React.FC<PPTModuleProps> = ({ user }) => {
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [detailLevel, setDetailLevel] = useState("Detailed Academic Lecture");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<AIContent[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<AIContent | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");

  useEffect(() => {
    loadHistory();
  }, [user]);

  const loadHistory = () => {
    const items = storage.getContent("ppt", user.uid);
    setHistoryList(items);
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setApiKeyError("");
    setCopied(false);
    setSelectedHistoryItem(null);

    try {
      const content = await generatePPTContent({
        subject: subject.trim() || "Computer Science",
        topic: topic.trim(),
        slideCount,
        detailLevel,
        teacherId: user.uid
      });

      const output = content || "Failed to generate presentation content.";
      setResult(output);

      // FR-19: Save to storage
      const newContent: AIContent = {
        id: `ppt-${Math.random().toString(36).substr(2, 9)}`,
        type: "ppt",
        teacherId: user.uid,
        subject: subject.trim() || "General",
        topic: topic.trim(),
        slideCount,
        detailLevel,
        content: output,
        createdAt: new Date().toISOString()
      };

      storage.saveContent(newContent);
      loadHistory();
    } catch (err: any) {
      console.error("PPT generation failed:", err);
      const msg = err?.message || String(err);
      if (msg.includes("Gemini API Key") || msg.includes("API key")) {
        setApiKeyError("Your Gemini API Key is missing or invalid. Please configure it in AI Settings (BYOK).");
      } else if (msg.includes("502") || msg.includes("Bad Gateway") || msg.includes("Gateway")) {
        setApiKeyError(
          "Google Gemini Gateway (502 Bad Gateway): Google's model servers are temporarily experiencing high traffic or upstream gateway timeout. You can switch to Gemini 2.0 Flash or retry."
        );
      } else {
        setApiKeyError(`Generation error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchModelAndRetry = (newModel: string) => {
    storage.setTeacherModel(user.uid, newModel);
    setApiKeyError("");
    handleGenerate();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = (content: string, filenameTopic: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SlideDeck_${filenameTopic.replace(/\s+/g, "_")}.md`;
    link.click();
  };

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    storage.deleteContent(id);
    loadHistory();
    if (selectedHistoryItem?.id === id) {
      setSelectedHistoryItem(null);
      setResult("");
    }
  };

  const displayContent = selectedHistoryItem ? selectedHistoryItem.content : result;

  return (
    <div className="space-y-6 h-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-500/20 text-pink-400 flex items-center justify-center border border-pink-500/30">
              <Presentation size={20} />
            </div>
            AI PowerPoint Content Designer
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Generate slide-by-slide lecture presentation content with key points and speaker notes (FR-17 - FR-19)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-bold text-white flex items-center gap-2 transition-all"
          >
            <History size={14} className="text-pink-400" />
            Previous PPTs ({historyList.length})
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/80 hover:text-white flex items-center gap-2 transition-all"
          >
            <Key size={14} className="text-indigo-400" />
            AI Key Settings
          </button>
        </div>
      </div>

      {/* API Key Missing / 502 Gateway Alert Banner */}
      {apiKeyError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-rose-300">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-400" />
            <div>
              <p className="font-semibold text-white">Generation Notice</p>
              <p className="mt-0.5 opacity-90 leading-relaxed">{apiKeyError}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {apiKeyError.includes("502") || apiKeyError.includes("Gateway") ? (
              <>
                <button
                  onClick={() => handleSwitchModelAndRetry("gemini-2.0-flash")}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Switch to Gemini 2.0 Flash and retry immediately"
                >
                  <Zap size={13} />
                  Switch to 2.0 Flash & Retry
                </button>
                <button
                  onClick={handleGenerate}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              </>
            ) : null}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs shrink-0 transition-colors"
            >
              AI Settings
            </button>
          </div>
        </div>
      )}

      {/* History Drawer */}
      {showHistory && (
        <div className="glass-card p-6 border-pink-500/30">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <History size={16} className="text-pink-400" />
              Saved Slide Decks History (FR-19)
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="text-white/40 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          {historyList.length === 0 ? (
            <p className="text-xs text-white/40 py-4 text-center">No slide decks saved yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
              {historyList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedHistoryItem(item);
                    setSubject(item.subject);
                    setTopic(item.topic);
                  }}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                    selectedHistoryItem?.id === item.id
                      ? "bg-pink-500/20 border-pink-500/50 text-white"
                      : "bg-white/5 border-white/10 hover:bg-white/10 text-white/80"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-pink-400 truncate">
                        {item.subject}
                      </span>
                      <button
                        onClick={(e) => handleDeleteHistory(item.id, e)}
                        className="text-white/30 hover:text-rose-400 transition-colors p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="text-xs font-semibold line-clamp-2 text-white">{item.topic}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
                    <span>{item.slideCount || 6} Slides</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Parameters + Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Parameters Panel */}
        <div className="space-y-6">
          <div className="glass-card p-8">
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2 text-white">
              <Layers size={18} className="text-pink-400" />
              Presentation Parameters (FR-17)
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 block">
                  Subject / Domain
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cloud Computing, Artificial Intelligence"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full p-3.5 bg-white/5 rounded-xl border border-white/10 text-white text-sm focus:ring-1 focus:ring-pink-500/40 focus:outline-none transition-all placeholder:text-white/20"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 block">
                  Lecture / Presentation Topic *
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Microservices vs Monolithic Architecture: Scalability, Communication and Deployment"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full p-3.5 bg-white/5 rounded-xl border border-white/10 text-white text-sm focus:ring-1 focus:ring-pink-500/40 focus:outline-none transition-all placeholder:text-white/20 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 block">
                    Number of Slides
                  </label>
                  <select
                    value={slideCount}
                    onChange={(e) => setSlideCount(Number(e.target.value))}
                    className="w-full p-3 bg-black/40 rounded-xl border border-white/10 text-white text-xs focus:outline-none focus:border-pink-500 transition-all"
                  >
                    <option value={5}>5 Slides (Short Pitch)</option>
                    <option value={6}>6 Slides (Standard Lecture)</option>
                    <option value={8}>8 Slides (Deep Dive)</option>
                    <option value={10}>10 Slides (Comprehensive)</option>
                    <option value={12}>12 Slides (Seminar)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5 block">
                    Required Level / Depth
                  </label>
                  <select
                    value={detailLevel}
                    onChange={(e) => setDetailLevel(e.target.value)}
                    className="w-full p-3 bg-black/40 rounded-xl border border-white/10 text-white text-xs focus:outline-none focus:border-pink-500 transition-all"
                  >
                    <option value="Detailed Academic Lecture">Detailed Academic Lecture</option>
                    <option value="Foundational Overview for Beginners">Foundational Overview</option>
                    <option value="Case Study & Industry Architecture">Case Study & Application</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              disabled={!topic.trim() || loading}
              onClick={handleGenerate}
              className="w-full mt-6 py-4 bg-pink-500 hover:bg-pink-400 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-pink-500/25 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Generating Slides with AI...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Slide-Wise Content
                </>
              )}
            </button>
          </div>
        </div>

        {/* Output Panel */}
        <div className="glass-card overflow-hidden flex flex-col min-h-[500px]">
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">
              {selectedHistoryItem ? `Viewing Saved: ${selectedHistoryItem.topic}` : "Generated Slides"}
            </span>

            {displayContent && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(displayContent)}
                  className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors text-xs flex items-center gap-1.5"
                  title="Copy"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={() => downloadMarkdown(displayContent, topic || subject || "presentation")}
                  className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-colors text-xs flex items-center gap-1.5"
                  title="Download Markdown"
                >
                  <Download size={14} />
                  Download .md
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 p-8 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4 py-16">
                <div className="w-16 h-16 bg-pink-500/20 rounded-2xl flex items-center justify-center animate-pulse border border-pink-500/30">
                  <Sparkles size={30} className="text-pink-400" />
                </div>
                <p className="text-xs font-bold tracking-widest text-white/60 uppercase animate-pulse">
                  Formatting Slides with Gemini AI...
                </p>
              </div>
            ) : displayContent ? (
              <div className="markdown-body prose prose-invert max-w-none text-white/90 text-sm leading-relaxed">
                <ReactMarkdown>{displayContent}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-24 space-y-3">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-white/20">
                  <Presentation size={32} />
                </div>
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">
                  Awaiting Presentation Topic
                </p>
                <p className="text-[11px] text-white/40 max-w-xs">
                  Enter a presentation topic and choose slide count to generate slide titles, points, and speaker notes.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BYOK Settings Modal */}
      <AISettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        teacherId={user.uid}
        onKeyUpdated={(hasKey) => {
          if (hasKey) setApiKeyError("");
        }}
      />
    </div>
  );
};
export default PPTModule;
