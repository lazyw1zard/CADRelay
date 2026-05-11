import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import {
  getFirebaseConfigStatus,
  getAuthMode,
  getCurrentIdTokenResult,
  signInEmailPassword,
  signUpEmailPassword,
  watchAuthState,
} from "../lib/firebaseAuth";
import { formatErrorMessage } from "../lib/errorMessages";

export function AuthPage() {
  const firebaseReady = getFirebaseConfigStatus();
  const authProvider = getAuthMode();
  const navigate = useNavigate();

  const [authMode, setAuthMode] = useState("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [authUser, setAuthUser] = useState(null);
  const isSignup = authMode === "signup";

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
        if (authProvider === "postgres") {
          setInfo("Аккаунт создан.");
          navigate("/workspace");
        } else {
          setInfo("Аккаунт создан. Проверь почту и подтверди email, затем войди.");
        }
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
        <p>Auth config не найден. Проверь настройки VITE_AUTH_MODE или VITE_FIREBASE_*.</p>
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
      <div className="auth-page-header">
        <BrandMark size={48} className="auth-page-mark" />
        <div>
          <p className="page-kicker">Account</p>
          <h1>{isSignup ? "Создать аккаунт" : "Войти в MakeLayer"}</h1>
          <p className="muted">Доступ к загрузке, управлению моделями и приватным ссылкам.</p>
        </div>
      </div>

      <form className="auth-page-form" onSubmit={handleSubmit}>
        <div className="auth-page-mode">
          <button
            type="button"
            className={authMode === "signin" ? "auth-mode-active" : "auth-mode-idle"}
            onClick={() => {
              setAuthMode("signin");
              setError("");
              setInfo("");
            }}
          >
            Войти
          </button>
          <button
            type="button"
            className={authMode === "signup" ? "auth-mode-active" : "auth-mode-idle"}
            onClick={() => {
              setAuthMode("signup");
              setError("");
              setInfo("");
            }}
          >
            Регистрация
          </button>
        </div>

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </label>

        <label>
          Пароль
          <span className="auth-password-field">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={authMode === "signup" ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              title={showPassword ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>

        {authMode === "signup" ? (
          <label>
            Логин
            <input
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
        ) : null}

        {authMode === "signup" ? (
          <label>
            Повтори пароль
            <span className="auth-password-field">
              <input
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowConfirmPassword((value) => !value)}
                aria-label={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
                title={showConfirmPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
        ) : null}

        <button className="auth-submit" type="submit" disabled={busy}>
          {authMode === "signup" ? <UserPlus size={16} /> : <LogIn size={16} />}
          {busy ? "Обработка..." : authMode === "signup" ? "Создать аккаунт" : "Войти"}
        </button>
      </form>

      {info ? <p className="muted">{info}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}
