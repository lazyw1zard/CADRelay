import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

let appInstance = null;
let authInstance = null;

function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

function getFirebaseAuth() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase config is missing. Set VITE_FIREBASE_* variables in frontend/.env.local");
  }
  if (!appInstance) {
    appInstance = initializeApp(firebaseConfig);
  }
  if (!authInstance) {
    authInstance = getAuth(appInstance);
  }
  return authInstance;
}

export function getFirebaseConfigStatus() {
  return isFirebaseConfigured();
}

export function watchAuthState(callback) {
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

export async function signInEmailPassword(email, password) {
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOutCurrentUser() {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export async function getCurrentIdToken() {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return "";
  return auth.currentUser.getIdToken();
}
