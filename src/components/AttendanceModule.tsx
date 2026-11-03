import React, { useState, useEffect, useRef } from "react";
import { storage, UserProfile, AttendanceRecord } from "../services/storageService";
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
  SlidersHorizontal,
  Eye,
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
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [sessionSubject, setSessionSubject] = useState("Data Structures");
  const [selectedDivision, setSelectedDivision] = useState("All");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  // History states & filters (FR-10)
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [filterDate, setFilterDate] = useState("");
  const [filterStudent, setFilterStudent] = useState("");
  const [filterBranch, setFilterBranch] = useState("All");
  const [filterYear, setFilterYear] = useState("All");
  const [filterDivision, setFilterDivision] = useState("All");

  useEffect(() => {
    const init = async () => {
      await storage.syncStudentsFromSupabase();
      fetchStudents();
      fetchHistory();
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

  const fetchHistory = () => {
    const records = storage.getAttendance();
    const teacherRecords = records.filter(r => r.teacherId === user.uid);
    setAllAttendance(teacherRecords.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  // Handle manual status toggle
  const toggleAttendance = (studentId: string) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: prev[studentId] === "present" ? "absent" : "present"
    }));
  };

  // Mark all present / absent
  const markAll = (status: "present" | "absent") => {
    const updated: Record<string, "present" | "absent"> = {};
    students.forEach(s => {
      updated[s.uid] = status;
    });
    setAttendance(updated);
  };

  // FR-05, FR-06, FR-07: Classroom Group Photo Upload & Recognition
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
          const newAttendance: Record<string, "present" | "absent"> = {};
          students.forEach(s => {
            newAttendance[s.uid] = "absent";
          });

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

  // FR-08, FR-09: Confirm and Save Attendance
  const handleConfirmAndSave = () => {
    if (Object.keys(attendance).length === 0) return;
    setSaving(true);

    try {
      const recordsToSave: AttendanceRecord[] = Object.entries(attendance).map(([studentId, status]) => {
        const student = students.find(s => s.uid === studentId);
        const matchInfo = recognizedStudents.find(m => m.id === studentId);
        return {
          id: `att-${Math.random().toString(36).substr(2, 9)}`,
          studentId,
          studentName: student?.name || "Unknown Student",
          status,
          date,
          teacherId: user.uid,
          subject: sessionSubject || "General Academic",
          method: matchInfo ? "ai" : "manual",
          branch: student?.branch || "Computer Science",
          year: student?.year || "Third Year",
          division: student?.division || "Div A",
          confidence: matchInfo ? Number((1 - matchInfo.distance).toFixed(2)) : undefined,
          createdAt: new Date().toISOString()
        };
      });

      storage.saveAttendance(recordsToSave);
      fetchHistory();
      setSaveSuccess(true);
      setVerificationPending(false);

      setTimeout(() => {
        setSaveSuccess(false);
      }, 2500);
    } catch (err) {
      console.error(err);
      alert("Failed to save attendance records.");
    } finally {
      setSaving(false);
    }
  };

  // Export filtered attendance to CSV (FR-10)
  const exportHistoryCSV = () => {
    if (filteredHistory.length === 0) {
      alert("No attendance records to export.");
      return;
    }
    const headers = "Date,Subject,Student Name,Enrollment,Branch,Year,Division,Status,Method,Confidence\n";
    const rows = filteredHistory.map(r => {
      const s = students.find(st => st.uid === r.studentId);
      return `"${r.date}","${r.subject}","${r.studentName}","${s?.enrollmentNumber || 'N/A'}","${r.branch || ''}","${r.year || ''}","${r.division || ''}","${r.status}","${r.method}","${r.confidence ? Math.round(r.confidence * 100) + '%' : 'N/A'}"`;
    }).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance_report_${date}.csv`;
    link.click();
  };

  // Delete attendance record
  const handleDeleteRecord = (id: string) => {
    if (window.confirm("Delete this attendance entry?")) {
      storage.deleteAttendance(id);
      fetchHistory();
    }
  };

  // Filter attendance history
  const filteredHistory = allAttendance.filter(r => {
    const matchDate = !filterDate || r.date === filterDate;
    const matchStudent = !filterStudent || r.studentName.toLowerCase().includes(filterStudent.toLowerCase());
    const matchBranch = filterBranch === "All" || r.branch === filterBranch;
    const matchYear = filterYear === "All" || r.year === filterYear;
    const matchDivision = filterDivision === "All" || r.division === filterDivision;
    return matchDate && matchStudent && matchBranch && matchYear && matchDivision;
  });

  const presentCount = Object.values(attendance).filter(s => s === "present").length;
  const totalStudents = students.length;
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
            Group photo facial recognition with verification (FR-05 - FR-10)
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
            Attendance History ({allAttendance.length})
          </button>
        </div>
      </div>

      {activeTab === "take" ? (
        <div className="space-y-8">
          {/* Session Parameters & Stats Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass-card p-4">
              <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5 block">
                Session Date
              </label>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <CalendarIcon size={15} className="text-indigo-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent border-none text-white text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="glass-card p-4">
              <label className="text-[10px] uppercase font-bold tracking-wider text-white/40 mb-1.5 block">
                Lecture / Subject
              </label>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <BookOpen size={15} className="text-indigo-400" />
                <input
                  type="text"
                  value={sessionSubject}
                  onChange={(e) => setSessionSubject(e.target.value)}
                  placeholder="e.g. Database Management"
                  className="bg-transparent border-none text-white text-xs focus:outline-none w-full"
                />
              </div>
            </div>

            <div className="glass-card p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-white/40 block">Present Rate</span>
                <span className="text-xl font-extrabold text-emerald-400">{attendanceRate}%</span>
              </div>
              <div className="text-right text-[11px] text-white/50">
                <span className="text-white font-bold">{presentCount}</span> / {totalStudents} Students
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass-card p-4 flex items-center justify-between gap-2">
              <button
                onClick={() => markAll("present")}
                className="flex-1 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all"
              >
                All Present
              </button>
              <button
                onClick={() => markAll("absent")}
                className="flex-1 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all"
              >
                All Absent
              </button>
            </div>
          </div>

          {/* Group Photo AI Recognition Section (FR-05, FR-06, FR-07) */}
          <div className="glass-card p-8 border-indigo-500/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <ScanFace size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">Classroom Group Photo Recognition</h3>
                  <p className="text-[11px] text-white/50">Upload a group photo to detect and mark all students automatically</p>
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
                      Scanning Faces...
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

            {/* AI Detection Stat Counters (FR-06, FR-07) */}
            {detectedFaceCount !== null && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <span className="text-xs text-white/60">Total Faces Detected:</span>
                  <span className="text-lg font-bold text-white font-mono">{detectedFaceCount}</span>
                </div>
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                  <span className="text-xs text-emerald-300">Registered Identified:</span>
                  <span className="text-lg font-bold text-emerald-400 font-mono">{recognizedStudents.length}</span>
                </div>
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
                  <span className="text-xs text-amber-300">Unrecognized Faces:</span>
                  <span className="text-lg font-bold text-amber-400 font-mono">{unknownFaceCount}</span>
                </div>
              </div>
            )}

            {/* Visual Photo Canvas Display */}
            {uploadedImageSrc && (
              <div className="relative w-full max-h-[420px] rounded-2xl overflow-hidden bg-black/50 border border-white/10 flex items-center justify-center mb-6">
                <img
                  ref={imageRef}
                  src={uploadedImageSrc}
                  alt="Classroom Scan"
                  className="max-h-[420px] w-auto object-contain block"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none object-contain"
                />
              </div>
            )}

            {/* Verification Prompt (FR-09) */}
            {verificationPending && (
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
                  <span className="text-xs text-white">
                    <span className="font-semibold text-emerald-400">{recognizedStudents.length} students</span> matched from group photo. Review the attendance list below and make adjustments if needed before saving.
                  </span>
                </div>
                <button
                  onClick={handleConfirmAndSave}
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-500/25 shrink-0"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  Confirm & Save
                </button>
              </div>
            )}
          </div>

          {/* Student Attendance Verification Table (FR-08, FR-09) */}
          <div className="glass-card overflow-hidden">
            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <span className="text-xs font-bold text-white/50 uppercase tracking-wider">
                Student Attendance List ({students.length})
              </span>
              <div className="flex items-center gap-3">
                {saveSuccess && (
                  <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse">
                    <CheckCircle2 size={16} /> Attendance Saved to Supabase!
                  </span>
                )}
                <button
                  onClick={handleConfirmAndSave}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 disabled:opacity-50"
                >
                  <Save size={15} />
                  {saving ? "Saving..." : "Save Attendance"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-white/40 uppercase tracking-wider text-[10px] border-b border-white/5">
                  <tr>
                    <th className="py-3 px-6">Student</th>
                    <th className="py-3 px-6">Enrollment No.</th>
                    <th className="py-3 px-6">Division</th>
                    <th className="py-3 px-6">AI Detection Status</th>
                    <th className="py-3 px-6 text-center">Status</th>
                    <th className="py-3 px-6 text-right">Toggle Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  {students.map((student) => {
                    const status = attendance[student.uid] || "absent";
                    const isPresent = status === "present";
                    const match = recognizedStudents.find(m => m.id === student.uid);

                    return (
                      <tr key={student.uid} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-3">
                            {student.photoUrl ? (
                              <img
                                src={student.photoUrl}
                                alt={student.name}
                                className="w-9 h-9 rounded-full object-cover border border-white/10"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-indigo-500/10 text-indigo-400 font-bold flex items-center justify-center border border-white/10">
                                {student.name[0]}
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-white">{student.name}</div>
                              <div className="text-[10px] text-white/40">{student.branch || "CS"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-6 font-mono text-indigo-300">
                          {student.enrollmentNumber || "—"}
                        </td>
                        <td className="py-3.5 px-6 text-white/70">
                          {student.division || "Div A"}
                        </td>
                        <td className="py-3.5 px-6">
                          {match ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                              <Sparkles size={11} />
                              Recognized ({Math.round((1 - match.distance) * 100)}%)
                            </span>
                          ) : (
                            <span className="text-[10px] text-white/30">Manual verification</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              isPresent
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            )}
                          >
                            {isPresent ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                            {status}
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
        /* FR-10: Attendance History Section with Filters */
        <div className="space-y-6">
          {/* History Filter Bar */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
                <Filter size={14} className="text-indigo-400" />
                Filter Attendance Records (FR-10)
              </span>
              <button
                onClick={exportHistoryCSV}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center gap-2 transition-all"
              >
                <Download size={14} /> Export CSV Report
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
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
                <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Student</label>
                <input
                  type="text"
                  placeholder="Filter by name..."
                  value={filterStudent}
                  onChange={(e) => setFilterStudent(e.target.value)}
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

              <div>
                <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Division</label>
                <select
                  value={filterDivision}
                  onChange={(e) => setFilterDivision(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="All">All Divisions</option>
                  <option value="Div A">Division A</option>
                  <option value="Div B">Division B</option>
                  <option value="Div C">Division C</option>
                </select>
              </div>
            </div>
          </div>

          {/* Records Table */}
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between text-xs text-white/50">
              <span>Showing {filteredHistory.length} of {allAttendance.length} records</span>
              {(filterDate || filterStudent || filterBranch !== "All" || filterYear !== "All" || filterDivision !== "All") && (
                <button
                  onClick={() => {
                    setFilterDate("");
                    setFilterStudent("");
                    setFilterBranch("All");
                    setFilterYear("All");
                    setFilterDivision("All");
                  }}
                  className="text-indigo-400 hover:underline text-[11px]"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {filteredHistory.length === 0 ? (
              <div className="p-16 text-center text-white/30 space-y-2">
                <CalendarIcon size={32} className="mx-auto text-white/10" />
                <p className="text-xs uppercase font-bold tracking-widest">No matching attendance records found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-white/40 uppercase tracking-wider text-[10px] border-b border-white/5">
                    <tr>
                      <th className="py-3 px-6">Date</th>
                      <th className="py-3 px-6">Student</th>
                      <th className="py-3 px-6">Subject</th>
                      <th className="py-3 px-6">Class Info</th>
                      <th className="py-3 px-6">Method</th>
                      <th className="py-3 px-6">Status</th>
                      <th className="py-3 px-6 text-right">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/80">
                    {filteredHistory.map((rec) => (
                      <tr key={rec.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-6 font-mono text-white/60">{rec.date}</td>
                        <td className="py-3.5 px-6 font-semibold text-white">{rec.studentName}</td>
                        <td className="py-3.5 px-6 text-indigo-300">{rec.subject}</td>
                        <td className="py-3.5 px-6 text-white/50">
                          {rec.branch || "CS"} • {rec.division || "Div A"}
                        </td>
                        <td className="py-3.5 px-6">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 uppercase">
                            {rec.method} {rec.confidence ? `(${Math.round(rec.confidence * 100)}%)` : ""}
                          </span>
                        </td>
                        <td className="py-3.5 px-6">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase",
                              rec.status === "present"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : "bg-rose-500/10 text-rose-400"
                            )}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-right">
                          <button
                            onClick={() => handleDeleteRecord(rec.id)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceModule;
