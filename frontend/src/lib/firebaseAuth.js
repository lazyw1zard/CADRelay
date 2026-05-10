import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

const API_BASE = import.meta.env.VITE_API_BASE || "/api/v1";
const AUTH_MODE = (import.meta.env.VITE_AUTH_MODE || "").trim().toLowerCase();
const POSTGRES_SESSION_STORAGE_KEY = "makelayer_auth_session";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

let appInstance = null;
let authInstance = null;
let postgresSession = readPostgresSession();
const postgresListeners = new Set();

function isFirebaseConfigured() {
  // Проверяем минимум env-полей для запуска Firebase SDK.
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

function getAuthMode() {
  if (AUTH_MODE === "postgres" || AUTH_MODE === "firebase") return AUTH_MODE;
  return "firebase";
}

function readPostgresSession() {
  try {
    const raw = window.localStorage.getItem(POSTGRES_SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePostgresSession(session) {
  postgresSession = session;
  try {
    if (session) {
      window.localStorage.setItem(POSTGRES_SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(POSTGRES_SESSION_STORAGE_KEY);
    }
  } catch {
    // localStorage can be unavailable in private/locked contexts.
  }
  notifyPostgresListeners();
}

function toPostgresUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: user.display_name || "",
    emailVerified: Boolean(user.email_verified),
  };
}

function notifyPostgresListeners() {
  const user = toPostgresUser(postgresSession?.user);
  for (const listener of postgresListeners) {
    listener(user);
  }
}

async function postgresFetch(path, { method = "GET", token = "", body } = {}) {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${method} ${path} failed (${resp.status}): ${text}`);
  }
  return resp;
}

async function refreshPostgresSession() {
  const token = postgresSession?.access_token || "";
  if (!token) return null;
  const resp = await postgresFetch("/auth/me", { token });
  const user = await resp.json();
  writePostgresSession({ ...postgresSession, user });
  return toPostgresUser(user);
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
  if (getAuthMode() === "postgres") return true;
  return isFirebaseConfigured();
}

export function watchAuthState(callback) {
  if (getAuthMode() === "postgres") {
    postgresListeners.add(callback);
    callback(toPostgresUser(postgresSession?.user));
    return () => postgresListeners.delete(callback);
  }
  const auth = getFirebaseAuth();
  return onAuthStateChanged(auth, callback);
}

export async function signInEmailPassword(email, password) {
  if (getAuthMode() === "postgres") {
    const resp = await postgresFetch("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    const session = await resp.json();
    writePostgresSession(session);
    return { user: toPostgresUser(session.user) };
  }
  const auth = getFirebaseAuth();
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpEmailPassword(email, password, displayName = "") {
  if (getAuthMode() === "postgres") {
    const resp = await postgresFetch("/auth/signup", {
      method: "POST",
      body: { email, password, display_name: displayName },
    });
    const session = await resp.json();
    writePostgresSession(session);
    return { user: toPostgresUser(session.user) };
  }
  const auth = getFirebaseAuth();
  const credentials = await createUserWithEmailAndPassword(auth, email, password);
  const cleanedName = displayName.trim();
  if (cleanedName) {
    await updateProfile(credentials.user, { displayName: cleanedName });
  }
  // Сразу отправляем письмо подтверждения после регистрации.
  await sendEmailVerification(credentials.user);
  return credentials;
}

export async function signOutCurrentUser() {
  if (getAuthMode() === "postgres") {
    const token = postgresSession?.access_token || "";
    try {
      if (token) await postgresFetch("/auth/logout", { method: "POST", token });
    } finally {
      writePostgresSession(null);
    }
    return;
  }
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export async function getCurrentIdToken(forceRefresh = false) {
  if (getAuthMode() === "postgres") {
    if (forceRefresh) await refreshPostgresSession();
    return postgresSession?.access_token || "";
  }
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return "";
  // forceRefresh=true нужен после verify email, чтобы получить свежие claims.
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function getCurrentIdTokenResult() {
  if (getAuthMode() === "postgres") {
    const user = postgresSession?.user;
    if (!user) return null;
    return {
      claims: {
        role: user.role || "editor",
        email_verified: Boolean(user.email_verified),
      },
    };
  }
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdTokenResult();
}

export async function resendVerificationEmail() {
  if (getAuthMode() === "postgres") return;
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return;
  // Повторно шлем verification email текущему пользователю.
  await sendEmailVerification(auth.currentUser);
}

export async function refreshCurrentUser() {
  if (getAuthMode() === "postgres") {
    return refreshPostgresSession();
  }
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return null;
  // Обновляем пользователя из Firebase (актуализирует emailVerified).
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function updateCurrentUserDisplayName(displayName) {
  if (getAuthMode() === "postgres") {
    const token = postgresSession?.access_token || "";
    if (!token) throw new Error("No authenticated user");
    const resp = await postgresFetch("/me/profile", {
      method: "PATCH",
      token,
      body: { display_name: displayName },
    });
    const user = await resp.json();
    writePostgresSession({ ...postgresSession, user });
    return toPostgresUser(user);
  }
  const auth = getFirebaseAuth();
  if (!auth.currentUser) throw new Error("No authenticated user");
  const cleanedName = displayName.trim();
  await updateProfile(auth.currentUser, { displayName: cleanedName || null });
  await auth.currentUser.reload();
  return auth.currentUser;
}

export { getAuthMode };
