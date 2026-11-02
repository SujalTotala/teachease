import React, { useState, useEffect } from "react";
import { storage, UserProfile } from "../services/storageService";
import { 
  LayoutDashboard, 
  UserCheck, 
  FileText, 
  BookOpen, 
  StickyNote, 
  Presentation, 
  ArrowRight, 
  Users, 
  Sparkles,
  ShieldCheck
} from "lucide-react";
import { motion } from "motion/react";

interface DashboardHomeProps {
  user: UserProfile;
  onNavigate: (module: any) => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ user, onNavigate }) => {
  const [studentCount, setStudentCount] = useState(0);
  const [contentCount, setContentCount] = useState(0);
  const [attendanceCount, setAttendanceCount] = useState(0);

  useEffect(() => {
    const students = storage.getStudents();
    setStudentCount(students.length);

    const content = storage.getContent(undefined, user.uid);
    setContentCount(content.length);

    const attendance = storage.getAttendance().filter(a => a.teacherId === user.uid);
    setAttendanceCount(attendance.length);
  }, [user]);

  const quickTools = [
    { 
      id: "attendance", 
      label: "Smart Attendance", 
      icon: UserCheck, 
      desc: "Group photo face detection & recognition.", 
      color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
    },
    { 
      id: "students", 
      label: "Student Directory", 
      icon: Users, 
      desc: "Register students & facial embeddings.", 
      color: "bg-purple-500/20 text-purple-400 border-purple-500/30" 
    },
    { 
      id: "assignments", 
      label: "AI Assignments", 
      icon: FileText, 
      desc: "Structured problem sets & rubrics.", 
      color: "bg-orange-500/20 text-orange-400 border-orange-500/30" 
    },
    { 
      id: "notes", 
      label: "Lecture Notes", 
      icon: StickyNote, 
      desc: "High-yield academic study notes.", 
      color: "bg-sky-500/20 text-sky-400 border-sky-500/30" 
    },
    { 
      id: "ppt", 
      label: "PPT Content", 
      icon: Presentation, 
      desc: "Slide-by-slide lecture presentation content.", 
      color: "bg-pink-500/20 text-pink-400 border-pink-500/30" 
    },
  ];

  return (
    <div className="space-y-10">

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6 flex flex-col justify-between"
        >
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-white/40">Registered Students</p>
            <h3 className="text-3xl font-extrabold mt-2 text-indigo-400">{studentCount}</h3>
          </div>
          <p className="text-[11px] text-white/40 mt-3 flex items-center gap-1.5">
            <Users size={13} className="text-indigo-400" /> Enrolled for Attendance
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-6 flex flex-col justify-between"
        >
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-white/40">Attendance Logs</p>
            <h3 className="text-3xl font-extrabold mt-2 text-emerald-400">{attendanceCount}</h3>
          </div>
          <p className="text-[11px] text-white/40 mt-3 flex items-center gap-1.5">
            <UserCheck size={13} className="text-emerald-400" /> Stored in Supabase
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6 flex flex-col justify-between"
        >
          <div>
            <p className="text-[10px] uppercase font-bold tracking-widest text-white/40">AI Content Generated</p>
            <h3 className="text-3xl font-extrabold mt-2 text-orange-400">{contentCount}</h3>
          </div>
          <p className="text-[11px] text-white/40 mt-3 flex items-center gap-1.5">
            <Sparkles size={13} className="text-orange-400" /> Assignments, Notes & Slides
          </p>
        </motion.div>
      </div>

      {/* Interactive Teaching Modules Grid */}
      <div>
        <h2 className="text-xs uppercase font-bold tracking-[0.3em] mb-6 text-white/40">
          Core Academic Tools
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {quickTools.map((tool, i) => (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 + 0.2 }}
              key={tool.id}
              onClick={() => onNavigate(tool.id)}
              className="group glass-card p-6 text-left hover:bg-white/5 transition-all hover:-translate-y-1 border border-white/5 flex flex-col justify-between"
            >
              <div>
                <div className={`w-12 h-12 ${tool.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform border`}>
                  <tool.icon size={24} />
                </div>
                <h3 className="font-bold text-lg mb-2 text-white">{tool.label}</h3>
                <p className="text-xs text-white/50 leading-relaxed">{tool.desc}</p>
              </div>
              <div className="mt-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                Launch Module <ArrowRight size={14} />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};
export default DashboardHome;
