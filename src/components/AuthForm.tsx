
import React, { useState } from "react";
import { storage, UserProfile } from "../services/storageService";
import { LogIn, UserPlus, Mail, Lock, User, GraduationCap, Loader2 } from "lucide-react";
import { motion } from "motion/react";

interface AuthFormProps {
  onLogin: (user: UserProfile) => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        const user = await storage.login(email, password);
        onLogin(user);
      } else {
        if (!name.trim()) {
          setError("Please enter your full name");
          setLoading(false);
          return;
        }
        const newUser = await storage.register(name, email, password, role);
        onLogin(newUser);
      }
    } catch (err: any) {
      console.error("Auth action failed:", err);
      setError(err.message || "Authentication failed. Please verify your credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0e14] p-6">
      <div className="mesh-bg"></div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full glass-card p-10 space-y-8 relative z-10"
      >
        <div className="text-center">
          <h2 className="text-4xl font-extrabold tracking-tighter mb-2">
            Teach<span className="text-indigo-400">Ease</span>
          </h2>
          <p className="text-white/40 text-sm">
            {isLogin ? "Welcome back! Please login to your account." : "Create your account to get started."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                  <input 
                    type="text" 
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-indigo-500 transition-all font-medium" 
                    placeholder="John Doe"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">I am a</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={`py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${role === "teacher" ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/50" : "bg-white/5 text-white/40 border border-transparent"}`}
                  >
                    <GraduationCap size={16} /> Teacher
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={`py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${role === "student" ? "bg-sky-500/20 text-sky-400 border border-sky-500/50" : "bg-white/5 text-white/40 border border-transparent"}`}
                  >
                    <User size={16} /> Student
                  </button>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-indigo-500 transition-all font-medium" 
                placeholder="e.g. teacher@example.com"
              />
            </div>
            {isLogin && (
              <p className="text-[9px] text-white/20 mt-1 pl-1">
                Demo: teacher@example.com or student@example.com (Pass: password123)
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-indigo-500 transition-all font-medium" 
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-xs font-bold text-center">{error}</p>}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-400 transition-all shadow-xl active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Please wait...
              </>
            ) : (
              <>
                {isLogin ? <LogIn size={18} /> : <UserPlus size={18} />}
                {isLogin ? "Login to Workspace" : "Create Account"}
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-4">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs font-bold text-white/40 hover:text-white transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthForm;
