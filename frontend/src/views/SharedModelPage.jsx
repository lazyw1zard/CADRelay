import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Box, Download } from "lucide-react";
import { formatErrorMessage } from "../lib/errorMessages";
import { apiGetSharedModel, buildSharedDownloadUrl } from "../lib/workspaceApi";

const GlbViewer = lazy(() => import("../components/GlbViewer").then((m) => ({ default: m.GlbViewer })));

function titleOf(model) {
  return model?.model_name || model?.model_id || model?.id || "Модель";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ru-RU", { year: "numeric", month: "short", day: "2-digit" });
}

export function SharedModelPage() {
  const { shareToken = "" } = useParams();
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!shareToken) return;
    let cancelled = false;
    async function loadSharedModel() {
      setLoading(true);
      setError("");
      try {
        const row = await apiGetSharedModel(shareToken);
        if (!cancelled) setModel(row);
      } catch (err) {
        if (!cancelled) setError(formatErrorMessage(err, "Не удалось открыть ссылку на модель."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSharedModel();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  const glbUrl = useMemo(() => {
    if (!shareToken || !model?.storage_key_glb) return "";
    return buildSharedDownloadUrl({ shareToken, kind: "glb" });
  }, [shareToken, model]);

  return (
    <main className="page page-wide workspace-page shared-model-page">
      <section className="card workspace-upload-header">
        <div>
          <p className="page-kicker">Shared model</p>
          <h1>{model ? titleOf(model) : "Ссылка на модель"}</h1>
          <p className="page-subtitle">Модель открыта по приватной ссылке MakeLayer.</p>
        </div>
        <Link to="/" className="button button-secondary">
          <ArrowLeft size={16} />
          В Explore
        </Link>
      </section>

      {loading ? (
        <section className="state-panel state-panel-compact">
          <p>Открываем модель...</p>
        </section>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      {!loading && model ? (
        <section className="card render-model-card">
          <div className="row">
            <div>
              <h2>{titleOf(model)}</h2>
              <p className="muted">{model.model_description || "Описание пока не добавлено."}</p>
            </div>
            <div className="toolbar">
              <span className="badge">
                <Box size={13} />
                {(model.source_format || "model").toUpperCase()}
              </span>
              <span className={`filter-chip visibility-chip visibility-${model.visibility || "public"}`}>
                {model.visibility === "unlisted" ? "По ссылке" : "Публичная"}
              </span>
              <a className="btn-ghost" href={buildSharedDownloadUrl({ shareToken, kind: "original" })}>
                <Download size={15} />
                Оригинал
              </a>
            </div>
          </div>

          <div className="render-meta-strip" aria-label="Информация о модели">
            <span>
              <strong>Категория</strong>
              {model.model_category || "-"}
            </span>
            <span>
              <strong>Профиль</strong>
              {model.conversion_profile || "-"}
            </span>
            <span>
              <strong>Загружено</strong>
              {formatDate(model.created_at)}
            </span>
          </div>

          {glbUrl ? (
            <>
              <div className="toolbar shared-render-toolbar">
                <a className="btn-ghost" href={glbUrl}>
                  <Download size={15} />
                  GLB
                </a>
              </div>
              <Suspense fallback={<p className="muted">Загружаем 3D viewer...</p>}>
                <GlbViewer glbUrl={glbUrl} />
              </Suspense>
            </>
          ) : (
            <section className="state-panel state-panel-compact">
              <p>GLB-preview пока не готов.</p>
            </section>
          )}
        </section>
      ) : null}
    </main>
  );
}
