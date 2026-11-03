import React, { useState, useEffect, useRef } from "react";
import { storage, UserProfile } from "../services/storageService";
import { faceService } from "../services/faceRecognitionService";
import { 
  Users, 
  UserPlus, 
  Search, 
  Trash2, 
  Camera, 
  Mic, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  ScanFace, 
  GraduationCap, 
  RefreshCw, 
  Layers, 
  Filter,
  X,
  Upload
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface StudentManagementProps {
  teacher: UserProfile;
}

export const StudentManagementModule: React.FC<StudentManagementProps> = ({ teacher }) => {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("All");
  const [selectedYear, setSelectedYear] = useState("All");
  const [isRegistering, setIsRegistering] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [enrollment, setEnrollment] = useState("");
  const [branch, setBranch] = useState("Computer Science");
  const [year, setYear] = useState("Third Year");
  const [division, setDivision] = useState("Div A");
  const [email, setEmail] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);
  const [voiceSampleName, setVoiceSampleName] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const init = async () => {
      await storage.syncStudentsFromSupabase();
      loadStudents();
    };
    init();
  }, []);

  const loadStudents = () => {
    const list = storage.getStudents();
    setStudents(list);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate supported image formats (JPG, JPEG, PNG)
    const validMimes = ["image/jpeg", "image/png", "image/jpg"];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isValidExt = ["jpg", "jpeg", "png"].includes(ext || "");

    if (!validMimes.includes(file.type) && !isValidExt) {
      setFormError("Invalid file format. Please upload a JPG, JPEG, or PNG photograph.");
      setPhotoPreview(null);
      setPhotoFile(null);
      setFaceDescriptor(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setPhotoFile(file);
    setProcessingPhoto(true);
    setFormError("");
    setFaceDescriptor(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        setPhotoPreview(dataUrl);

        const img = new Image();
        img.src = dataUrl;
        img.onload = async () => {
          try {
            const descriptor = await faceService.getFaceEmbedding(img);
            if (descriptor && descriptor.length > 0) {
              setFaceDescriptor(Array.from(descriptor));
              setFormError("");
            } else {
              setFaceDescriptor(null);
              setFormError("Face detection failed. No face detected in this photo. Please upload a clear, front-facing photograph.");
            }
          } catch (err: any) {
            console.error("Face detection error:", err);
            setFaceDescriptor(null);
            setFormError("Face recognition processing failed. Please try again with a clearer photograph.");
          } finally {
            setProcessingPhoto(false);
          }
        };
        img.onerror = () => {
          setProcessingPhoto(false);
          setFaceDescriptor(null);
          setFormError("Failed to load selected image. Please try another JPG or PNG photo.");
        };
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("File reading error:", err);
      setProcessingPhoto(false);
      setFormError("Error reading photograph file. Please select another image.");
    }
  };

  const handleVoiceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVoiceSampleName(file.name);
    }
  };

  const handleRegisterStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // 1. Mandatory Name & Enrollment
    if (!name.trim() || !enrollment.trim()) {
      setFormError("Student Full Name and Enrollment Number are required.");
      return;
    }

    // 2. Mandatory Photo Upload Check
    if (!photoPreview) {
      setFormError("Student photograph is mandatory. Please upload a student photograph to register.");
      return;
    }

    // 3. Prevent submission while face detection is in progress
    if (processingPhoto) {
      setFormError("Please wait while the uploaded photograph is being analyzed for face detection.");
      return;
    }

    // 4. Mandatory Face Descriptor Check
    if (!faceDescriptor || faceDescriptor.length === 0) {
      setFormError("Face detection failed. A clear front-facing photograph with a detectable face is mandatory for attendance recognition.");
      return;
    }

    // 5. Check duplicate enrollment number
    const existing = students.find(
      s => s.enrollmentNumber?.toLowerCase() === enrollment.trim().toLowerCase()
    );
    if (existing) {
      setFormError(`A student with enrollment number '${enrollment}' already exists.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const studentUid = `student-${Math.random().toString(36).substr(2, 9)}`;

      const newStudent: UserProfile = {
        uid: studentUid,
        name: name.trim(),
        email: email.trim() || `${enrollment.toLowerCase()}@student.teachease.edu`,
        role: "student",
        enrollmentNumber: enrollment.trim(),
        branch,
        year,
        division,
        photoUrl: photoPreview,
        faceDescriptor: faceDescriptor,
        voiceSampleUrl: voiceSampleName ? `uploaded/${voiceSampleName}` : undefined,
      };

      // Save student: uploads photo to Supabase Storage, saves student record and face descriptor in Supabase DB, and saves to LocalStorage
      await storage.saveStudent(newStudent, photoFile || undefined);
      loadStudents();
      setFormSuccess(true);

      setTimeout(() => {
        resetForm();
        setIsRegistering(false);
        setFormSuccess(false);
        setIsSubmitting(false);
      }, 1000);
    } catch (err: any) {
      console.error("Student registration failed:", err);
      // Avoid creating partial records on upload failure
      setFormError(err.message || "Failed to register student. Please check storage bucket permissions and retry.");
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setEnrollment("");
    setEmail("");
    setBranch("Computer Science");
    setYear("Third Year");
    setDivision("Div A");
    setPhotoPreview(null);
    setPhotoFile(null);
    setFaceDescriptor(null);
    setVoiceSampleName(null);
    setFormError("");
    setIsSubmitting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (uid: string, studentName: string) => {
    if (window.confirm(`Are you sure you want to remove ${studentName}?`)) {
      storage.deleteStudent(uid);
      loadStudents();
    }
  };

  // Filter students
  const filteredStudents = students.filter(s => {
    const matchesQuery = 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.enrollmentNumber && s.enrollmentNumber.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesBranch = selectedBranch === "All" || s.branch === selectedBranch;
    const matchesYear = selectedYear === "All" || s.year === selectedYear;
    return matchesQuery && matchesBranch && matchesYear;
  });

  const branches = ["All", "Computer Science", "Information Technology", "Electronics", "Mechanical", "Civil"];
  const years = ["All", "First Year", "Second Year", "Third Year", "Final Year"];

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Users size={20} />
            </div>
            Student Directory & Registration
          </h2>
          <p className="text-xs text-white/50 mt-1">
            Manage academic records and register student photographs for facial recognition attendance
          </p>
        </div>

        <button
          onClick={() => {
            resetForm();
            setIsRegistering(!isRegistering);
          }}
          className="px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 shrink-0"
        >
          {isRegistering ? <X size={16} /> : <UserPlus size={16} />}
          {isRegistering ? "Cancel Registration" : "Register New Student"}
        </button>
      </div>

      {/* Registration Form Drawer / Card */}
      <AnimatePresence>
        {isRegistering && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card p-8 border-indigo-500/30 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-300">
                <Sparkles size={16} />
                Student Enrollment & Facial Embedding (FR-03, FR-04)
              </div>
              <span className="text-[10px] uppercase font-bold text-white/40 tracking-wider">
                Photo Upload Mandatory for Attendance
              </span>
            </div>

            <form onSubmit={handleRegisterStudent} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Personal Info */}
                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                    Student Full Name <span className="text-rose-400 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Aryan Sharma"
                    className="w-full p-3.5 bg-white/5 rounded-xl border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all placeholder:text-white/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                    Enrollment Number <span className="text-rose-400 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={enrollment}
                    onChange={(e) => setEnrollment(e.target.value)}
                    placeholder="e.g. EN2024-CS-042"
                    className="w-full p-3.5 bg-white/5 rounded-xl border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-indigo-500 transition-all placeholder:text-white/20"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                    Student Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. student@college.edu"
                    className="w-full p-3.5 bg-white/5 rounded-xl border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all placeholder:text-white/20"
                  />
                </div>
              </div>

              {/* Academic Hierarchy */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                    Branch / Department <span className="text-rose-400 font-bold">*</span>
                  </label>
                  <select
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full p-3.5 bg-black/40 rounded-xl border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Electronics">Electronics & Comm.</option>
                    <option value="Mechanical">Mechanical Engineering</option>
                    <option value="Civil">Civil Engineering</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                    Academic Year <span className="text-rose-400 font-bold">*</span>
                  </label>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full p-3.5 bg-black/40 rounded-xl border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="First Year">First Year (FE)</option>
                    <option value="Second Year">Second Year (SE)</option>
                    <option value="Third Year">Third Year (TE)</option>
                    <option value="Final Year">Final Year (BE)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                    Class Division <span className="text-rose-400 font-bold">*</span>
                  </label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full p-3.5 bg-black/40 rounded-xl border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="Div A">Division A</option>
                    <option value="Div B">Division B</option>
                    <option value="Div C">Division C</option>
                  </select>
                </div>
              </div>

              {/* Photo & Voice Sample Upload */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Mandatory Photograph & Face Embedding */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <ScanFace size={16} className="text-indigo-400" />
                      Student Photograph <span className="text-rose-400 font-bold text-sm">*</span>
                    </label>
                    {processingPhoto ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 animate-pulse">
                        <RefreshCw size={12} className="animate-spin" /> Detecting Face...
                      </span>
                    ) : faceDescriptor ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Descriptor Ready
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                        Mandatory Field
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50">
                    Upload a front-facing image (JPG, JPEG, or PNG). Our AI neural net generates the 128-D facial descriptor required for automated attendance marking.
                  </p>

                  <div className="flex items-center gap-4">
                    {photoPreview ? (
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-indigo-500/50 shrink-0 group">
                        <img src={photoPreview} alt="Student Preview" className="w-full h-full object-cover" />
                        {processingPhoto && (
                          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1">
                            <RefreshCw size={18} className="animate-spin text-indigo-400" />
                            <span className="text-[9px] text-white/80 font-medium">Scanning</span>
                          </div>
                        )}
                        {!processingPhoto && (
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              title="Change photo"
                              className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white transition-all"
                            >
                              <Upload size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoPreview(null);
                                setPhotoFile(null);
                                setFaceDescriptor(null);
                                if (fileInputRef.current) fileInputRef.current.value = "";
                              }}
                              title="Remove photo"
                              className="p-1.5 rounded-lg bg-rose-500/50 hover:bg-rose-500 text-white transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-24 h-24 rounded-xl bg-black/40 border-2 border-dashed border-white/20 hover:border-indigo-400/60 flex flex-col items-center justify-center text-white/40 hover:text-indigo-400 transition-all cursor-pointer shrink-0"
                      >
                        <Camera size={26} />
                        <span className="text-[9px] font-bold mt-1 uppercase tracking-wider text-white/40">Select Photo</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg,.jpg,.jpeg,.png"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={processingPhoto || isSubmitting}
                          className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-bold text-white flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          <Upload size={14} />
                          {processingPhoto ? "Analyzing Face..." : photoPreview ? "Change Photo" : "Upload Photograph *"}
                        </button>
                        {photoPreview && !processingPhoto && (
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoPreview(null);
                              setPhotoFile(null);
                              setFaceDescriptor(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="p-2.5 rounded-xl border border-white/10 hover:bg-rose-500/20 text-rose-300 text-xs transition-all"
                            title="Remove photo"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] text-white/40 block">
                        Accepted Formats: <strong className="text-white/60">JPG, JPEG, PNG</strong> (Max 10MB)
                      </span>
                      {faceDescriptor && (
                        <span className="text-[10px] text-emerald-400/90 flex items-center gap-1 font-medium">
                          <CheckCircle2 size={12} /> 128-D Facial Embedding extracted successfully
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Voice Sample Upload */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-2">
                      <Mic size={16} className="text-sky-400" />
                      Voice Sample (SRS FR-03 Optional)
                    </label>
                    {voiceSampleName && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                        <CheckCircle2 size={12} /> Attached
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50">
                    Audio recording or voice sample file if retained for academic participation records.
                  </p>

                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="audio/*"
                      ref={voiceInputRef}
                      onChange={handleVoiceUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => voiceInputRef.current?.click()}
                      className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-bold text-white flex items-center gap-2 transition-all"
                    >
                      <Mic size={14} className="text-sky-400" />
                      {voiceSampleName ? voiceSampleName : "Upload Audio / Voice Sample"}
                    </button>
                    <span className="text-[10px] text-white/30 block">MP3, WAV, M4A</span>
                  </div>
                </div>
              </div>

              {/* Error Banner */}
              {formError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  {formError}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  disabled={isSubmitting}
                  className="px-5 py-3 rounded-xl text-white/50 hover:text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processingPhoto || isSubmitting}
                  className="px-7 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 disabled:opacity-50"
                >
                  {formSuccess ? (
                    <>
                      <CheckCircle2 size={16} /> Registered Successfully!
                    </>
                  ) : isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Saving & Uploading Photo...
                    </>
                  ) : (
                    <>
                      <UserPlus size={16} /> Save & Register Student
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search student or enrollment..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="bg-black/30 border border-white/5 rounded-xl px-3 py-3 text-xs text-white/80 focus:outline-none focus:border-indigo-500/50"
          >
            {branches.map(b => (
              <option key={b} value={b}>Branch: {b}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-black/30 border border-white/5 rounded-xl px-3 py-3 text-xs text-white/80 focus:outline-none focus:border-indigo-500/50"
          >
            {years.map(y => (
              <option key={y} value={y}>Year: {y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Students Table / Grid */}
      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <span className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-2">
            <GraduationCap size={15} className="text-indigo-400" />
            Registered Students ({filteredStudents.length})
          </span>
          <span className="text-[10px] text-white/40">
            Total in Database: {students.length}
          </span>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Users size={36} className="mx-auto text-white/10" />
            <p className="text-xs uppercase font-bold tracking-widest text-white/30">
              No students match the criteria
            </p>
            <p className="text-[11px] text-white/40">
              Try adjusting your filters or click "Register New Student" to enroll.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/5 text-white/40 uppercase tracking-wider text-[10px] border-b border-white/5">
                <tr>
                  <th className="py-3 px-6">Student</th>
                  <th className="py-3 px-6">Enrollment No.</th>
                  <th className="py-3 px-6">Branch & Year</th>
                  <th className="py-3 px-6">Division</th>
                  <th className="py-3 px-6">Face Descriptor</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/80">
                {filteredStudents.map((student) => {
                  const hasFace = Boolean(student.faceDescriptor && student.faceDescriptor.length > 0);
                  return (
                    <tr key={student.uid} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {student.photoUrl ? (
                            <img
                              src={student.photoUrl}
                              alt={student.name}
                              className="w-10 h-10 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 font-bold flex items-center justify-center border border-white/10">
                              {student.name[0]}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-white">{student.name}</div>
                            <div className="text-[10px] text-white/40">{student.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 font-mono text-indigo-300">
                        {student.enrollmentNumber || "—"}
                      </td>
                      <td className="py-4 px-6">
                        <div>{student.branch || "General"}</div>
                        <div className="text-[10px] text-white/40">{student.year || "—"}</div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-medium text-white/80">
                          {student.division || "Div A"}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {hasFace ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Registered
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleDelete(student.uid, student.name)}
                          className="p-2 rounded-lg text-white/30 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete Student"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentManagementModule;
