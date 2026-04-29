import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LogIn, UserPlus } from "lucide-react";
import {
  getFirebaseConfigStatus,
  getCurrentIdTokenResult,
  signInEmailPassword,
  signUpEmailPassword,
  watchAuthState,
} from "../lib/firebaseAuth";
import { formatErrorMessage } from "../lib/errorMessages";

export function AuthPage() {
  const firebaseReady = getFirebaseConfigStatus();
  const navigate = useNavigate();

  const [authMode, setAuthMode] = useState("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [authUser, setAuthUser] = useState(null);

  useEffect(() => {
    // Если пользователь уже вошел, страницу логина не показываем.
    if (!firebaseReady) return undefined;
    const stop = watchAuthState((user) => {
      setAuthUser(user || null);
      setAuthReady(true);
    });
    return stop;
  }, [firebaseReady]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    const cleanedEmail = email.trim();
    if (!cleanedEmail) {
      setError("Укажи email");
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (authMode === "signup" && password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    if (authMode === "signup" && displayName.trim().length > 80) {
      setError("Имя не должно быть длиннее 80 символов");
      return;
    }

    setBusy(true);
    try {
      if (authMode === "signup") {
        await signUpEmailPassword(cleanedEmail, password, displayName);
        setInfo("Аккаунт создан. Проверь почту и подтверди email, затем войди.");
      } else {
        await signInEmailPassword(cleanedEmail, password);
        const tokenResult = await getCurrentIdTokenResult();
        const isVerified = Boolean(tokenResult?.claims?.email_verified);
        if (!isVerified) {
          setInfo("Вход выполнен, но email не подтвержден.");
        }
        navigate("/workspace");
      }
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось войти или создать аккаунт."));
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseReady) {
    return (
      <section className="auth-page-card">
        <h1>Auth</h1>
        <p>Firebase config не найден. Добавь VITE_FIREBASE_* в frontend/.env.local.</p>
      </section>
    );
  }

  if (!authReady) {
    return (
      <section className="auth-page-card">
        <h1>Auth</h1>
        <p>Проверяем вход...</p>
      </section>
    );
  }

  if (authUser) return <Navigate to="/workspace" replace />;

  return (
    <section className="auth-page-card">
      <h1>Sign in / Sign up</h1>
      <p className="muted">Войди, чтобы получить доступ к загрузке и управлению моделями.</p>

      <form className="auth-page-form" onSubmit={handleSubmit}>
        <div className="auth-page-mode">
          <button
            type="button"
            className={authMode === "signin" ? "auth-mode-active" : "auth-mode-idle"}
            onClick={() => setAuthMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={authMode === "signup" ? "auth-mode-active" : "auth-mode-idle"}
            onClick={() => setAuthMode("signup")}
          >
            Sign up
          </button>
        </div>

        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete={authMode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {authMode === "signup" ? (
          <label>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Например: Denis" />
          </label>
        ) : null}

        {authMode === "signup" ? (
          <label>
            Confirm password
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </label>
        ) : null}

        <button type="submit" disabled={busy}>
          {authMode === "signup" ? <UserPlus size={16} /> : <LogIn size={16} />}
          {busy ? "Обработка..." : authMode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      {info ? <p className="muted">{info}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}
