import React, { useState, useRef } from "react";
import { setLocalSession } from "../lib/firebase";
import { storage, UserProfile } from "../services/storageService";
import { 
  GraduationCap, 
  BookOpen, 
  UserCircle, 
  Briefcase, 
  Hash, 
  GraduationCap as StudentIcon, 
  Mic, 
  Camera, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Upload, 
  Trash2,
  ScanFace
} from "lucide-react";
import { motion } from "motion/react";
import { faceService } from "../services/faceRecognitionService";
import { cn } from "../lib/utils";

interface ProfileRegistrationProps {
  user: UserProfile;
  onComplete: () => void;
}

const ProfileRegistration: React.FC<ProfileRegistrationProps> = ({ user, onComplete }) => {
  const [role, setRole] = useState<"teacher" | "student" | null>(user.role || null);
  const [step, setStep] = useState(role ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Teacher fields
  const [department, setDepartment] = useState("");
  const [subject, setSubject] = useState("");

  // Student fields
  const [enrollment, setEnrollment] = useState("");
  const [year, setYear] = useState("");
  const [branch, setBranch] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<number[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image format (JPG, JPEG, PNG)
    const validMimes = ["image/jpeg", "image/png", "image/jpg"];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isValidExt = ["jpg", "jpeg", "png"].includes(ext || "");

    if (!validMimes.includes(file.type) && !isValidExt) {
      setErrorMessage("Invalid file format. Please upload a JPG, JPEG, or PNG photograph.");
      setPhotoPreview(null);
      setPhotoFile(null);
      setFaceDescriptor(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setPhotoFile(file);
    setAiLoading(true);
    setErrorMessage("");
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
              setErrorMessage("");
            } else {
              setFaceDescriptor(null);
              setErrorMessage("Face detection failed. No face detected in this photo. Please upload a clear, front-facing photograph.");
            }
          } catch (err: any) {
            console.error("Face detection error:", err);
            setFaceDescriptor(null);
            setErrorMessage("Face recognition processing failed. Please try again with a clearer photograph.");
          } finally {
            setAiLoading(false);
          }
        };
        img.onerror = () => {
          setAiLoading(false);
          setFaceDescriptor(null);
          setErrorMessage("Failed to load selected image. Please try another JPG or PNG photo.");
        };
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setAiLoading(false);
      setErrorMessage("Error reading photograph file. Please select another image.");
    }
  };

  const handleFinish = async () => {
    setErrorMessage("");

    if (role === "teacher") {
      if (!department.trim() || !subject.trim()) {
        setErrorMessage("Please fill in Department and Subject.");
        return;
      }
    } else if (role === "student") {
      if (!enrollment.trim() || !year.trim() || !branch.trim()) {
        setErrorMessage("Please fill in Enrollment Number, Year, and Branch.");
        return;
      }
      if (!photoPreview) {
        setErrorMessage("Student photograph is mandatory. Please upload a student photograph to complete registration.");
        return;
      }
      if (aiLoading) {
        setErrorMessage("Please wait while your photograph is being analyzed for face detection.");
        return;
      }
      if (!faceDescriptor || faceDescriptor.length === 0) {
        setErrorMessage("Face detection failed. A clear front-facing photograph with a detectable face is mandatory for attendance recognition.");
        return;
      }
    }

    setLoading(true);
    try {
      const updatedUser: UserProfile = {
        ...user,
        role: role!,
        ...(role === "teacher" 
          ? { department, subject } 
          : { 
              enrollmentNumber: enrollment, 
              year, 
              branch, 
              photoUrl: photoPreview || undefined,
              faceDescriptor: faceDescriptor || undefined 
            })
      };

      if (role === "student") {
        await storage.saveStudent(updatedUser, photoFile || undefined);
      } else {
        storage.saveUser(updatedUser);
      }

      setLocalSession(updatedUser);
      onComplete();
    } catch (err: any) {
      console.error("Profile registration failed", err);
      setErrorMessage(err.message || "Failed to complete registration. Please check storage permissions and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0c0e14] p-6 overflow-y-auto">
      <div className="mesh-bg"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl w-full glass-card p-10 space-y-8 my-8"
      >
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tighter mb-2">Complete your <span className="text-indigo-400">Profile</span></h2>
          <p className="text-white/40 text-sm">To provide the best AI experience, we need a few more details.</p>
        </div>

        {step === 1 && (
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => { setRole("teacher"); setStep(2); }}
              className="p-8 glass-card border-none bg-white/5 hover:bg-indigo-500/10 hover:ring-2 hover:ring-indigo-500/50 transition-all flex flex-col items-center gap-4 group"
            >
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                <GraduationCap size={40} />
              </div>
              <span className="font-bold tracking-tight">I am a Teacher</span>
            </button>
            <button 
              onClick={() => { setRole("student"); setStep(2); }}
              className="p-8 glass-card border-none bg-white/5 hover:bg-sky-500/10 hover:ring-2 hover:ring-sky-500/50 transition-all flex flex-col items-center gap-4 group"
            >
              <div className="w-16 h-16 rounded-2xl bg-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
                <StudentIcon size={40} />
              </div>
              <span className="font-bold tracking-tight">I am a Student</span>
            </button>
          </div>
        )}

        {step === 2 && role === "teacher" && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                  Department <span className="text-rose-400 font-bold">*</span>
                </label>
                <div className="relative">
                  <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                  <input 
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Science, Humanities"
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                  Subject <span className="text-rose-400 font-bold">*</span>
                </label>
                <div className="relative">
                  <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                  <input 
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Physics, History"
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                {errorMessage}
              </div>
            )}

            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="flex-1 py-4 border border-white/10 rounded-xl font-bold hover:bg-white/5 transition-all">Back</button>
              <button 
                onClick={handleFinish} 
                disabled={!department || !subject || loading}
                className="flex-[2] py-4 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-400 transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Finish Registration"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && role === "student" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                  Enrollment Number <span className="text-rose-400 font-bold">*</span>
                </label>
                <div className="relative">
                  <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                  <input 
                    type="text"
                    value={enrollment}
                    onChange={(e) => setEnrollment(e.target.value)}
                    placeholder="XYZ-202X-001"
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                  Year <span className="text-rose-400 font-bold">*</span>
                </label>
                <input 
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="e.g. 2024"
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">
                  Branch <span className="text-rose-400 font-bold">*</span>
                </label>
                <input 
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="e.g. CS, ME"
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>
            </div>
            
            {/* Mandatory Student Photograph Section */}
            <div className="p-5 bg-indigo-500/5 border border-indigo-500/20 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-2">
                  <ScanFace size={16} className="text-indigo-400" />
                  Student Photograph <span className="text-rose-400 font-bold text-sm">*</span>
                </label>
                {aiLoading ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 animate-pulse">
                    <RefreshCw size={12} className="animate-spin" /> Detecting Face...
                  </span>
                ) : faceDescriptor ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Face Scan Extracted
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                    Mandatory Field
                  </span>
                )}
              </div>
              
              <p className="text-[11px] text-white/50">
                A front-facing photograph is required to create your biometric identity for automated attendance recognition.
              </p>

              <div className="flex items-center gap-4">
                {photoPreview ? (
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-indigo-500/50 shrink-0 group">
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    {aiLoading ? (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <RefreshCw size={16} className="animate-spin text-indigo-400" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          title="Change photo"
                          className="p-1 rounded-md bg-white/20 hover:bg-white/40 text-white transition-all"
                        >
                          <Upload size={12} />
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
                          className="p-1 rounded-md bg-rose-500/50 hover:bg-rose-500 text-white transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-20 h-20 rounded-xl bg-black/40 border-2 border-dashed border-white/20 hover:border-indigo-400/60 flex flex-col items-center justify-center text-white/40 hover:text-indigo-400 transition-all cursor-pointer shrink-0"
                  >
                    <Camera size={22} />
                    <span className="text-[8px] font-bold mt-1 uppercase tracking-wider text-white/40">Select Photo</span>
                  </div>
                )}

                <div className="space-y-2">
                  <input 
                    type="file" 
                    accept="image/jpeg,image/png,image/jpg,.jpg,.jpeg,.png" 
                    ref={fileInputRef}
                    className="hidden" 
                    onChange={handlePhotoUpload} 
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={aiLoading}
                      className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-bold text-white flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                      <Upload size={14} />
                      {aiLoading ? "Scanning Face..." : photoPreview ? "Change Photo" : "Upload Photograph *"}
                    </button>
                    {photoPreview && !aiLoading && (
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoPreview(null);
                          setPhotoFile(null);
                          setFaceDescriptor(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="p-2 rounded-xl border border-white/10 hover:bg-rose-500/20 text-rose-300 text-xs transition-all"
                        title="Remove photo"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-white/30 block">
                    Accepted: <strong className="text-white/50">JPG, JPEG, PNG</strong> (Max 10MB)
                  </span>
                  {faceDescriptor && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle2 size={12} /> 128-D Biometric Embedding ready
                    </span>
                  )}
                </div>
              </div>

              <div className="w-full h-px bg-white/5" />

              <div className="flex items-center gap-3 opacity-30 cursor-not-allowed">
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                  <Mic size={14} />
                </div>
                <span className="text-[8px] font-bold uppercase tracking-widest leading-none">Voice ID <br/><span className="text-[6px] opacity-50">(Future Integration)</span></span>
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                {errorMessage}
              </div>
            )}

            <div className="flex gap-4">
              <button 
                type="button" 
                onClick={() => setStep(1)} 
                disabled={loading}
                className="flex-1 py-4 border border-white/10 rounded-xl font-bold hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Back
              </button>
              <button 
                type="button" 
                onClick={handleFinish} 
                disabled={!enrollment || !year || !branch || !faceDescriptor || loading || aiLoading}
                className="flex-[2] py-4 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-400 transition-all shadow-lg active:scale-95 disabled:opacity-50"
              >
                {loading ? "Saving..." : "Finish Registration"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ProfileRegistration;
