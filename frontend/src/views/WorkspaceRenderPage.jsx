import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Box, Download } from "lucide-react";
import { formatErrorMessage } from "../lib/errorMessages";
import { apiGetModelVersion, buildDownloadUrl } from "../lib/workspaceApi";
import { useWorkspaceAuth } from "../lib/useWorkspaceAuth";

const GlbViewer = lazy(() => import("../components/GlbViewer").then((m) => ({ default: m.GlbViewer })));

function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Math.round(Number(value))} ms`;
}

function formatDimensions(value) {
  if (!value) return "-";
  return `${value.x.toFixed(2)} x ${value.y.toFixed(2)} x ${value.z.toFixed(2)}`;
}

export function WorkspaceRenderPage() {
  const navigate = useNavigate();
  const { modelVersionId = "" } = useParams();
  const { firebaseReady, authReady, authUser, idToken } = useWorkspaceAuth();
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewerLoadMs, setViewerLoadMs] = useState(null);
  const [viewerTriangles, setViewerTriangles] = useState(null);
  const [viewerDimensions, setViewerDimensions] = useState(null);

  useEffect(() => {
    if (!authUser || !idToken || !modelVersionId) return;
    let cancelled = false;

    async function loadModel() {
      setLoading(true);
      setError("");
      try {
        const data = await apiGetModelVersion(modelVersionId, idToken);
        if (!cancelled) setRow(data);
      } catch (err) {
        if (!cancelled) setError(formatErrorMessage(err, "Не удалось загрузить модель для просмотра."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadModel();
    return () => {
      cancelled = true;
    };
  }, [authUser, idToken, modelVersionId]);

  const previewUrl = useMemo(() => {
    if (!row?.storage_key_glb || !idToken) return "";
    return buildDownloadUrl({ modelVersionId: row.id, kind: "glb", token: idToken });
  }, [row, idToken]);

  const handleViewerLoadMetrics = useCallback(({ loadMs, triangles, dimensions }) => {
    setViewerLoadMs(loadMs);
    setViewerTriangles(triangles);
    setViewerDimensions(dimensions || null);
  }, []);

  if (!firebaseReady) {
    return (
      <main className="page workspace-page">
        <section className="card">
          <h2>3D просмотр</h2>
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
    <main className="page page-wide workspace-page">
      <section className="card workspace-upload-header">
        <div>
          <p className="page-kicker">3D просмотр</p>
          <h1>Просмотр модели</h1>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/workspace")}>
          <ArrowLeft size={16} />
          Назад в workspace
        </button>
      </section>

      {loading ? (
        <section className="state-panel state-panel-compact" aria-live="polite">
          <p>Загрузка модели...</p>
        </section>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}

      {!loading && row && !row.storage_key_glb ? (
        <section className="card">
          <p className="muted">GLB пока не готов. Вернись в workspace и нажми Refresh.</p>
        </section>
      ) : null}

      {!loading && row && row.storage_key_glb ? (
        <section className="card render-model-card">
          <div className="row">
            <div>
              <h2>{row.model_name || row.model_id || row.id}</h2>
            </div>
            <div className="toolbar">
              <span className="badge">
                <Box size={13} />
                {(row.source_format || "model").toUpperCase()}
              </span>
              <a className="btn-ghost" href={buildDownloadUrl({ modelVersionId: row.id, kind: "glb", token: idToken })}>
                <Download size={15} />
                GLB
              </a>
            </div>
          </div>
          {row.model_description ? <p className="muted">{row.model_description}</p> : null}
          <div className="render-meta-strip" aria-label="Параметры модели и рендера">
            <span>
              <strong>Профиль</strong>
              {row.conversion_profile || "-"}
            </span>
            <span>
              <strong>Конверсия</strong>
              {formatMs(row.conversion_ms)}
            </span>
            <span>
              <strong>Загрузка viewer</strong>
              {formatMs(viewerLoadMs)}
            </span>
            <span>
              <strong>Треугольники</strong>
              {viewerTriangles ?? "-"}
            </span>
            <span>
              <strong>Габариты</strong>
              {formatDimensions(viewerDimensions)}
            </span>
          </div>

          <Suspense fallback={<p className="muted">Загружаем 3D viewer...</p>}>
            <GlbViewer glbUrl={previewUrl} onLoadMetrics={handleViewerLoadMetrics} />
          </Suspense>
        </section>
      ) : null}
    </main>
  );
}
