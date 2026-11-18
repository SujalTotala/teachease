import { UserProfile } from "../services/storageService";
import { supabaseAuth } from "../services/supabaseService";

// Mock implementation of Firestore errors for compatibility
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: any, type: OperationType, path: string) {
  console.error(`Storage Error [${type}] at ${path}:`, error);
}

// Auth state helper with persistent localStorage
export const getLocalUser = (): UserProfile | null => {
  try {
    const data = localStorage.getItem("teachease_session");
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn("Failed to parse teachease_session:", err);
    return null;
  }
};

export const setLocalSession = (user: UserProfile) => {
  try {
    localStorage.setItem("teachease_session", JSON.stringify(user));
  } catch (err) {
    console.warn("Failed to set teachease_session:", err);
  }
};

export const clearLocalSession = () => {
  try {
    localStorage.removeItem("teachease_session");
  } catch (err) {
    console.warn("Failed to remove teachease_session:", err);
  }
};

// Compatibility exports
export const db = {};
export const auth = {
  get currentUser() {
    return getLocalUser();
  }
};

export const loginWithGoogle = () => {
  console.log("Google Login disabled. Use centralized authentication.");
};

export const logout = async () => {
  try {
    await supabaseAuth.signOut();
  } catch (err) {
    console.warn("Supabase signOut error during logout:", err);
  }
  clearLocalSession();
  window.location.reload();
};
