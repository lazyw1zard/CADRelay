import { ArrowRight, Download, Share2, Star, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ShareLinkDialog } from "./ShareLinkDialog";
import { apiCreateShareLink, buildDownloadUrl, withAuthToken } from "../lib/workspaceApi";
import { formatErrorMessage } from "../lib/errorMessages";

const API_BASE = import.meta.env.VITE_API_BASE || "/api/v1";

function renderTitle(model) {
  return model?.model_name || model?.model_id || model?.id || "Model";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function shortId(value) {
  if (!value) return "unknown";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function resolveAuthorLabel(model, viewerUser) {
  if (viewerUser?.uid && model?.owner_user_id === viewerUser.uid) {
    return viewerUser.displayName || viewerUser.email || "You";
  }
  return shortId(model?.owner_user_id);
}

function DetailItem({ label, value, children }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      {children || <strong>{value || "-"}</strong>}
    </div>
  );
}

export function ModelDetailPanel({
  model,
  idToken,
  thumbnail,
  viewerUser,
  isFavorite,
  onToggleFavorite,
  onClose,
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareError, setShareError] = useState("");
  if (!model) return null;

  const title = renderTitle(model);
  const canPreview = Boolean(model.preview_available || model.storage_key_glb);
  const authorLabel = resolveAuthorLabel(model, viewerUser);
  const customThumbUrl =
    idToken && model.custom_thumbnail_available
      ? withAuthToken(`${API_BASE}/model-versions/${model.id}/download?kind=thumbnail`, idToken)
      : "";
  const visibility = model.visibility || "public";
  const visibilityLabel =
    visibility === "private" ? "Приватная" : visibility === "unlisted" ? "По ссылке" : "Публичная";

  async function openShareDialog() {
    setShareOpen(true);
    setShareError("");
    if (visibility === "private") {
      setShareUrl("");
      setShareError("Приватную модель нельзя открыть по ссылке. Переключи видимость на 'По ссылке'.");
      return;
    }
    if (!idToken) {
      setShareUrl(window.location.href);
      return;
    }
    try {
      const result = await apiCreateShareLink(model.id, idToken);
      const url = new URL(result.share_path, window.location.origin);
      setShareUrl(url.toString());
    } catch (err) {
      setShareUrl("");
      setShareError(formatErrorMessage(err, "Не удалось создать ссылку."));
    }
  }

  return (
    <div className="detail-layer" role="presentation">
      <button type="button" className="detail-scrim" onClick={onClose} aria-label="Close model details" />
      <aside className="model-detail-panel" aria-label={`${title} details`}>
        <header className="detail-header">
          <div>
            <p className="page-kicker">Model details</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details" title="Close details">
            <X size={18} />
          </button>
        </header>

        <div className="detail-preview">
          {customThumbUrl ? (
            <img src={customThumbUrl} alt={`${title} thumbnail`} />
          ) : thumbnail ? (
            <img src={thumbnail} alt={`${title} thumbnail`} />
          ) : (
            <span className="workspace-thumb-placeholder muted">{(model.source_format || "cad").toUpperCase()}</span>
          )}
        </div>

        <div className="detail-status-row">
          <span className={`workspace-status-chip workspace-status-${model.status || "unknown"}`}>
            {model.status || "unknown"}
          </span>
          <span className={`filter-chip visibility-chip visibility-${visibility}`}>{visibilityLabel}</span>
          <span className="filter-chip">{(model.source_format || "cad").toUpperCase()}</span>
          {canPreview ? <span className="filter-chip">GLB ready</span> : <span className="filter-chip">Preview pending</span>}
        </div>

        <section className="detail-section">
          <h3>Описание</h3>
          <p className="muted">{model.model_description || "Описание пока не добавлено."}</p>
        </section>

        <section className="detail-grid">
          <DetailItem label="Автор">
            <button type="button" className="author-link" title="Мини-профиль автора появится позже">
              {authorLabel}
            </button>
          </DetailItem>
          <DetailItem label="Категория" value={model.model_category || "uncategorized"} />
          <DetailItem label="Профиль" value={model.conversion_profile || "-"} />
          <DetailItem label="Загружено" value={formatDate(model.created_at)} />
        </section>

        {Array.isArray(model.model_tags) && model.model_tags.length > 0 ? (
          <section className="detail-section">
            <h3>Теги</h3>
            <div className="detail-tags">
              {model.model_tags.map((tag) => (
                <span key={tag} className="filter-chip">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="detail-actions">
          <button
            type="button"
            className={`button button-secondary detail-favorite-btn ${isFavorite ? "favorite-active" : ""}`}
            onClick={onToggleFavorite}
          >
            <Star size={16} fill={isFavorite ? "currentColor" : "none"} />
            {isFavorite ? "В избранном" : "В избранное"}
          </button>
          {canPreview ? (
            <Link to={`/workspace/render/${model.id}`} className="button button-primary">
              Смотреть в 3D
              <ArrowRight size={16} />
            </Link>
          ) : (
            <button type="button" className="button button-primary" disabled>
              GLB не готов
            </button>
          )}
          {idToken ? (
            <a className="button button-secondary" href={buildDownloadUrl({ modelVersionId: model.id, kind: "original", token: idToken })}>
              <Download size={16} />
              Оригинал
            </a>
          ) : null}
          <button type="button" className="button button-share" onClick={openShareDialog}>
            <Share2 size={16} />
            Поделиться
          </button>
        </footer>
        <ShareLinkDialog
          open={shareOpen}
          shareUrl={shareUrl}
          error={shareError}
          note={visibility === "unlisted" ? "Модель не видна в Explore, но откроется у всех, у кого есть ссылка." : "Публичную модель можно отправить прямой ссылкой."}
          onClose={() => setShareOpen(false)}
        />
      </aside>
    </div>
  );
}
