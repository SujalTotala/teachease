import React, { useState, useEffect, useRef } from "react";
import {
  storage,
  UserProfile,
  AttendanceRecord,
  AttendanceSession,
  generateUUID
} from "../services/storageService";
import {
  UserCheck,
  Save,
  Calendar as CalendarIcon,
  Users,
  CheckCircle2,
  XCircle,
  Camera,
  Sparkles,
  RefreshCw,
  ScanFace,
  BookOpen,
  Filter,
  Download,
  Trash2,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  Check,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { faceService } from "../services/faceRecognitionService";
import { motion, AnimatePresence } from "motion/react";

interface AttendanceModuleProps {
  user: UserProfile;
}

export const AttendanceModule: React.FC<AttendanceModuleProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<"take" | "history">("take");
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [attendance, setAttendance] = useState<Record<string, "present" | "absent">>({});

  // Session Parameters
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sessionSubject, setSessionSubject] = useState(user.subject || "Data Structures");
  const [sessionNumber, setSessionNumber] = useState("Session 1");
  const [sessionType, setSessionType] = useState<"Lecture" | "Practical" | "Tutorial">("Lecture");
  const [startTime, setStartTime] = useState("10:30 AM");
  const [targetYear, setTargetYear] = useState("Third Year");
  const [targetBranch, setTargetBranch] = useState("Computer Science");
  const [selectedDivision, setSelectedDivision] = useState("Div A");

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // AI Recognition states
  const [aiLoading, setAiLoading] = useState(false);
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [detectedFaceCount, setDetectedFaceCount] = useState<number | null>(null);
  const [recognizedStudents, setRecognizedStudents] = useState<{ id: string; name: string; distance: number; box?: any }[]>([]);
  const [unknownFaceCount, setUnknownFaceCount] = useState<number>(0);
  const [verificationPending, setVerificationPending] = useState(false);

  // Canvas ref for drawing bounding boxes
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // History & Session states
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  // History filters
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterYear, setFilterYear] = useState("All");

  useEffect(() => {
    const init = async () => {
      await storage.syncStudentsFromSupabase();
      fetchStudents();
      await fetchHistory();
    };
    init();
  }, [user]);

  const fetchStudents = () => {
    const list = storage.getStudents();
    setStudents(list);

    // Default all to absent initially
    const initial: Record<string, "present" | "absent"> = {};
    list.forEach(s => {
      initial[s.uid] = "absent";
    });
    setAttendance(initial);
  };

  const fetchHistory = async () => {
    await storage.syncAttendanceSessionsFromSupabase(user.uid);
    const loadedSessions = storage.getAttendanceSessions(user.uid);
    const records = storage.getAttendance();
    const teacherRecords = records.filter(r => r.teacherId === user.uid);

    setSessions(loadedSessions);
    setAllAttendance(teacherRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  // Filter students based on selected branch/year/division for the session
  const filteredStudents = students.filter(s => {
    const matchBranch = targetBranch === "All" || !s.branch || s.branch === targetBranch;
    const matchYear = targetYear === "All" || !s.year || s.year === targetYear;
    const matchDiv = selectedDivision === "All" || !s.division || s.division === selectedDivision;
    return matchBranch && matchYear && matchDiv;
  });

  // Handle manual status toggle
  const toggleAttendance = (studentId: string) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: prev[studentId] === "present" ? "absent" : "present"
    }));
  };

  // Mark all present / absent
  const markAll = (status: "present" | "absent") => {
    const updated: Record<string, "present" | "absent"> = { ...attendance };
    filteredStudents.forEach(s => {
      updated[s.uid] = status;
    });
    setAttendance(updated);
  };

  // Group Photo Upload & Facial Recognition (FR-05, FR-06, FR-07)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiLoading(true);
    setVerificationPending(false);
    setDetectedFaceCount(null);
    setRecognizedStudents([]);
    setUnknownFaceCount(0);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const src = event.target?.result as string;
      setUploadedImageSrc(src);

      const img = new Image();
      img.src = src;
      img.onload = async () => {
        try {
          // Prepare registered students with descriptors
          const registered = students
            .filter(s => s.faceDescriptor && s.faceDescriptor.length > 0)
            .map(s => ({
              id: s.uid,
              name: s.name,
              descriptor: s.faceDescriptor instanceof Float32Array ? s.faceDescriptor : new Float32Array(s.faceDescriptor!)
            }));

          // Detect all faces in photo (FR-06)
          const detectedFaces = await faceService.detectAllFaces(img);
          const totalDetected = detectedFaces.length;
          setDetectedFaceCount(totalDetected);

          // Match faces against registered student embeddings (FR-07)
          const matches = faceService.findMatches(detectedFaces, registered);

          const recognizedList: { id: string; name: string; distance: number; box?: any }[] = [];
          let unknownCount = 0;

          // Update attendance map
          const newAttendance: Record<string, "present" | "absent"> = { ...attendance };

          matches.forEach(match => {
            if (match.id !== "unknown") {
              newAttendance[match.id] = "present";
              recognizedList.push({
                id: match.id,
                name: match.name,
                distance: match.distance,
                box: match.box
              });
            } else {
              unknownCount++;
            }
          });

          setRecognizedStudents(recognizedList);
          setUnknownFaceCount(unknownCount);
          setAttendance(newAttendance);
          setVerificationPending(true);

          // Draw bounding boxes on canvas
          drawDetections(img, matches);
        } catch (err) {
          console.error("AI Face Recognition Failed:", err);
          alert("Error during facial recognition processing. Please ensure the image is clear.");
        } finally {
          setAiLoading(false);
        }
      };
    };
    reader.readAsDataURL(file);
  };

  const drawDetections = (img: HTMLImageElement, matches: any[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    matches.forEach(match => {
      if (!match.box) return;
      const { x, y, width, height } = match.box;
      const isRecognized = match.id !== "unknown";

      // Box styling
      ctx.strokeStyle = isRecognized ? "#10b981" : "#f59e0b";
      ctx.lineWidth = Math.max(3, Math.round(canvas.width / 300));
      ctx.strokeRect(x, y, width, height);

      // Label badge
      const label = isRecognized ? match.name : "Unregistered";
      ctx.font = `bold ${Math.max(14, Math.round(canvas.width / 45))}px sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const textHeight = Math.max(18, Math.round(canvas.width / 40));

      ctx.fillStyle = isRecognized ? "rgba(16, 185, 129, 0.85)" : "rgba(245, 158, 11, 0.85)";
      ctx.fillRect(x, Math.max(0, y - textHeight - 6), textWidth + 12, textHeight + 6);

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x + 6, Math.max(textHeight, y - 6));
    });
  };

  // Confirm and Save Session-Based Attendance
  const handleConfirmAndSave = async () => {
    const relevantStudents = filteredStudents.length > 0 ? filteredStudents : students;
    if (relevantStudents.length === 0) {
      alert("No registered students found to mark attendance.");
      return;
    }

    setSaving(true);
    try {
      const sessionId = generateUUID();
      const newSession: AttendanceSession = {
        id: sessionId,
        teacherId: user.uid,
        subject: sessionSubject.trim() || user.subject || "General Academic",
        date,
        year: targetYear,
        branch: targetBranch,
        division: selectedDivision,
        sessionNumber,
        sessionType,
        startTime,
        createdAt: new Date().toISOString()
      };

      const recordsToSave: AttendanceRecord[] = relevantStudents.map(student => {
        const studentId = student.uid;
        const status = attendance[studentId] || "absent";
        const matchInfo = recognizedStudents.find(m => m.id === studentId);
        return {
          id: generateUUID(),
          sessionId,
          sessionNumber,
          sessionType,
          startTime,
          studentId,
          studentName: student.name || "Unknown Student",
          status,
          date,
          teacherId: user.uid,
          subject: newSession.subject,
          method: matchInfo ? "ai" : "manual",
          branch: student.branch || targetBranch,
          year: student.year || targetYear,
          division: student.division || selectedDivision,
          confidence: matchInfo ? Number((1 - matchInfo.distance).toFixed(2)) : undefined,
          createdAt: new Date().toISOString()
        };
      });

      storage.saveAttendanceSession(newSession, recordsToSave);
      await fetchHistory();

      const presentCount = recordsToSave.filter(r => r.status === "present").length;
      setSuccessMessage(`${sessionNumber} – ${newSession.subject} (${startTime}) recorded successfully! (${presentCount}/${recordsToSave.length} Present)`);
      setSaveSuccess(true);
      setVerificationPending(false);

      setTimeout(() => {
        setSaveSuccess(false);
      }, 4000);
    } catch (err) {
      console.error("Save session failed:", err);
      alert("Failed to save session attendance records.");
    } finally {
      setSaving(false);
    }
  };

  // Delete attendance session
  const handleDeleteSession = (sessionId: string, sessionTitle: string) => {
    if (window.confirm(`Are you sure you want to delete ${sessionTitle} and all its attendance records?`)) {
      storage.deleteAttendanceSession(sessionId);
      fetchHistory();
      if (expandedSessionId === sessionId) {
        setExpandedSessionId(null);
      }
    }
  };

  // Export specific session to CSV
  const exportSessionCSV = (session: AttendanceSession) => {
    const sessionRecords = allAttendance.filter(r => r.sessionId === session.id);
    if (sessionRecords.length === 0) {
      alert("No attendance records found for this session.");
      return;
    }
    const headers = "Session Number,Session Type,Start Time,Date,Subject,Student Name,Enrollment,Branch,Year,Division,Status,Method,Confidence\n";
    const rows = sessionRecords.map(r => {
      const s = students.find(st => st.uid === r.studentId);
      return `"${session.sessionNumber}","${session.sessionType}","${session.startTime || ''}","${session.date}","${session.subject}","${r.studentName}","${s?.enrollmentNumber || 'N/A'}","${r.branch || ''}","${r.year || ''}","${r.division || ''}","${r.status}","${r.method}","${r.confidence ? Math.round(r.confidence * 100) + '%' : 'N/A'}"`;
    }).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance_${session.subject}_${session.sessionNumber}_${session.date}.csv`;
    link.click();
  };

  // Export all filtered history to CSV
  const exportAllHistoryCSV = () => {
    if (allAttendance.length === 0) {
      alert("No attendance records to export.");
      return;
    }
    const headers = "Date,Session,Subject,Student Name,Enrollment,Branch,Year,Division,Status,Method,Confidence\n";
    const rows = allAttendance.map(r => {
      const s = students.find(st => st.uid === r.studentId);
      return `"${r.date}","${r.sessionNumber || 'Session 1'}","${r.subject}","${r.studentName}","${s?.enrollmentNumber || 'N/A'}","${r.branch || ''}","${r.year || ''}","${r.division || ''}","${r.status}","${r.method}","${r.confidence ? Math.round(r.confidence * 100) + '%' : 'N/A'}"`;
    }).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance_full_report_${date}.csv`;
    link.click();
  };

  // Group sessions by date for the History Tab
  const filteredSessions = sessions.filter(s => {
    const matchDate = !filterDate || s.date === filterDate;
    const matchSubj = !filterSubject || s.subject.toLowerCase().includes(filterSubject.toLowerCase());
    const matchBranch = filterBranch === "All" || s.branch === filterBranch;
    const matchYear = filterYear === "All" || s.year === filterYear;
    return matchDate && matchSubj && matchBranch && matchYear;
  });

  const sessionsByDate: Record<string, AttendanceSession[]> = {};
  filteredSessions.forEach(s => {
    if (!sessionsByDate[s.date]) {
      sessionsByDate[s.date] = [];
    }
    sessionsByDate[s.date].push(s);
  });

  const displayStudents = filteredStudents.length > 0 ? filteredStudents : students;
  const presentCount = displayStudents.filter(s => attendance[s.uid] === "present").length;
  const totalStudents = displayStudents.length;
  const attendanceRate = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <UserCheck size={20} />
            </div>
            Smart Attendance Module
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Session-based attendance (Multiple sessions per day) with facial recognition verification
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10 self-start">
          <button
            onClick={() => setActiveTab("take")}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all",
              activeTab === "take"
                ? "bg-indigo-500 text-white shadow-sm"
                : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            Take Attendance
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold transition-all",
              activeTab === "history"
                ? "bg-indigo-500 text-white shadow-sm"
                : "text-white/60 hover:text-white hover:bg-white/5"
            )}
          >
            Attendance History ({sessions.length} Sessions)
          </button>
        </div>
      </div>

      {saveSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm font-semibold flex items-center gap-3 shadow-lg"
        >
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </motion.div>
      )}

      {activeTab === "take" ? (
        <div className="space-y-8">
          {/* Session Parameters Banner (Configuring Session 1, 2, 3...) */}
          <div className="glass-card p-6 border-indigo-500/20">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-white/5">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={15} />
                Session Configuration (Multiple Sessions Supported)
              </span>
              <span className="text-[11px] text-white/40">
                Independent records per lecture or practical
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {/* Date */}
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5 block">
                  Date
                </label>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white">
                  <CalendarIcon size={14} className="text-indigo-400 shrink-0" />
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-transparent border-none text-white text-xs focus:outline-none w-full"
                  />
                </div>
              </div>

              {/* Subject */}
              <div className="lg:col-span-2">
                <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5 block">
                  Subject / Course
                </label>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white">
                  <BookOpen size={14} className="text-indigo-400 shrink-0" />
                  <input
                    type="text"
                    value={sessionSubject}
                    onChange={(e) => setSessionSubject(e.target.value)}
                    placeholder="e.g. Java Programming"
                    className="bg-transparent border-none text-white text-xs focus:outline-none w-full font-medium"
                  />
                </div>
              </div>

              {/* Session Number */}
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5 block">
                  Session Slot
                </label>
                <select
                  value={sessionNumber}
                  onChange={(e) => setSessionNumber(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="Session 1">Session 1</option>
                  <option value="Session 2">Session 2</option>
                  <option value="Session 3">Session 3</option>
                  <option value="Session 4">Session 4</option>
                  <option value="Session 5">Session 5</option>
                  <option value="Session 6">Session 6</option>
                </select>
              </div>

              {/* Session Type */}
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5 block">
                  Session Type
                </label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value as any)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="Lecture">Lecture</option>
                  <option value="Practical">Practical</option>
                  <option value="Tutorial">Tutorial</option>
                </select>
              </div>

              {/* Start Time */}
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5 block">
                  Start Time
                </label>
                <input
                  type="text"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="e.g. 10:30 AM"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-semibold"
                />
              </div>
            </div>

            {/* Target Class Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/5">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1 block">
                  Year
                </label>
                <select
                  value={targetYear}
                  onChange={(e) => setTargetYear(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="All">All Years</option>
                  <option value="First Year">First Year</option>
                  <option value="Second Year">Second Year</option>
                  <option value="Third Year">Third Year</option>
                  <option value="Final Year">Final Year</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1 block">
                  Branch
                </label>
                <select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="All">All Branches</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Mechanical">Mechanical</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1 block">
                  Division
                </label>
                <select
                  value={selectedDivision}
                  onChange={(e) => setSelectedDivision(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="All">All Divisions</option>
                  <option value="Div A">Division A</option>
                  <option value="Div B">Division B</option>
                  <option value="Div C">Division C</option>
                </select>
              </div>
            </div>
          </div>

          {/* Stats Bar & Quick Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-white/40 block">Present Rate</span>
                <span className="text-2xl font-black text-emerald-400">{attendanceRate}%</span>
              </div>
              <div className="text-right text-xs text-white/60">
                <span className="text-white font-bold">{presentCount}</span> / {totalStudents} Students
              </div>
            </div>

            <div className="glass-card p-4 flex items-center justify-between gap-3 sm:col-span-2">
              <span className="text-xs text-white/50 font-medium">Quick Bulk Actions:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => markAll("present")}
                  className="px-4 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all"
                >
                  Mark All Present
                </button>
                <button
                  onClick={() => markAll("absent")}
                  className="px-4 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all"
                >
                  Mark All Absent
                </button>
              </div>
            </div>
          </div>

          {/* Group Photo AI Facial Recognition Section (FR-05, FR-06, FR-07) */}
          <div className="glass-card p-6 border-indigo-500/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <ScanFace size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Classroom Group Photo Recognition</h3>
                  <p className="text-[11px] text-white/50">Upload a classroom photo to detect registered students and mark attendance automatically</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={aiLoading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                >
                  {aiLoading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Scanning Classroom Faces...
                    </>
                  ) : (
                    <>
                      <Camera size={14} />
                      Upload Classroom Photo
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* AI Detection Stat Counters */}
            {detectedFaceCount !== null && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-3 gap-3 mb-6 p-4 rounded-xl bg-white/5 border border-white/10"
              >
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold text-white/40 block">Total Faces Detected</span>
                  <span className="text-xl font-bold text-white">{detectedFaceCount}</span>
                </div>
                <div className="text-center border-x border-white/10">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">Recognized Students</span>
                  <span className="text-xl font-bold text-emerald-400">{recognizedStudents.length}</span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold text-amber-400 block">Unregistered Faces</span>
                  <span className="text-xl font-bold text-amber-400">{unknownFaceCount}</span>
                </div>
              </motion.div>
            )}

            {/* Image Preview & Face Boxes Canvas */}
            {uploadedImageSrc && (
              <div className="relative mb-6 rounded-2xl overflow-hidden border border-white/10 bg-black/60 flex justify-center max-h-[480px]">
                <img
                  ref={imageRef}
                  src={uploadedImageSrc}
                  alt="Classroom"
                  className="max-h-[480px] w-auto object-contain"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                />
              </div>
            )}

            {/* Verification Banner (FR-08: Review and Confirm) */}
            {verificationPending && (
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Sparkles size={18} className="text-indigo-400 shrink-0" />
                  <p className="text-xs text-white/80">
                    <span className="font-bold text-indigo-400">Review & Confirm:</span> Facial recognition marked {recognizedStudents.length} students as Present. You can adjust statuses in the roster below before saving.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Student Roster Table for Review & Confirmation */}
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Session Attendance Roster ({displayStudents.length} Students)
                </h4>
                <p className="text-[10px] text-white/40 mt-0.5">
                  Slot: {sessionNumber} • Type: {sessionType} • Time: {startTime} • Subject: {sessionSubject}
                </p>
              </div>

              <button
                onClick={handleConfirmAndSave}
                disabled={saving || displayStudents.length === 0}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 self-start sm:self-auto"
              >
                {saving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Saving Session...
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    Confirm & Save {sessionNumber} Attendance
                  </>
                )}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-white/40 uppercase tracking-wider text-[10px] border-b border-white/5">
                  <tr>
                    <th className="py-3 px-6">Student</th>
                    <th className="py-3 px-6">Enrollment</th>
                    <th className="py-3 px-6">Branch / Year</th>
                    <th className="py-3 px-6">AI Detection</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {displayStudents.map((student) => {
                    const isPresent = attendance[student.uid] === "present";
                    const match = recognizedStudents.find(m => m.id === student.uid);

                    return (
                      <tr key={student.uid} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            {student.photoUrl ? (
                              <img
                                src={student.photoUrl}
                                alt={student.name}
                                className="w-8 h-8 rounded-full object-cover border border-white/10"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
                                {student.name[0]}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-white">{student.name}</p>
                              <p className="text-[10px] text-white/40">{student.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 font-mono text-white/60">
                          {student.enrollmentNumber || "—"}
                        </td>
                        <td className="py-3.5 px-6 text-white/50">
                          {student.branch || "CS"} • {student.division || "Div A"}
                        </td>
                        <td className="py-3.5 px-6">
                          {match ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                              <Sparkles size={10} /> Face Match ({Math.round((1 - match.distance) * 100)}%)
                            </span>
                          ) : (
                            <span className="text-[10px] text-white/30">Manual Entry</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase",
                              isPresent
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-rose-500/10 text-rose-400"
                            )}
                          >
                            {isPresent ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            {isPresent ? "Present" : "Absent"}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            onClick={() => toggleAttendance(student.uid)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border",
                              isPresent
                                ? "border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                                : "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                            )}
                          >
                            Mark {isPresent ? "Absent" : "Present"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Attendance History Section (Grouped by Date & Session) */
        <div className="space-y-6">
          {/* History Filter Bar */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
                <Filter size={14} className="text-indigo-400" />
                Filter Attendance History
              </span>
              <button
                onClick={exportAllHistoryCSV}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center gap-2 transition-all"
              >
                <Download size={14} /> Export All Sessions CSV
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Subject</label>
                <input
                  type="text"
                  placeholder="Filter by subject..."
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder:text-white/20"
                />
              </div>

              <div>
                <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Branch</label>
                <select
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">All Branches</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Mechanical">Mechanical</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Year</label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">All Years</option>
                  <option value="First Year">First Year</option>
                  <option value="Second Year">Second Year</option>
                  <option value="Third Year">Third Year</option>
                  <option value="Final Year">Final Year</option>
                </select>
              </div>
            </div>
          </div>

          {/* Grouped Sessions List */}
          {Object.keys(sessionsByDate).length === 0 ? (
            <div className="glass-card p-16 text-center text-white/30 space-y-2">
              <CalendarIcon size={32} className="mx-auto text-white/10" />
              <p className="text-xs uppercase font-bold tracking-widest">No matching attendance sessions found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(sessionsByDate).map(([dateStr, sessionList]) => (
                <div key={dateStr} className="glass-card p-6 space-y-4">
                  {/* Date Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <CalendarIcon size={16} className="text-indigo-400" />
                      <h3 className="font-bold text-sm text-white">{dateStr}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/50 border border-white/10 font-bold">
                        {sessionList.length} Session{sessionList.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Sessions on this date */}
                  <div className="space-y-3">
                    {sessionList.map((session) => {
                      const isExpanded = expandedSessionId === session.id;
                      const sessionRecords = allAttendance.filter(r => r.sessionId === session.id);
                      const rate = session.totalStudents && session.totalStudents > 0
                        ? Math.round(((session.presentCount || 0) / session.totalStudents) * 100)
                        : (sessionRecords.length > 0
                          ? Math.round((sessionRecords.filter(r => r.status === "present").length / sessionRecords.length) * 100)
                          : 0);

                      return (
                        <div key={session.id} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all">
                          {/* Session Summary Card */}
                          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all"
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>

                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                    {session.sessionNumber}
                                  </span>
                                  <span className="font-bold text-sm text-white">
                                    {session.subject}
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-white/50 border border-white/10">
                                    {session.sessionType}
                                  </span>
                                </div>
                                <p className="text-[11px] text-white/40 mt-1 flex items-center gap-2">
                                  <Clock size={11} className="text-white/30" />
                                  <span>{session.startTime || "Start time unrecorded"}</span>
                                  <span>•</span>
                                  <span>{session.year}</span>
                                  <span>•</span>
                                  <span>{session.branch}</span>
                                  {session.division && <span>({session.division})</span>}
                                </p>
                              </div>
                            </div>

                            {/* Attendance Pill & Actions */}
                            <div className="flex items-center gap-3 self-end sm:self-center">
                              <div className="text-right">
                                <span className="text-xs font-bold text-emerald-400">
                                  {session.presentCount ?? sessionRecords.filter(r => r.status === "present").length} / {session.totalStudents ?? sessionRecords.length} Present
                                </span>
                                <span className="text-[10px] text-white/40 block">
                                  {rate}% Attendance
                                </span>
                              </div>

                              <button
                                onClick={() => exportSessionCSV(session)}
                                title="Export this session's attendance"
                                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/5 transition-all text-xs flex items-center gap-1.5"
                              >
                                <Download size={13} />
                              </button>

                              <button
                                onClick={() => handleDeleteSession(session.id, `${session.sessionNumber} (${session.subject})`)}
                                title="Delete this session"
                                className="p-2 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Expanded Student Attendance Records */}
                          {isExpanded && (
                            <div className="border-t border-white/5 bg-black/40 p-4">
                              <div className="flex items-center justify-between mb-3 text-[11px] text-white/50">
                                <span>Roster details for {session.sessionNumber} ({session.subject})</span>
                                <span>{sessionRecords.length} recorded entries</span>
                              </div>

                              {sessionRecords.length === 0 ? (
                                <p className="text-xs text-white/30 text-center py-4">No individual student records found for this session.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead className="text-[10px] text-white/40 uppercase border-b border-white/5">
                                      <tr>
                                        <th className="py-2 px-4">Student Name</th>
                                        <th className="py-2 px-4">Enrollment</th>
                                        <th className="py-2 px-4">Class</th>
                                        <th className="py-2 px-4">Method</th>
                                        <th className="py-2 px-4 text-right">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                      {sessionRecords.map(rec => {
                                        const s = students.find(st => st.uid === rec.studentId);
                                        return (
                                          <tr key={rec.id} className="hover:bg-white/[0.02]">
                                            <td className="py-2.5 px-4 font-semibold text-white">
                                              {rec.studentName}
                                            </td>
                                            <td className="py-2.5 px-4 font-mono text-white/50">
                                              {s?.enrollmentNumber || "—"}
                                            </td>
                                            <td className="py-2.5 px-4 text-white/40">
                                              {rec.branch || "CS"} • {rec.division || "Div A"}
                                            </td>
                                            <td className="py-2.5 px-4">
                                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 uppercase">
                                                {rec.method} {rec.confidence ? `(${Math.round(rec.confidence * 100)}%)` : ""}
                                              </span>
                                            </td>
                                            <td className="py-2.5 px-4 text-right">
                                              <span
                                                className={cn(
                                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                                  rec.status === "present"
                                                    ? "bg-emerald-500/10 text-emerald-400"
                                                    : "bg-rose-500/10 text-rose-400"
                                                )}
                                              >
                                                {rec.status}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AttendanceModule;
