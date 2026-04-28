import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Check, Download, Edit3, Eye, RefreshCw, Save, Star, Trash2, UploadCloud, X } from "lucide-react";
import { generateGlbThumbnail } from "../lib/thumbnail";
import { useFavorites } from "../lib/useFavorites";
import { useWorkspaceAuth } from "../lib/useWorkspaceAuth";
import { signOutCurrentUser, updateCurrentUserDisplayName } from "../lib/firebaseAuth";
import {
  apiApproveModelVersion,
  apiDeleteCurrentAccount,
  apiDeleteModelVersion,
  apiGetModelVersion,
  apiListModelVersions,
  buildDownloadUrl,
} from "../lib/workspaceApi";

function getUserInitial(authUser) {
  const source = authUser?.email || authUser?.uid || "U";
  return source.trim().charAt(0).toUpperCase();
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const { firebaseReady, authReady, authUser, idToken, authRole, emailVerified, authError } = useWorkspaceAuth();
  const { favorites, removeFavorite } = useFavorites(authUser?.uid);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [thumbnailInProgressId, setThumbnailInProgressId] = useState("");
  const [thumbnailFailedById, setThumbnailFailedById] = useState({});
  const [thumbnailsById, setThumbnailsById] = useState(() => {
    try {
      const raw = localStorage.getItem("cadrelay_thumbnails");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setProfileNameDraft(authUser?.displayName || "");
    setProfileMessage("");
  }, [authUser?.uid, authUser?.displayName]);

  useEffect(() => {
    // Загружаем список моделей текущего пользователя.
    if (!authUser || !idToken) return;
    let cancelled = false;

    async function loadRows() {
      setLoading(true);
      setError("");
      try {
        const list = await apiListModelVersions({ ownerUserId: authUser.uid, token: idToken, limit: 100 });
        if (!cancelled) setRows(list);
      } catch (err) {
        if (!cancelled) setError(String(err?.message || err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRows();
    return () => {
      cancelled = true;
    };
  }, [authUser, idToken]);

  useEffect(() => {
    if (!authUser || !idToken) return undefined;
    // Автопуллинг только pending/processing записей.
    const timer = setInterval(async () => {
      const processingIds = rows.filter((r) => r.status === "processing" || r.status === "uploaded").map((r) => r.id);
      if (processingIds.length === 0) return;

      try {
        const updates = await Promise.all(processingIds.map((id) => apiGetModelVersion(id, idToken)));
        setRows((prev) => {
          const byId = new Map(updates.map((u) => [u.id, u]));
          return prev.map((r) => byId.get(r.id) || r);
        });
      } catch {
        // Не блокируем интерфейс, ручной refresh всегда доступен.
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [rows, authUser, idToken]);

  useEffect(() => {
    try {
      localStorage.setItem("cadrelay_thumbnails", JSON.stringify(thumbnailsById));
    } catch {
      // Если localStorage недоступен, просто пропускаем кеш.
    }
  }, [thumbnailsById]);

  useEffect(() => {
    // Генерируем миниатюры только для ready-моделей с GLB.
    if (!authUser || !idToken || thumbnailInProgressId) return;
    const next = rows.find(
      (r) =>
        !r.storage_key_thumbnail_custom &&
        r.storage_key_glb &&
        !thumbnailsById[r.id] &&
        !thumbnailFailedById[r.id]
    );
    if (!next) return;

    setThumbnailInProgressId(next.id);
    const url = buildDownloadUrl({ modelVersionId: next.id, kind: "glb", token: idToken });
    generateGlbThumbnail(url)
      .then((png) => {
        if (!isMountedRef.current || !png) return;
        setThumbnailsById((prev) => ({ ...prev, [next.id]: png }));
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setThumbnailFailedById((prev) => ({ ...prev, [next.id]: true }));
      })
      .finally(() => {
        if (isMountedRef.current) setThumbnailInProgressId("");
      });
  }, [rows, thumbnailsById, thumbnailFailedById, thumbnailInProgressId, authUser, idToken]);

  const processingCount = useMemo(
    () => rows.filter((r) => r.status === "processing" || r.status === "uploaded").length,
    [rows]
  );

  async function refreshModels() {
    if (!authUser || !idToken) return;
    setLoading(true);
    setError("");
    try {
      const list = await apiListModelVersions({ ownerUserId: authUser.uid, token: idToken, limit: 100 });
      setRows(list);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function refreshOne(id) {
    setError("");
    try {
      const updated = await apiGetModelVersion(id, idToken);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(String(err?.message || err));
    }
  }

  async function approve(id, decision) {
    if (!emailVerified) {
      setError("Подтверди email, чтобы отправлять approve/reject.");
      return;
    }
    setError("");
    try {
      await apiApproveModelVersion({
        modelVersionId: id,
        decision,
        comment,
        actorUserId: authUser?.uid,
        token: idToken,
      });
      await refreshOne(id);
    } catch (err) {
      setError(String(err?.message || err));
    }
  }

  async function removeModelVersion(id) {
    if (!emailVerified) {
      setError("Подтверди email, чтобы удалять версии.");
      return;
    }
    setError("");
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
    } catch (err) {
      setError(String(err?.message || err));
    }
  }

  async function deleteAccount() {
    if (!idToken || !authUser) return;
    const confirmed = window.confirm(
      "Удалить аккаунт и все загруженные модели? Это действие нельзя отменить."
    );
    if (!confirmed) return;

    setAccountDeleting(true);
    setError("");
    try {
      await apiDeleteCurrentAccount(idToken);
      try {
        localStorage.removeItem("cadrelay_thumbnails");
        localStorage.removeItem(`cadrelay_favorites:${authUser.uid}`);
      } catch {
        // localStorage cleanup is best-effort.
      }
      await signOutCurrentUser();
      navigate("/auth", { replace: true });
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      if (isMountedRef.current) setAccountDeleting(false);
    }
  }

  async function saveProfileName() {
    setProfileMessage("");
    if (profileNameDraft.trim().length > 80) {
      setProfileMessage("Имя не должно быть длиннее 80 символов.");
      return;
    }
    setProfileSaving(true);
    try {
      await updateCurrentUserDisplayName(profileNameDraft);
      setProfileEditing(false);
      setProfileMessage("Имя профиля обновлено.");
    } catch (err) {
      setProfileMessage(String(err?.message || err));
    } finally {
      setProfileSaving(false);
    }
  }

  if (!firebaseReady) {
    return (
      <main className="page workspace-page">
        <section className="card">
          <h2>Workspace</h2>
          <p className="error">Firebase config не найден. Добавь VITE_FIREBASE_* в frontend/.env.local.</p>
        </section>
      </main>
    );
  }

  if (!authReady) {
    return (
      <main className="page workspace-page">
        <section className="card">
          <p className="muted">Проверяем вход...</p>
        </section>
      </main>
    );
  }

  if (!authUser) return <Navigate to="/auth" replace />;

  return (
    <main className="page workspace-page">
      <header className="page-header">
        <div>
          <p className="page-kicker">Workspace</p>
          <h1 className="page-title">Model Operations</h1>
          <p className="page-subtitle">Твои модели, версии, preview-артефакты и решения по review-пайплайну.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-primary" onClick={() => navigate("/workspace/new")}>
            <UploadCloud size={16} />
            Add model
          </button>
          <button type="button" className="button button-secondary" onClick={refreshModels} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="workspace-dashboard-top">
        <article className="card workspace-user-card">
          <div className="workspace-user-avatar">{getUserInitial(authUser)}</div>
          <div className="workspace-user-main">
            <div className="workspace-user-heading">
              <h2>Profile</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setProfileEditing((value) => !value)}
                aria-label="Edit profile name"
                title="Edit profile name"
              >
                <Edit3 size={16} />
              </button>
            </div>
            <p className="workspace-user-name">{authUser.displayName || authUser.email || "Unnamed user"}</p>
            <p className="muted">{authUser.email || authUser.uid}</p>
            <p className="muted">Role: {authRole}</p>
            <p className="muted">Email verified: {emailVerified ? "yes" : "no"}</p>
            {profileEditing ? (
              <div className="profile-edit-row">
                <input
                  value={profileNameDraft}
                  onChange={(e) => setProfileNameDraft(e.target.value)}
                  placeholder="Display name"
                  aria-label="Display name"
                />
                <button type="button" onClick={saveProfileName} disabled={profileSaving}>
                  <Save size={14} />
                  {profileSaving ? "Saving..." : "Save"}
                </button>
              </div>
            ) : null}
            {profileMessage ? <p className="muted">{profileMessage}</p> : null}
            <button
              type="button"
              className="button button-danger workspace-account-delete"
              onClick={deleteAccount}
              disabled={accountDeleting}
            >
              <Trash2 size={15} />
              {accountDeleting ? "Удаляем..." : "Удалить аккаунт"}
            </button>
          </div>
        </article>

        <article className="card workspace-actions-card">
          <h2>Review Controls</h2>
          <label>
            Comment for approve/reject
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Опционально" />
          </label>
          <span className="badge">processing: {processingCount}</span>
        </article>
      </section>

      <section className="metric-strip" aria-label="Workspace metrics">
        <div className="metric-tile">
          <span className="metric-label">Total</span>
          <span className="metric-value">{rows.length}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-label">Ready</span>
          <span className="metric-value">{rows.filter((r) => r.status === "ready").length}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-label">Processing</span>
          <span className="metric-value">{processingCount}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-label">Failed</span>
          <span className="metric-value">{rows.filter((r) => r.status === "failed").length}</span>
        </div>
      </section>

      <section className="card">
        <div className="row">
          <h2>Избранные модели</h2>
          <span className="muted">{favorites.length} items</span>
        </div>

        {favorites.length === 0 ? (
          <p className="muted">Сохраняй модели из Explore, чтобы быстро возвращаться к ним здесь.</p>
        ) : (
          <div className="workspace-model-grid">
            {favorites.map((model) => (
              <article key={model.id} className="model-card workspace-model-card">
                <button
                  type="button"
                  className="model-card-cover workspace-model-thumb-btn"
                  onClick={() => model.preview_available && navigate(`/workspace/render/${model.id}`)}
                  disabled={!model.preview_available}
                  title={model.preview_available ? "Смотреть в 3D" : "GLB пока не готов"}
                >
                  {idToken && model.custom_thumbnail_available ? (
                    <img
                      className="model-card-cover-img"
                      src={buildDownloadUrl({ modelVersionId: model.id, kind: "thumbnail", token: idToken })}
                      alt={`${model.model_name || model.model_id || model.id} thumbnail`}
                    />
                  ) : (
                    <span className="workspace-thumb-placeholder muted">{(model.source_format || "cad").toUpperCase()}</span>
                  )}
                </button>

                <div className="model-card-body workspace-model-main">
                  <h3>{model.model_name || model.model_id || model.id}</h3>
                  {model.model_description ? <p>{model.model_description}</p> : <p>{(model.source_format || "cad").toUpperCase()}</p>}
                  <div className="model-card-meta">
                    <span className={`workspace-status-chip workspace-status-${model.status || "unknown"}`}>
                      {model.status || "unknown"}
                    </span>
                    <span>{model.model_category || "uncategorized"}</span>
                  </div>
                  {Array.isArray(model.model_tags) && model.model_tags.length > 0 ? (
                    <p className="workspace-model-tags">{model.model_tags.join(", ")}</p>
                  ) : null}

                  <div className="workspace-model-actions">
                    {model.preview_available ? (
                      <button type="button" onClick={() => navigate(`/workspace/render/${model.id}`)}>
                        <Eye size={14} />
                        Смотреть в 3D
                      </button>
                    ) : (
                      <button type="button" disabled>
                        <Eye size={14} />
                        GLB не готов
                      </button>
                    )}
                    {idToken ? (
                      <a href={buildDownloadUrl({ modelVersionId: model.id, kind: "original", token: idToken })}>
                        <Download size={14} />
                        Оригинал
                      </a>
                    ) : null}
                    <button type="button" onClick={() => removeFavorite(model.id)}>
                      <Star size={14} fill="currentColor" />
                      Убрать
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="row">
          <h2>My uploaded models</h2>
          <span className="muted">{rows.length} items</span>
        </div>

        {rows.length === 0 ? (
          <p className="muted">Пока пусто. Добавь модель через кнопку справа.</p>
        ) : (
          <div className="workspace-model-grid">
            {rows.map((r, idx) => (
              <article key={r.id} className="model-card workspace-model-card">
                <button
                  type="button"
                  className={`model-card-cover workspace-model-thumb-btn model-card-cover-${(idx % 3) + 1}`}
                  onClick={() => r.storage_key_glb && navigate(`/workspace/render/${r.id}`)}
                  disabled={!r.storage_key_glb}
                  title={r.storage_key_glb ? "Open render page" : "GLB пока не готов"}
                >
                  {r.storage_key_thumbnail_custom ? (
                    <img
                      className="model-card-cover-img"
                      src={buildDownloadUrl({ modelVersionId: r.id, kind: "thumbnail", token: idToken })}
                      alt={`${r.id} custom thumbnail`}
                    />
                  ) : thumbnailsById[r.id] ? (
                    <img className="model-card-cover-img" src={thumbnailsById[r.id]} alt={`${r.id} thumbnail`} />
                  ) : thumbnailInProgressId === r.id ? (
                    <span className="workspace-thumb-placeholder muted">...</span>
                  ) : (
                    <span className="workspace-thumb-placeholder muted">No thumb</span>
                  )}
                </button>

                <div className="model-card-body workspace-model-main">
                  <h3>{r.model_name || r.model_id || r.id}</h3>
                  {r.model_description ? <p>{r.model_description}</p> : <p>{(r.source_format || "cad").toUpperCase()}</p>}
                  <div className="model-card-meta">
                    <span className={`workspace-status-chip workspace-status-${r.status || "unknown"}`}>{r.status || "unknown"}</span>
                    <span>{r.model_category || "uncategorized"}</span>
                  </div>
                  {Array.isArray(r.model_tags) && r.model_tags.length > 0 ? (
                    <p className="workspace-model-tags">{r.model_tags.join(", ")}</p>
                  ) : null}

                  <div className="workspace-model-actions">
                    <button type="button" onClick={() => refreshOne(r.id)}>
                      <RefreshCw size={14} />
                      Refresh
                    </button>
                    <button type="button" onClick={() => approve(r.id, "approve")} disabled={!emailVerified}>
                      <Check size={14} />
                      Approve
                    </button>
                    <button type="button" onClick={() => approve(r.id, "reject")} disabled={!emailVerified}>
                      <X size={14} />
                      Reject
                    </button>
                    <button type="button" onClick={() => removeModelVersion(r.id)} disabled={!emailVerified}>
                      <Trash2 size={14} />
                      Delete
                    </button>
                    {r.storage_key_glb ? (
                      <button type="button" onClick={() => navigate(`/workspace/render/${r.id}`)}>
                        <Eye size={14} />
                        Render
                      </button>
                    ) : (
                      <button type="button" disabled>
                        <Eye size={14} />
                        Render
                      </button>
                    )}
                    <a href={buildDownloadUrl({ modelVersionId: r.id, kind: "original", token: idToken })}>
                      <Download size={14} />
                      Original
                    </a>
                    {r.storage_key_glb ? (
                      <a href={buildDownloadUrl({ modelVersionId: r.id, kind: "glb", token: idToken })}>
                        <Download size={14} />
                        GLB
                      </a>
                    ) : (
                      <span className="workspace-link-disabled" aria-disabled="true">
                        GLB
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {authError ? <p className="error">{authError}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
