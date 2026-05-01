import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Download,
  Edit3,
  Eye,
  MoreHorizontal,
  RefreshCw,
  Save,
  ShieldCheck,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { ModelEditPanel } from "../components/ModelEditPanel";
import { generateGlbThumbnail } from "../lib/thumbnail";
import { formatErrorMessage } from "../lib/errorMessages";
import { useFavorites } from "../lib/useFavorites";
import { useWorkspaceAuth } from "../lib/useWorkspaceAuth";
import { signOutCurrentUser, updateCurrentUserDisplayName } from "../lib/firebaseAuth";
import {
  apiDeleteCurrentAccount,
  apiDeleteModelVersion,
  apiFullUpdateModelVersion,
  apiGetModelVersion,
  apiListModelCategories,
  apiListModelVersions,
  apiReactToModelVersion,
  buildDownloadUrl,
} from "../lib/workspaceApi";

function getUserInitial(authUser) {
  const source = authUser?.email || authUser?.uid || "U";
  return source.trim().charAt(0).toUpperCase();
}

function renderModelTitle(model) {
  return model.model_name || model.model_id || model.id;
}

function formatTagsInput(tags) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const { firebaseReady, authReady, authUser, idToken, authRole, emailVerified, authError } = useWorkspaceAuth();
  const { favorites, removeFavorite, loadFavorites, loadingFavorites, favoritesError } = useFavorites(authUser?.uid, idToken);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [editingModelId, setEditingModelId] = useState("");
  const [editDraft, setEditDraft] = useState({
    modelName: "",
    modelDescription: "",
    modelCategory: "",
    modelTags: "",
    sourceFormat: "step",
    conversionProfile: "balanced",
    modelFile: null,
    thumbnailFile: null,
  });
  const [editSaving, setEditSaving] = useState(false);
  const [reactionById, setReactionById] = useState({});
  const [reactionSavingId, setReactionSavingId] = useState("");
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
        if (!cancelled) setError(formatErrorMessage(err, "Не удалось загрузить твои модели."));
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
    let cancelled = false;
    async function loadCategories() {
      try {
        const rows = await apiListModelCategories();
        if (!cancelled) setCategories(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    }
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const previewRows = [...favorites, ...rows];
    const next = previewRows.find(
      (r) =>
        !r.storage_key_thumbnail_custom &&
        (r.storage_key_glb || r.preview_available) &&
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
  }, [rows, favorites, thumbnailsById, thumbnailFailedById, thumbnailInProgressId, authUser, idToken]);

  const processingCount = useMemo(
    () => rows.filter((r) => r.status === "processing" || r.status === "uploaded").length,
    [rows]
  );
  const editingModel = useMemo(
    () => rows.find((row) => row.id === editingModelId) || null,
    [rows, editingModelId]
  );

  async function refreshModels() {
    if (!authUser || !idToken) return;
    setLoading(true);
    setError("");
    try {
      const list = await apiListModelVersions({ ownerUserId: authUser.uid, token: idToken, limit: 100 });
      setRows(list);
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось обновить список моделей."));
    } finally {
      setLoading(false);
    }
  }

  function startEditModel(model) {
    setEditingModelId(model.id);
    setEditDraft({
      modelName: model.model_name || "",
      modelDescription: model.model_description || "",
      modelCategory: model.model_category || "",
      modelTags: formatTagsInput(model.model_tags),
      sourceFormat: model.source_format || "step",
      conversionProfile: model.conversion_profile || "balanced",
      modelFile: null,
      thumbnailFile: null,
    });
  }

  function cancelEditModel() {
    setEditingModelId("");
    setEditDraft({
      modelName: "",
      modelDescription: "",
      modelCategory: "",
      modelTags: "",
      sourceFormat: "step",
      conversionProfile: "balanced",
      modelFile: null,
      thumbnailFile: null,
    });
  }

  async function saveEditedModel(event) {
    event.preventDefault();
    const modelVersionId = editingModelId;
    if (!modelVersionId) return;
    if (!emailVerified) {
      setError("Подтверди email, чтобы редактировать модели.");
      return;
    }
    if (!editDraft.modelName.trim()) {
      setError("Укажи название модели.");
      return;
    }
    setEditSaving(true);
    setError("");
    try {
      const updated = await apiFullUpdateModelVersion({
        modelVersionId,
        token: idToken,
        modelName: editDraft.modelName.trim(),
        modelDescription: editDraft.modelDescription.trim(),
        modelCategory: editDraft.modelCategory,
        modelTags: editDraft.modelTags,
        sourceFormat: editDraft.sourceFormat,
        conversionProfile: editDraft.conversionProfile,
        file: editDraft.modelFile,
        thumbnailFile: editDraft.thumbnailFile,
      });
      setRows((prev) => prev.map((row) => (row.id === modelVersionId ? updated : row)));
      if (editDraft.modelFile || editDraft.thumbnailFile) {
        setThumbnailsById((prev) => {
          if (!prev[modelVersionId]) return prev;
          const copy = { ...prev };
          delete copy[modelVersionId];
          return copy;
        });
        setThumbnailFailedById((prev) => {
          if (!prev[modelVersionId]) return prev;
          const copy = { ...prev };
          delete copy[modelVersionId];
          return copy;
        });
      }
      cancelEditModel();
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось сохранить модель."));
    } finally {
      setEditSaving(false);
    }
  }

  async function reactToModel(modelVersionId, decision) {
    if (!emailVerified) {
      setError("Подтверди email, чтобы оценивать модели.");
      return;
    }
    setReactionSavingId(modelVersionId);
    setError("");
    try {
      await apiReactToModelVersion({ modelVersionId, decision, token: idToken });
      setReactionById((prev) => ({ ...prev, [modelVersionId]: decision }));
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось сохранить оценку модели."));
    } finally {
      setReactionSavingId("");
    }
  }

  async function removeModelVersion(id) {
    if (!emailVerified) {
      setError("Подтверди email, чтобы удалять версии.");
      return;
    }
    const confirmed = window.confirm("Удалить модель? Это действие нельзя отменить.");
    if (!confirmed) return;
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
      setError(formatErrorMessage(err, "Не удалось удалить модель."));
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
      } catch {
        // localStorage cleanup is best-effort.
      }
      await signOutCurrentUser();
      navigate("/auth", { replace: true });
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось удалить аккаунт."));
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
      setProfileMessage(formatErrorMessage(err, "Не удалось обновить имя профиля."));
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
          <h1 className="page-title">Рабочее пространство</h1>
          <p className="page-subtitle">Твои модели, версии, preview-артефакты и решения по review-пайплайну.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-primary" onClick={() => navigate("/workspace/new")}>
            <UploadCloud size={16} />
            Добавить модель
          </button>
          <button type="button" className="button button-secondary" onClick={refreshModels} disabled={loading}>
            <RefreshCw size={16} />
            {loading ? "Обновляем..." : "Обновить"}
          </button>
        </div>
      </header>

      <section className="workspace-dashboard-top">
        <article className="card workspace-user-card">
          <div className="workspace-user-avatar">{getUserInitial(authUser)}</div>
          <div className="workspace-user-main">
            <div className="workspace-user-heading">
              <div>
                <p className="page-kicker">Profile</p>
                <h2>Профиль</h2>
              </div>
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
            <div className="workspace-profile-meta">
              <span>{authUser.email || authUser.uid}</span>
              <span>role: {authRole}</span>
              <span className={emailVerified ? "workspace-verified" : ""}>
                <ShieldCheck size={13} />
                {emailVerified ? "email verified" : "email not verified"}
              </span>
            </div>
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
            {profileMessage ? <p className="muted" aria-live="polite">{profileMessage}</p> : null}
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
          <div className="workspace-panel-heading">
            <div>
              <p className="page-kicker">Operations</p>
              <h2>Состояние библиотеки</h2>
            </div>
            <span className="badge">processing: {processingCount}</span>
          </div>
          <p className="muted">Карточки показывают готовность preview, файлы для скачивания и быстрые действия с моделью.</p>
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

      <section className="card workspace-library-section workspace-favorites-section">
        <div className="row workspace-section-heading">
          <div>
            <p className="page-kicker">Saved</p>
            <h2>Избранное</h2>
          </div>
          <div className="toolbar">
            <span className="badge">{loadingFavorites ? "загрузка" : `${favorites.length}`}</span>
            <button type="button" className="btn-ghost" onClick={loadFavorites} disabled={loadingFavorites}>
              <RefreshCw size={14} />
              Обновить
            </button>
          </div>
        </div>

        {loadingFavorites && favorites.length === 0 ? (
          <div className="state-panel state-panel-compact" aria-live="polite">
            <RefreshCw size={18} />
            <p>Загружаем избранное...</p>
          </div>
        ) : !loadingFavorites && favorites.length === 0 ? (
          <div className="workspace-empty-state">
            <Star size={18} />
            <p className="muted">Пока пусто. Отмеченные модели появятся здесь после сохранения в Explore.</p>
            <button type="button" className="button button-secondary" onClick={() => navigate("/")}>
              Перейти в Explore
            </button>
          </div>
        ) : (
          <div className="workspace-model-grid" aria-busy={loadingFavorites}>
            {favorites.map((model, idx) => (
              <article key={model.id} className="model-card workspace-model-card workspace-favorite-card">
                <button
                  type="button"
                  className={`model-card-cover workspace-model-thumb-btn model-card-cover-${(idx % 3) + 1}`}
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
                  ) : thumbnailsById[model.id] ? (
                    <img className="model-card-cover-img" src={thumbnailsById[model.id]} alt={`${model.id} thumbnail`} />
                  ) : thumbnailInProgressId === model.id ? (
                    <span className="workspace-thumb-placeholder muted">...</span>
                  ) : (
                    <span className="workspace-thumb-placeholder muted">{(model.source_format || "cad").toUpperCase()}</span>
                  )}
                </button>

                <div className="model-card-body workspace-model-main">
                  <h3>{renderModelTitle(model)}</h3>
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

                  <div className="workspace-model-actions workspace-model-actions-primary">
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
                    <details className="workspace-menu">
                      <summary>
                        <Download size={14} />
                        Скачать
                        <ChevronDown size={13} />
                      </summary>
                      <div className="workspace-menu-popover">
                        {idToken ? (
                          <a href={buildDownloadUrl({ modelVersionId: model.id, kind: "original", token: idToken })}>Оригинал</a>
                        ) : null}
                        {model.preview_available ? (
                          <a href={buildDownloadUrl({ modelVersionId: model.id, kind: "glb", token: idToken })}>GLB</a>
                        ) : (
                          <span>GLB не готов</span>
                        )}
                      </div>
                    </details>
                  </div>
                  <div className="workspace-model-footer">
                    <div className="workspace-reaction-actions" aria-label="Оценка модели">
                      <button
                        type="button"
                        className={reactionById[model.id] === "like" ? "workspace-reaction-active workspace-reaction-like-active" : ""}
                        onClick={() => reactToModel(model.id, "like")}
                        disabled={reactionSavingId === model.id}
                        aria-label="Лайк"
                      >
                        <ThumbsUp size={14} />
                      </button>
                      <button
                        type="button"
                        className={reactionById[model.id] === "dislike" ? "workspace-reaction-active workspace-reaction-dislike-active" : ""}
                        onClick={() => reactToModel(model.id, "dislike")}
                        disabled={reactionSavingId === model.id}
                        aria-label="Дизлайк"
                      >
                        <ThumbsDown size={14} />
                      </button>
                    </div>
                    <details className="workspace-menu workspace-menu-right">
                      <summary>
                        <MoreHorizontal size={14} />
                        Действия
                      </summary>
                      <div className="workspace-menu-popover">
                        <button type="button" onClick={() => removeFavorite(model.id)}>
                          <Star size={14} fill="currentColor" />
                          Убрать из избранного
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="row">
          <div>
            <p className="page-kicker">Library</p>
            <h2>Мои модели</h2>
          </div>
          <span className="badge">{rows.length} items</span>
        </div>

        {loading && rows.length === 0 ? (
          <div className="state-panel state-panel-compact" aria-live="polite">
            <RefreshCw size={18} />
            <p>Загружаем твои модели...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="workspace-empty-state">
            <UploadCloud size={18} />
            <p className="muted">Пока пусто. Добавь первую модель, чтобы проверить загрузку и 3D preview.</p>
            <button type="button" className="button button-primary" onClick={() => navigate("/workspace/new")}>
              <UploadCloud size={15} />
              Добавить модель
            </button>
          </div>
        ) : (
          <div className="workspace-model-grid" aria-busy={loading}>
            {rows.map((r, idx) => (
              <article key={r.id} className="model-card workspace-model-card">
                <button
                  type="button"
                  className={`model-card-cover workspace-model-thumb-btn model-card-cover-${(idx % 3) + 1}`}
                  onClick={() => r.storage_key_glb && navigate(`/workspace/render/${r.id}`)}
                  disabled={!r.storage_key_glb}
                  title={r.storage_key_glb ? "Смотреть в 3D" : "GLB пока не готов"}
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
                  <h3>{renderModelTitle(r)}</h3>
                  {r.model_description ? <p>{r.model_description}</p> : <p>{(r.source_format || "cad").toUpperCase()}</p>}
                  <div className="model-card-meta">
                    <span className={`workspace-status-chip workspace-status-${r.status || "unknown"}`}>{r.status || "unknown"}</span>
                    <span>{r.model_category || "uncategorized"}</span>
                  </div>
                  {Array.isArray(r.model_tags) && r.model_tags.length > 0 ? (
                    <p className="workspace-model-tags">{r.model_tags.join(", ")}</p>
                  ) : null}
                  {r.updated_at ? (
                    <p className="workspace-updated-at">Изменено: {formatDateTime(r.updated_at)}</p>
                  ) : null}

                  <div className="workspace-model-actions workspace-model-actions-primary">
                    {r.storage_key_glb ? (
                      <button type="button" onClick={() => navigate(`/workspace/render/${r.id}`)}>
                        <Eye size={14} />
                        Смотреть в 3D
                      </button>
                    ) : (
                      <button type="button" disabled>
                        <Eye size={14} />
                        GLB не готов
                      </button>
                    )}
                    <details className="workspace-menu">
                      <summary>
                        <Download size={14} />
                        Скачать
                        <ChevronDown size={13} />
                      </summary>
                      <div className="workspace-menu-popover">
                        <a href={buildDownloadUrl({ modelVersionId: r.id, kind: "original", token: idToken })}>Оригинал</a>
                        {r.storage_key_glb ? (
                          <a href={buildDownloadUrl({ modelVersionId: r.id, kind: "glb", token: idToken })}>GLB</a>
                        ) : (
                          <span>GLB не готов</span>
                        )}
                      </div>
                    </details>
                  </div>

                  <div className="workspace-model-footer">
                    <div className="workspace-reaction-actions" aria-label="Оценка модели">
                      <button
                        type="button"
                        className={reactionById[r.id] === "like" ? "workspace-reaction-active workspace-reaction-like-active" : ""}
                        onClick={() => reactToModel(r.id, "like")}
                        disabled={reactionSavingId === r.id}
                        aria-label="Лайк"
                      >
                        <ThumbsUp size={14} />
                      </button>
                      <button
                        type="button"
                        className={reactionById[r.id] === "dislike" ? "workspace-reaction-active workspace-reaction-dislike-active" : ""}
                        onClick={() => reactToModel(r.id, "dislike")}
                        disabled={reactionSavingId === r.id}
                        aria-label="Дизлайк"
                      >
                        <ThumbsDown size={14} />
                      </button>
                    </div>
                    <details className="workspace-menu workspace-menu-right">
                      <summary>
                        <MoreHorizontal size={14} />
                        Действия
                      </summary>
                      <div className="workspace-menu-popover">
                        <button type="button" onClick={() => startEditModel(r)} disabled={!emailVerified}>
                          <Edit3 size={14} />
                          Редактировать
                        </button>
                        <button
                          type="button"
                          className="workspace-menu-danger"
                          onClick={() => removeModelVersion(r.id)}
                          disabled={!emailVerified}
                        >
                          <Trash2 size={14} />
                          Удалить
                        </button>
                      </div>
                    </details>
                  </div>

                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {authError ? <p className="error" role="alert">{authError}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {favoritesError ? <p className="error" role="alert">{favoritesError}</p> : null}

      <ModelEditPanel
        model={editingModel}
        idToken={idToken}
        thumbnail={editingModel ? thumbnailsById[editingModel.id] : ""}
        categories={categories}
        draft={editDraft}
        onDraftChange={setEditDraft}
        onClose={cancelEditModel}
        onSave={saveEditedModel}
        saving={editSaving}
      />
    </main>
  );
}
