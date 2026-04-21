import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateGlbThumbnail } from "./lib/thumbnail";
import {
  getCurrentIdToken,
  getCurrentIdTokenResult,
  getFirebaseConfigStatus,
  refreshCurrentUser,
  resendVerificationEmail,
  signInEmailPassword,
  signUpEmailPassword,
  signOutCurrentUser,
  watchAuthState,
} from "./lib/firebaseAuth";

const API_BASE = "http://127.0.0.1:8000/api/v1";
// Компонент 3D-viewer грузим только когда он реально нужен (lazy-loading).
const GlbViewer = lazy(() => import("./components/GlbViewer").then((m) => ({ default: m.GlbViewer })));

function withAuthToken(url, token) {
  if (!token) return url;
  const qs = new URLSearchParams();
  qs.set("access_token", token);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${qs.toString()}`;
}

async function apiFetch(path, { token = "", method = "GET", headers = {}, body, cache = "no-store" } = {}) {
  const finalHeaders = new Headers(headers);
  if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(`${API_BASE}${path}`, { method, headers: finalHeaders, body, cache });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${method} ${path} failed (${resp.status}): ${text}`);
  }
  return resp;
}

// Получить актуальное состояние конкретной версии модели.
async function apiGetModelVersion(id, token) {
  const resp = await apiFetch(`/model-versions/${id}?ts=${Date.now()}`, { token });
  return resp.json();
}

// Получить список версий моделей (с фильтрацией по owner_user_id).
async function apiListModelVersions({ ownerUserId, token }) {
  const qs = new URLSearchParams();
  if (ownerUserId) qs.set("owner_user_id", ownerUserId);
  qs.set("limit", "100");
  const resp = await apiFetch(`/model-versions?${qs.toString()}`, { token });
  return resp.json();
}

// Загрузка файла модели в backend через multipart/form-data.
async function apiUpload({ modelId, sourceFormat, conversionProfile, file, ownerUserId, token }) {
  const form = new FormData();
  form.append("model_id", modelId);
  form.append("source_format", sourceFormat);
  form.append("conversion_profile", conversionProfile);
  if (ownerUserId) {
    form.append("owner_user_id", ownerUserId);
    form.append("created_by_user_id", ownerUserId);
    form.append("auth_provider", "dev");
    form.append("auth_subject", ownerUserId);
  }
  form.append("file", file);

  const resp = await apiFetch("/uploads", { token, method: "POST", body: form });
  return resp.json();
}

// Отправить решение клиента по модели (approve/reject + комментарий).
async function apiApproval(modelVersionId, decision, comment, ownerUserId, token) {
  const resp = await apiFetch(`/model-versions/${modelVersionId}/approval`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, comment: comment || null, created_by_user_id: ownerUserId || null }),
  });
  return resp.json();
}

async function apiDeleteModelVersion(modelVersionId, token) {
  const resp = await apiFetch(`/model-versions/${modelVersionId}`, { token, method: "DELETE" });
  return resp.json();
}

// Список пользователей для админского интерфейса ролей.
async function apiAdminListUsers({ token, limit = 50, pageToken = "" }) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (pageToken) qs.set("page_token", pageToken);
  const resp = await apiFetch(`/admin/users?${qs.toString()}`, { token });
  return resp.json();
}

