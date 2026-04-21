import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

let appInstance = null;
let authInstance = null;

function isFirebaseConfigured() {
  // Проверяем минимум env-полей для запуска Firebase SDK.
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

export async function signUpEmailPassword(email, password) {
  const auth = getFirebaseAuth();
  const credentials = await createUserWithEmailAndPassword(auth, email, password);
  // Сразу отправляем письмо подтверждения после регистрации.
  await sendEmailVerification(credentials.user);
  return credentials;
}

export async function signOutCurrentUser() {
  const auth = getFirebaseAuth();
  await signOut(auth);
}

export async function getCurrentIdToken(forceRefresh = false) {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return "";
  // forceRefresh=true нужен после verify email, чтобы получить свежие claims.
  return auth.currentUser.getIdToken(forceRefresh);
}

export async function getCurrentIdTokenResult() {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdTokenResult();
}

export async function resendVerificationEmail() {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return;
  // Повторно шлем verification email текущему пользователю.
  await sendEmailVerification(auth.currentUser);
}

export async function refreshCurrentUser() {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) return null;
  // Обновляем пользователя из Firebase (актуализирует emailVerified).
  await auth.currentUser.reload();
  return auth.currentUser;
}
