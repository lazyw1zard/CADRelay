import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw, Search, UploadCloud } from "lucide-react";
import { getCurrentIdToken, getFirebaseConfigStatus, watchAuthState } from "../lib/firebaseAuth";
import { generateGlbThumbnail } from "../lib/thumbnail";
import { withAuthToken } from "../lib/workspaceApi";

const API_BASE = "http://127.0.0.1:8000/api/v1";
const PAGE_SIZE = 12;

async function fetchExplorePage({ offset, limit }) {
  const qs = new URLSearchParams();
  qs.set("offset", String(offset));
  qs.set("limit", String(limit));
  const resp = await fetch(`${API_BASE}/explore/model-versions?${qs.toString()}`, { cache: "no-store" });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GET /explore/model-versions failed (${resp.status}): ${text}`);
  }
  return resp.json();
}

function renderCardTitle(model) {
  return model.model_name || model.model_id || model.id;
}

export function ExplorePage() {
  const [items, setItems] = useState([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [idToken, setIdToken] = useState("");
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
  const firebaseReady = getFirebaseConfigStatus();

  async function loadFirstPage() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchExplorePage({ offset: 0, limit: PAGE_SIZE });
      setItems(Array.isArray(data.items) ? data.items : []);
      setNextOffset(data.next_offset ?? null);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loading || nextOffset === null) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchExplorePage({ offset: nextOffset, limit: PAGE_SIZE });
      const incoming = Array.isArray(data.items) ? data.items : [];
      setItems((prev) => [...prev, ...incoming]);
      setNextOffset(data.next_offset ?? null);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // На входе в Explore тянем первую страницу живых ready-моделей.
    loadFirstPage();
  }, []);

  useEffect(() => {
    // В dev StrictMode может быть mount/unmount, флаг нужен для безопасных setState.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    // Для загрузки GLB-preview берем токен текущего пользователя.
    const stop = watchAuthState(async (user) => {
      if (!user) {
        setIdToken("");
        return;
      }
      try {
        const token = await getCurrentIdToken();
        setIdToken(token || "");
      } catch {
        setIdToken("");
      }
    });
    return stop;
  }, [firebaseReady]);

  useEffect(() => {
    try {
      localStorage.setItem("cadrelay_thumbnails", JSON.stringify(thumbnailsById));
    } catch {
      // Если localStorage недоступен, просто не кешируем.
    }
  }, [thumbnailsById]);

  useEffect(() => {
    // Генерируем миниатюры для карточек Explore, если есть ready GLB.
    if (!idToken || thumbnailInProgressId) return;
    const next = items.find(
      (model) =>
        !model.custom_thumbnail_available &&
        model.preview_available &&
        !thumbnailsById[model.id] &&
        !thumbnailFailedById[model.id]
    );
    if (!next) return;

    setThumbnailInProgressId(next.id);
    const glbUrl = withAuthToken(`${API_BASE}/model-versions/${next.id}/download?kind=glb`, idToken);
    generateGlbThumbnail(glbUrl)
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
  }, [items, idToken, thumbnailInProgressId, thumbnailFailedById, thumbnailsById]);

  const visibleItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return items.filter((model) => {
      if (activeFilter === "ready" && !model.preview_available) return false;
      if (activeFilter === "glb" && !model.preview_available) return false;
      if (!["all", "ready", "glb"].includes(activeFilter) && model.source_format !== activeFilter) return false;
      if (!query) return true;
      const haystack = [
        model.model_name,
        model.model_id,
        model.id,
        model.model_description,
        model.model_category,
        model.source_format,
        ...(Array.isArray(model.model_tags) ? model.model_tags : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [items, activeFilter, searchTerm]);

  return (
    <div className="page page-wide explore-page">
      <section className="explore-hero">
        <div>
          <p className="page-kicker">Model library</p>
          <h1>Explore Models</h1>
          <p>Готовые модели для просмотра, обмена и проверки рендера. 3D-print профиль оставим как следующий слой продукта.</p>
        </div>
        <div className="explore-hero-actions">
          <Link to="/workspace" className="btn-primary">
            Open Workspace
            <ArrowRight size={16} />
          </Link>
          <Link to="/auth" className="btn-ghost">
            Sign in
          </Link>
        </div>
      </section>

      <section className="explore-toolbar">
        <div className="search-shell">
          <Search size={17} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by model, category, tag..."
            aria-label="Search models"
          />
        </div>
        <div className="filter-row" aria-label="Explore filters">
          {[
            ["all", "All"],
            ["ready", "Ready"],
            ["step", "STEP"],
            ["glb", "GLB"],
            ["3mf", "3MF"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`filter-chip ${activeFilter === value ? "filter-chip-active" : ""}`}
              onClick={() => setActiveFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="metric-strip" aria-label="Explore metrics">
        <div className="metric-tile">
          <span className="metric-label">Visible models</span>
          <span className="metric-value">{visibleItems.length}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-label">Ready previews</span>
          <span className="metric-value">{items.filter((model) => model.preview_available).length}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-label">Generated thumbs</span>
          <span className="metric-value">{Object.keys(thumbnailsById).length}</span>
        </div>
        <div className="metric-tile">
          <span className="metric-label">Page size</span>
          <span className="metric-value">{PAGE_SIZE}</span>
        </div>
      </section>

      <section className="explore-grid">
        {visibleItems.map((model, idx) => (
          <article key={model.id} className="model-card">
            <div className={`model-card-cover model-card-cover-${(idx % 3) + 1}`}>
              {idToken && model.custom_thumbnail_available ? (
                <img
                  className="model-card-cover-img"
                  src={withAuthToken(`${API_BASE}/model-versions/${model.id}/download?kind=thumbnail`, idToken)}
                  alt={`${renderCardTitle(model)} custom thumbnail`}
                />
              ) : thumbnailsById[model.id] ? (
                <img className="model-card-cover-img" src={thumbnailsById[model.id]} alt={`${renderCardTitle(model)} thumbnail`} />
              ) : null}
            </div>
            <div className="model-card-body">
              <h3>{renderCardTitle(model)}</h3>
              {model.model_description ? <p>{model.model_description}</p> : <p>{model.source_format.toUpperCase()}</p>}
              <div className="model-card-meta">
                <span>{model.model_category || "uncategorized"}</span>
                <span>{Array.isArray(model.model_tags) ? model.model_tags.slice(0, 2).join(", ") : ""}</span>
              </div>
              <div className="explore-card-actions">
                <Link
                  to={model.preview_available ? `/workspace/render/${model.id}` : "/workspace"}
                  className="btn-ghost"
                >
                  {model.preview_available ? "Open render" : "Open workspace"}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>

      {!loading && items.length === 0 ? <p className="muted">Пока нет ready-моделей в ленте.</p> : null}
      {!loading && items.length > 0 && visibleItems.length === 0 ? <p className="muted">По этому фильтру ничего не найдено.</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="explore-pager">
        <button type="button" className="btn-ghost" onClick={loadFirstPage} disabled={loading}>
          <RefreshCw size={15} />
          {loading ? "Loading..." : "Refresh"}
        </button>
        {nextOffset !== null ? (
          <button type="button" className="btn-primary" onClick={loadMore} disabled={loading}>
            <UploadCloud size={15} />
            {loading ? "Loading..." : "Load more"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