// Назначение роли пользователю (только для admin).
async function apiAdminSetRole({ token, uid, role }) {
  const resp = await apiFetch(`/admin/users/${uid}/role`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return resp.json();
}

function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Math.round(Number(value))} ms`;
}

export function App() {
  const firebaseReady = getFirebaseConfigStatus();
  const [authUser, setAuthUser] = useState(null);
  const [authRole, setAuthRole] = useState("editor");
  // Локальный флаг: можно ли делать write/admin действия в UI.
  const [emailVerified, setEmailVerified] = useState(false);
  const [idToken, setIdToken] = useState("");
  const [authMode, setAuthMode] = useState("signin");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [demoUserId, setDemoUserId] = useState("demo_user_001");
  const [modelId, setModelId] = useState("model_demo_ui");
  const [sourceFormat, setSourceFormat] = useState("step");
  const [conversionProfile, setConversionProfile] = useState("balanced");
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");

  // Какая модель сейчас открыта в 3D-preview.
  const [previewModelVersionId, setPreviewModelVersionId] = useState("");
  // Метрики клиента: время загрузки GLB + треугольники.
  const [viewerLoadMs, setViewerLoadMs] = useState(null);
  const [viewerTriangles, setViewerTriangles] = useState(null);

  const [thumbnailInProgressId, setThumbnailInProgressId] = useState("");
  const [thumbnailFailedById, setThumbnailFailedById] = useState({});
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminRoleDraftByUid, setAdminRoleDraftByUid] = useState({});
  const [adminNextPageToken, setAdminNextPageToken] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminSavingUid, setAdminSavingUid] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [authInfo, setAuthInfo] = useState("");
  const [thumbnailsById, setThumbnailsById] = useState(() => {
    try {
      const raw = localStorage.getItem("cadrelay_thumbnails");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const previewSectionRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    const stop = watchAuthState(async (user) => {
      setAuthUser(user || null);
      // Для наглядности синхронизируем поле owner с uid текущего пользователя.
      setDemoUserId(user?.uid || "demo_user_001");
      if (!user) {
        setIdToken("");
        setAuthRole("editor");
        setEmailVerified(false);
        setAuthInfo("");
        setAdminUsers([]);
        setAdminRoleDraftByUid({});
        setAdminNextPageToken("");
        return;
      }
      try {
        // На каждом входе синхронизируем token + role + verify-статус.
        const token = await getCurrentIdToken();
        setIdToken(token || "");
        const tokenResult = await getCurrentIdTokenResult();
        const roleClaim = tokenResult?.claims?.role;
        setAuthRole(typeof roleClaim === "string" ? roleClaim : "editor");
        const verifiedClaim = tokenResult?.claims?.email_verified;
        setEmailVerified(Boolean(user.emailVerified || verifiedClaim));
      } catch {
        setIdToken("");
        setAuthRole("editor");
        setEmailVerified(Boolean(user.emailVerified));
      }
    });
    return stop;
  }, [firebaseReady]);

  useEffect(() => {
    // В dev StrictMode React делает mount->unmount->mount,
    // поэтому при каждом входе в эффект выставляем true заново.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialRows() {
      // В auth-режиме до входа не дергаем API, чтобы не получать лишний 401 в UI.
      if (firebaseReady && !idToken) {
        if (!cancelled) setRows([]);
        return;
      }
      setError("");
      try {
        const list = await apiListModelVersions({ ownerUserId: demoUserId, token: idToken });
        if (!cancelled) {
          setRows(list);
          // По умолчанию выбираем самую свежую модель со статусом ready.
          const firstReady = list.find((r) => r.storage_key_glb);
          if (firstReady) setPreviewModelVersionId(firstReady.id);
        }
      } catch (err) {
        if (!cancelled) setError(String(err.message || err));
      }
    }

    loadInitialRows();
    return () => {
      cancelled = true;
    };
  }, [demoUserId, idToken]);

  useEffect(() => {
    if (firebaseReady && !idToken) return undefined;
    // Автопуллинг только для строк в processing.
    const timer = setInterval(async () => {
      const processingIds = rows.filter((r) => r.status === "processing").map((r) => r.id);
      if (processingIds.length === 0) return;

      try {
        const updates = await Promise.all(processingIds.map((id) => apiGetModelVersion(id, idToken)));
        setRows((prev) => {
          const byId = new Map(updates.map((u) => [u.id, u]));
          return prev.map((r) => byId.get(r.id) || r);
        });
      } catch {
        // Ошибки автопуллинга не блокируют UI; ручной Refresh всегда доступен.
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [rows, idToken, firebaseReady]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setError("");
    setAuthInfo("");
    if (!firebaseReady) {
      setError("Firebase config не настроен в frontend/.env.local");
      return;
    }
    const email = loginEmail.trim();
    if (!email) {
      setError("Укажи email");
      return;
    }
    if (loginPassword.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (authMode === "signup" && loginPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        await signUpEmailPassword(email, loginPassword);
        // После signup backend-запись не откроется до подтверждения email.
        setAuthInfo("Письмо подтверждения отправлено. Проверь почту и подтверди email.");
      } else {
        await signInEmailPassword(email, loginPassword);
      }
      const token = await getCurrentIdToken();
      setIdToken(token || "");
      const tokenResult = await getCurrentIdTokenResult();
      const roleClaim = tokenResult?.claims?.role;
      setAuthRole(typeof roleClaim === "string" ? roleClaim : "editor");
      const verifiedClaim = tokenResult?.claims?.email_verified;
      // Берем verify-флаг из claims, чтобы UI работал одинаково после reload.
      setEmailVerified(Boolean(verifiedClaim));
      setConfirmPassword("");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResendVerification() {
    setError("");
    setAuthInfo("");
    setVerifyBusy(true);
    try {
      await resendVerificationEmail();
      setAuthInfo("Письмо подтверждения отправлено повторно.");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleRefreshVerification() {
    setError("");
    setAuthInfo("");
    setVerifyBusy(true);
    try {
      const refreshedUser = await refreshCurrentUser();
      setAuthUser(refreshedUser);
      const token = await getCurrentIdToken(true);
      setIdToken(token || "");
      const tokenResult = await getCurrentIdTokenResult();
      const verifiedClaim = tokenResult?.claims?.email_verified;
      // Считаем verified, если это видно в user или уже пришло в token claims.
      const isVerified = Boolean(refreshedUser?.emailVerified || verifiedClaim);
      setEmailVerified(isVerified);
      if (isVerified) {
        setAuthInfo("Email подтвержден. Ограничения сняты.");
      } else {
        setAuthInfo("Email пока не подтвержден.");
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setVerifyBusy(false);
    }
  }

  async function handleSignOut() {
    setError("");
    setAuthInfo("");
    setAuthBusy(true);
    try {
      await signOutCurrentUser();
      setIdToken("");
      setAuthRole("editor");
      setEmailVerified(false);
      setRows([]);
      setPreviewModelVersionId("");
      setAdminUsers([]);
      setAdminRoleDraftByUid({});
      setAdminNextPageToken("");
      setAdminError("");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    setError("");
    // До подтверждения email не даем создавать новые записи.
    if (!emailVerified) {
      setError("Подтверди email, чтобы загружать модели.");
      return;
    }
    if (!file) {
      setError("Выбери файл");
      return;
    }

    setLoading(true);
    try {
      // После загрузки сразу показываем новую строку в таблице.
      const data = await apiUpload({
        modelId,
        sourceFormat,
        conversionProfile,
        file,
        ownerUserId: demoUserId,
        token: idToken,
      });
      const row = data.model_version;
      setRows((prev) => [row, ...prev]);
      // Если раньше thumbnail для этого id был помечен fail, сбрасываем метку.
      setThumbnailFailedById((prev) => {
        if (!prev[row.id]) return prev;
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function refreshOne(id) {
    setError("");
    try {
      // Ручной polling статуса для одной версии.
      const updated = await apiGetModelVersion(id, idToken);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  async function approve(id, decision) {
    setError("");
    if (!emailVerified) {
      setError("Подтверди email, чтобы отправлять approve/reject.");
      return;
    }
    try {
      // Сохраняем решение, затем перечитываем статус строки.
      await apiApproval(id, decision, comment, demoUserId, idToken);
      await refreshOne(id);
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  async function removeModelVersion(id) {
    setError("");
    if (!emailVerified) {
      setError("Подтверди email, чтобы удалять версии.");
      return;
    }
    try {
      await apiDeleteModelVersion(id, idToken);
      setRows((prev) => prev.filter((r) => r.id !== id));
      setThumbnailsById((prev) => {
        if (!prev[id]) return prev;
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setThumbnailFailedById((prev) => {
        if (!prev[id]) return prev;
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      if (previewModelVersionId === id) {
        setPreviewModelVersionId("");
        setViewerLoadMs(null);
        setViewerTriangles(null);
      }
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  const processingCount = useMemo(
    // Кол-во строк в processing для индикатора нагрузки.
    () => rows.filter((r) => r.status === "processing").length,
    [rows]
  );

  const previewRow = useMemo(() => rows.find((r) => r.id === previewModelVersionId) || null, [rows, previewModelVersionId]);

  const previewUrl = previewRow?.storage_key_glb
    ? withAuthToken(`${API_BASE}/model-versions/${previewRow.id}/download?kind=glb`, idToken)
    : "";

  const handleViewerLoadMetrics = useCallback(({ loadMs, triangles }) => {
    setViewerLoadMs(loadMs);
    setViewerTriangles(triangles);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("cadrelay_thumbnails", JSON.stringify(thumbnailsById));
    } catch {
      // Если хранилище недоступно, просто пропускаем кэш thumbnails.
    }
  }, [thumbnailsById]);

  useEffect(() => {
    // Генерируем thumbnail автоматически для ready-моделей, даже без ручного Preview.
    if (thumbnailInProgressId) return;
    const next = rows.find((r) => r.storage_key_glb && !thumbnailsById[r.id] && !thumbnailFailedById[r.id]);
    if (!next) return;

    setThumbnailInProgressId(next.id);
    const url = withAuthToken(`${API_BASE}/model-versions/${next.id}/download?kind=glb`, idToken);

    generateGlbThumbnail(url)
      .then((png) => {
        if (!isMountedRef.current || !png) return;
        setThumbnailsById((prev) => ({ ...prev, [next.id]: png }));
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        // Не зацикливаемся на битой модели: помечаем failed для thumb.
        setThumbnailFailedById((prev) => ({ ...prev, [next.id]: true }));
      })
      .finally(() => {
        if (isMountedRef.current) setThumbnailInProgressId("");
      });
  }, [rows, thumbnailsById, thumbnailInProgressId, thumbnailFailedById, idToken]);

  function handleOpenPreview(row) {
    setPreviewModelVersionId(row.id);
    setViewerLoadMs(null);
    setViewerTriangles(null);
    previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadAdminUsers({ append = false } = {}) {
    if (!idToken) return;
    // Админ-операции в UI дополнительно блокируем до verify email.
    if (!emailVerified) {
      setAdminError("Подтверди email, чтобы управлять пользователями.");
      return;
    }
    setAdminError("");
    setAdminLoading(true);
    try {
      const data = await apiAdminListUsers({
        token: idToken,
        limit: 50,
        pageToken: append ? adminNextPageToken : "",
      });
      const incoming = Array.isArray(data.users) ? data.users : [];
      setAdminUsers((prev) => (append ? [...prev, ...incoming] : incoming));
      setAdminRoleDraftByUid((prev) => {
        const next = { ...prev };
        for (const row of incoming) {
          if (!next[row.uid]) next[row.uid] = row.role;
        }
        return next;
      });
      setAdminNextPageToken(data.next_page_token || "");
    } catch (err) {
      setAdminError(String(err.message || err));
    } finally {
      setAdminLoading(false);
    }
  }

  async function saveUserRole(uid) {
    if (!idToken) return;
    if (!emailVerified) {
      setAdminError("Подтверди email, чтобы менять роли.");
      return;
    }
    const role = adminRoleDraftByUid[uid];
    if (!role) return;
    setAdminError("");
    setAdminSavingUid(uid);
    try {
      const updated = await apiAdminSetRole({ token: idToken, uid, role });
      setAdminUsers((prev) => prev.map((row) => (row.uid === uid ? updated : row)));
      // Если админ меняет роль себе, сразу обновим локальную роль UI.
      if (authUser?.uid === uid) {
        setAuthRole(updated.role);
      }
    } catch (err) {
      setAdminError(String(err.message || err));
    } finally {
      setAdminSavingUid("");
    }
  }

  return (
    <main className="page">
      <h1>CADRelay MVP</h1>
      <p className="muted">Upload - processing - ready</p>
      <section className="card">
        <div className="row">
          <h2>Auth</h2>
          {authUser ? (
            <span className="badge">uid: {authUser.uid}</span>
          ) : (
            <span className="badge">not signed in</span>
          )}
        </div>
        {!firebaseReady ? (
          <p className="muted">Firebase config не найден. Добавь VITE_FIREBASE_* в frontend/.env.local.</p>
        ) : authUser ? (
          <div className="actions">
            <p className="muted">{authUser.email || authUser.uid}</p>
            <p className="muted">Role: {authRole}</p>
            <p className="muted">Email verified: {emailVerified ? "yes" : "no"}</p>
            {!emailVerified ? (
              <>
                <button type="button" onClick={handleResendVerification} disabled={verifyBusy}>
                  {verifyBusy ? "Отправка..." : "Resend verification"}
                </button>
                <button type="button" onClick={handleRefreshVerification} disabled={verifyBusy}>
                  {verifyBusy ? "Проверка..." : "I verified my email"}
                </button>
              </>
            ) : null}
            <button type="button" onClick={handleSignOut} disabled={authBusy}>
              {authBusy ? "Выход..." : "Sign out"}
            </button>
          </div>
        ) : (
          <form onSubmit={handleAuthSubmit}>
            <div className="auth-mode">
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
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
            </label>
            {authMode === "signup" ? (
              <label>
                Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </label>
            ) : null}
            <button type="submit" disabled={authBusy}>
              {authBusy ? "Обработка..." : authMode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>
        )}
        {authInfo ? <p className="muted">{authInfo}</p> : null}
      </section>

      {authUser && authRole === "admin" ? (
        <section className="card">
          <div className="row">
            <h2>Admin: Users & Roles</h2>
            <button
              type="button"
              onClick={() => loadAdminUsers({ append: false })}
              disabled={adminLoading || !emailVerified}
            >
              {adminLoading ? "Loading..." : "Refresh users"}
            </button>
          </div>

          {adminUsers.length === 0 ? (
            <p className="muted">Пользователи пока не загружены.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>UID</th>
                  <th>Email</th>
                  <th>Verified</th>
                  <th>Role</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((u) => (
                  <tr key={u.uid}>
                    <td>{u.uid}</td>
                    <td>{u.email || "-"}</td>
                    <td>{u.email_verified ? "yes" : "no"}</td>
                    <td>
                      <select
                        value={adminRoleDraftByUid[u.uid] || u.role}
                        disabled={!emailVerified || adminSavingUid === u.uid}
                        onChange={(e) =>
                          setAdminRoleDraftByUid((prev) => ({ ...prev, [u.uid]: e.target.value }))
                        }
                      >
                        <option value="viewer">viewer</option>
                        <option value="editor">editor</option>
                        <option value="reviewer">reviewer</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => saveUserRole(u.uid)}
                        disabled={adminSavingUid === u.uid || !emailVerified}
                      >
                        {adminSavingUid === u.uid ? "Saving..." : "Apply"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {adminNextPageToken ? (
            <button
              type="button"
              onClick={() => loadAdminUsers({ append: true })}
              disabled={adminLoading || !emailVerified}
            >
              {adminLoading ? "Loading..." : "Load more"}
            </button>
          ) : null}
          {adminError ? <p className="error">{adminError}</p> : null}
        </section>
      ) : null}

      <form className="card" onSubmit={handleUpload}>
        <label>
          Demo User ID
          <input value={demoUserId} onChange={(e) => setDemoUserId(e.target.value)} />
        </label>

        <label>
          Model ID
          <input value={modelId} onChange={(e) => setModelId(e.target.value)} />
        </label>

        <label>
          Format
          <select value={sourceFormat} onChange={(e) => setSourceFormat(e.target.value)}>
            <option value="step">step</option>
            <option value="stp">stp</option>
            <option value="iges">iges</option>
            <option value="igs">igs</option>
          </select>
        </label>

        <label>
          Conversion Profile
          <select value={conversionProfile} onChange={(e) => setConversionProfile(e.target.value)}>
            <option value="fast">fast (быстрее, грубее)</option>
            <option value="balanced">balanced (по умолчанию)</option>
            <option value="high">high (точнее, тяжелее)</option>
          </select>
        </label>

        <label>
          File
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        {!emailVerified ? <p className="muted">Подтверди email, чтобы загружать и изменять данные.</p> : null}
        <button disabled={loading || !emailVerified}>{loading ? "Загрузка..." : "Upload"}</button>
      </form>

      <section className="card">
        <div className="row">
          <h2>Model Versions</h2>
          <span className="badge">processing: {processingCount}</span>
        </div>

        <label>
          Комментарий для approve/reject
          <input value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>

        {rows.length === 0 ? (
          <p className="muted">Пока пусто. Загрузите файл.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Thumb</th>
                <th>ID</th>
                <th>Status</th>
                <th>Source</th>
                <th>GLB</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {thumbnailsById[r.id] ? (
                      <img className="table-thumb" src={thumbnailsById[r.id]} alt={`${r.id} thumbnail`} />
                    ) : thumbnailInProgressId === r.id ? (
                      <span className="muted">...</span>
                    ) : (
                      <span className="muted">-</span>
                    )}
                  </td>
                  <td>{r.id}</td>
                  <td>{r.status}</td>
                  <td>{r.storage_key_original || "-"}</td>
                  <td>{r.storage_key_glb || "-"}</td>
                  <td>
                    <div className="actions">
                      <button type="button" onClick={() => refreshOne(r.id)}>Refresh</button>
                      <button type="button" onClick={() => approve(r.id, "approve")} disabled={!emailVerified}>Approve</button>
                      <button type="button" onClick={() => approve(r.id, "reject")} disabled={!emailVerified}>Reject</button>
                      <button type="button" onClick={() => removeModelVersion(r.id)} disabled={!emailVerified}>Delete</button>
                      <a href={withAuthToken(`${API_BASE}/model-versions/${r.id}/download?kind=original`, idToken)}>
                        Download Original
                      </a>
                      {r.storage_key_glb ? (
                        <>
                          <a href={withAuthToken(`${API_BASE}/model-versions/${r.id}/download?kind=glb`, idToken)}>
                            Download GLB
                          </a>
                          <button type="button" onClick={() => handleOpenPreview(r)}>Preview</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" ref={previewSectionRef}>
        <div className="row">
          <h2>GLB Preview</h2>
          {previewRow ? <span className="badge">{previewRow.id}</span> : null}
        </div>

        {!previewRow || !previewRow.storage_key_glb ? (
          <p className="muted">Выбери строку со статусом ready и нажми Preview.</p>
        ) : (
          <>
            <div className="metrics">
              <div>profile: {previewRow.conversion_profile || "-"}</div>
              <div>conversion: {formatMs(previewRow.conversion_ms)}</div>
              <div>viewer load: {formatMs(viewerLoadMs)}</div>
              <div>triangles: {viewerTriangles ?? "-"}</div>
            </div>

            <Suspense fallback={<p className="muted">Загружаем 3D viewer...</p>}>
              <GlbViewer glbUrl={previewUrl} onLoadMetrics={handleViewerLoadMetrics} />
            </Suspense>
          </>
        )}
      </section>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
