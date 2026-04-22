import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiGetModelVersion, buildDownloadUrl } from "../lib/workspaceApi";
import { useWorkspaceAuth } from "../lib/useWorkspaceAuth";

const GlbViewer = lazy(() => import("../components/GlbViewer").then((m) => ({ default: m.GlbViewer })));

function formatMs(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Math.round(Number(value))} ms`;
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
        if (!cancelled) setError(String(err?.message || err));
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

  const handleViewerLoadMetrics = useCallback(({ loadMs, triangles }) => {
    setViewerLoadMs(loadMs);
    setViewerTriangles(triangles);
  }, []);

  if (!firebaseReady) {
    return (
      <main className="page workspace-page">
        <section className="card">
          <h2>Render</h2>
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
      <section className="card workspace-upload-header">
        <h1>Render Model</h1>
        <button type="button" onClick={() => navigate("/workspace")}>
          Back to workspace
        </button>
      </section>

      {loading ? <p className="muted">Загрузка модели...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && row && !row.storage_key_glb ? (
        <section className="card">
          <p className="muted">GLB пока не готов. Вернись в workspace и нажми Refresh.</p>
        </section>
      ) : null}

      {!loading && row && row.storage_key_glb ? (
        <section className="card">
          <div className="row">
            <h2>{row.model_name || row.model_id || row.id}</h2>
            <span className="badge">{row.id}</span>
          </div>
          {row.model_description ? <p className="muted">{row.model_description}</p> : null}
          <div className="metrics">
            <div>profile: {row.conversion_profile || "-"}</div>
            <div>conversion: {formatMs(row.conversion_ms)}</div>
            <div>viewer load: {formatMs(viewerLoadMs)}</div>
            <div>triangles: {viewerTriangles ?? "-"}</div>
          </div>

          <Suspense fallback={<p className="muted">Загружаем 3D viewer...</p>}>
            <GlbViewer glbUrl={previewUrl} onLoadMetrics={handleViewerLoadMetrics} />
          </Suspense>
        </section>
      ) : null}
    </main>
  );
}
