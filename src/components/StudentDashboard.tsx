import React, { useState, useEffect } from "react";
import { storage, UserProfile } from "../services/storageService";
import {
  Calendar as CalendarIcon,
  Download,
  FileText,
  StickyNote,
  Presentation,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Clock,
  RefreshCw,
  Users
} from "lucide-react";
import { cn } from "../lib/utils";

interface StudentDashboardProps {
  user: UserProfile;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ user }) => {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [stats, setStats] = useState({ present: 0, absent: 0 });
  const [materials, setMaterials] = useState({ assignments: [], notes: [], ppts: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = () => {
    try {
      // 1. Fetch Attendance
      const allAttendance = storage.getAttendance();
      const studentRecords = allAttendance
        .filter(r => r.studentId === user.uid)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setAttendance(studentRecords);

      const p = studentRecords.filter(r => r.status === "present").length;
      setStats({ present: p, absent: studentRecords.length - p });

      // 2. Fetch Materials
      const allContent = storage.getContent();

      setMaterials({
        assignments: allContent.filter(c => c.type === "assignment") as any,
        notes: allContent.filter(c => c.type === "note") as any,
        ppts: allContent.filter(c => c.type === "ppt") as any,
      });
    } catch (err) {
      console.error("Failed to fetch student data:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculateAttendanceRate = () => {
    const total = stats.present + stats.absent;
    if (total === 0) return 0;
    return Math.round((stats.present / total) * 100);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="glass-card p-6 bg-emerald-500/10 border-emerald-500/20">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="text-emerald-400" size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Days Present</span>
          </div>
          <p className="text-3xl font-black">{stats.present}</p>
        </div>
        <div className="glass-card p-6 bg-red-500/10 border-red-500/20">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="text-red-400" size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Days Absent</span>
          </div>
          <p className="text-3xl font-black">{stats.absent}</p>
        </div>
        <div className="glass-card p-6 bg-indigo-500/10 border-indigo-500/20 col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="text-indigo-400" size={20} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Attendance Rate</span>
            </div>
            <span className="text-xl font-black text-indigo-400">{calculateAttendanceRate()}%</span>
          </div>
          <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-1000"
              style={{ width: `${calculateAttendanceRate()}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Materials */}
        <div className="lg:col-span-2 space-y-8">
          <div className="glass-card p-8">
            <h3 className="text-xl font-bold mb-8 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center">
                <FileText size={20} />
              </div>
              Academic Materials
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sections for Assignments, Notes, PPTs */}
              {[
                { title: "Assignments", icon: FileText, items: materials.assignments, color: "text-sky-400" },
                { title: "Notes", icon: StickyNote, items: materials.notes, color: "text-emerald-400" },
                { title: "PPT Blueprints", icon: Presentation, items: materials.ppts, color: "text-pink-400" }
              ].map((section) => (
                <div key={section.title} className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <section.icon size={16} className={section.color} />
                      <span className="text-xs font-bold uppercase tracking-widest">{section.title}</span>
                    </div>
                    <span className="text-[10px] bg-white/10 px-2 py-1 rounded font-bold">{section.items.length}</span>
                  </div>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {section.items.length > 0 ? section.items.map((item: any, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5 group hover:bg-white/5 transition-all">
                        <div className="overflow-hidden mr-2">
                          <p className="text-xs font-bold truncate">{item.topic}</p>
                          <p className="text-[8px] opacity-40 uppercase">Shared by Teacher</p>
                        </div>
                        <button className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                          <Download size={14} />
                        </button>
                      </div>
                    )) : <p className="text-[10px] opacity-30 italic">No shared {section.title.toLowerCase()} yet.</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Detailed Attendance List */}
        <div className="glass-card p-8">
          <h3 className="text-xs uppercase font-bold tracking-[0.2em] mb-8 opacity-40 flex items-center gap-2">
            <Clock size={14} />
            Time-entry Log
          </h3>
          <div className="space-y-4">
            {attendance.length > 0 ? attendance.map((record, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  record.status === "present" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                )}>
                  {record.status === "present" ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-bold capitalize">
                    {record.status} {record.subject ? `– ${record.subject}` : ""}
                  </p>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-tighter">
                    {record.date} {record.sessionNumber ? `• ${record.sessionNumber}` : ""} {record.startTime ? `(${record.startTime})` : ""}
                  </p>
                </div>
                {record.method === "ai" && (
                  <div className="w-8 h-8 bg-sky-500/10 text-sky-400 rounded-lg flex items-center justify-center">
                    <Users size={14} />
                  </div>
                )}
              </div>
            )) : (
              <div className="py-10 text-center opacity-30">
                <CalendarIcon size={32} className="mx-auto mb-2" />
                <p className="text-xs">No records available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;

