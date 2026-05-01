import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, FileUp, ImageUp, Settings2, Tags, UploadCloud } from "lucide-react";
import { formatErrorMessage } from "../lib/errorMessages";
import { apiListModelCategories, apiUploadModel } from "../lib/workspaceApi";
import { useWorkspaceAuth } from "../lib/useWorkspaceAuth";

function formatFileSize(file) {
  if (!file?.size) return "";
  const mb = file.size / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${Math.max(1, Math.round(file.size / 1024))} KB`;
}

export function WorkspaceUploadPage() {
  const navigate = useNavigate();
  const { firebaseReady, authReady, authUser, idToken, emailVerified } = useWorkspaceAuth();
  const [modelName, setModelName] = useState("");
  const [modelDescription, setModelDescription] = useState("");
  const [modelCategory, setModelCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [modelTags, setModelTags] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [sourceFormat, setSourceFormat] = useState("step");
  const [conversionProfile, setConversionProfile] = useState("balanced");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      try {
        const rows = await apiListModelCategories();
        if (!cancelled) {
          const incoming = Array.isArray(rows) ? rows : [];
          setCategories(incoming);
          if (!modelCategory && incoming[0]?.label) setModelCategory(incoming[0].label);
        }
      } catch {
        // Category list is a convenience; upload can still proceed with empty category.
      }
    }
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUpload(e) {
    e.preventDefault();
    setError("");
    if (!emailVerified) {
      setError("Подтверди email, чтобы загружать модели.");
      return;
    }
    if (!modelName.trim()) {
      setError("Укажи название модели.");
      return;
    }
    if (!file) {
      setError("Выбери файл.");
      return;
    }

    setLoading(true);
    try {
      await apiUploadModel({
        modelName: modelName.trim(),
        modelDescription: modelDescription.trim(),
        modelCategory: modelCategory.trim(),
        modelTags,
        thumbnailFile,
        sourceFormat,
        conversionProfile,
        file,
        token: idToken,
      });
      navigate("/workspace");
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось загрузить модель."));
    } finally {
      setLoading(false);
    }
  }

  if (!firebaseReady) {
    return (
      <main className="page workspace-page">
        <section className="card">
          <h2>New Model</h2>
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
        <div>
          <p className="page-kicker">New model</p>
          <h1>Загрузка модели</h1>
          <p className="page-subtitle">Добавь CAD/mesh файл, описание и параметры preview-конвертации.</p>
        </div>
        <button type="button" className="button button-secondary" onClick={() => navigate("/workspace")}>
          <ArrowLeft size={16} />
          Назад в workspace
        </button>
      </section>

      <form className="upload-layout" onSubmit={handleUpload}>
        <section className="upload-main-panel">
          <div className="upload-section-heading">
            <FileUp size={18} />
            <div>
              <h2>Файл модели</h2>
              <p>Оригинал будет сохранён, а worker подготовит GLB для веб-просмотра.</p>
            </div>
          </div>

          <label className={`upload-file-drop ${file ? "upload-file-drop-ready" : ""}`}>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-label="Выбрать файл модели"
            />
            <span className="upload-file-icon">
              <UploadCloud size={24} />
            </span>
            <span>
              <strong>{file ? file.name : "Выбери файл модели"}</strong>
              <small>{file ? formatFileSize(file) : "STEP, STP, IGES, 3MF, STL или OBJ"}</small>
            </span>
          </label>

          <div className="upload-field-grid">
            <label>
              Название
              <input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Например: Universal Clamp v2"
                required
              />
            </label>

            <label>
              Категория
              <select value={modelCategory} onChange={(e) => setModelCategory(e.target.value)}>
                <option value="">Без категории</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.label}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Описание
            <textarea
              rows={5}
              value={modelDescription}
              onChange={(e) => setModelDescription(e.target.value)}
              placeholder="Кратко: назначение модели, особенности печати, сборки или проверки"
            />
          </label>

          <label>
            <span className="upload-label-with-icon">
              <Tags size={14} />
              Теги
            </span>
            <input value={modelTags} onChange={(e) => setModelTags(e.target.value)} placeholder="clamp, printable, fixture" />
          </label>
        </section>

        <aside className="upload-side-panel">
          <section className="upload-side-section">
            <div className="upload-section-heading">
              <Settings2 size={18} />
              <div>
                <h2>Preview</h2>
                <p>Параметры конвертации для 3D просмотра.</p>
              </div>
            </div>

            <label>
              Формат исходника
              <select value={sourceFormat} onChange={(e) => setSourceFormat(e.target.value)}>
                <option value="step">STEP</option>
                <option value="stp">STP</option>
                <option value="iges">IGES</option>
                <option value="igs">IGS</option>
                <option value="3mf">3MF</option>
                <option value="stl">STL</option>
                <option value="obj">OBJ</option>
              </select>
            </label>

            <label>
              Профиль конвертации
              <select value={conversionProfile} onChange={(e) => setConversionProfile(e.target.value)}>
                <option value="fast">fast - быстрее, грубее</option>
                <option value="balanced">balanced - по умолчанию</option>
                <option value="high">high - точнее, тяжелее</option>
              </select>
            </label>
          </section>

          <section className="upload-side-section">
            <div className="upload-section-heading">
              <ImageUp size={18} />
              <div>
                <h2>Миниатюра</h2>
                <p>Можно загрузить изображение, если автопревью не подходит.</p>
              </div>
            </div>

            <label className={`upload-file-drop upload-file-drop-compact ${thumbnailFile ? "upload-file-drop-ready" : ""}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setThumbnailFile(e.target.files?.[0] ?? null)}
                aria-label="Выбрать изображение миниатюры"
              />
              <span className="upload-file-icon">
                <ImageUp size={20} />
              </span>
              <span>
                <strong>{thumbnailFile ? thumbnailFile.name : "Опциональная миниатюра"}</strong>
                <small>{thumbnailFile ? formatFileSize(thumbnailFile) : "PNG, JPG или WEBP"}</small>
              </span>
            </label>
          </section>

          <section className="upload-submit-panel">
            {!emailVerified ? <p className="muted">Подтверди email, чтобы загружать и изменять данные.</p> : null}
            <button type="submit" className="button button-primary" disabled={loading || !emailVerified}>
              <UploadCloud size={16} />
              {loading ? "Загрузка..." : "Загрузить модель"}
            </button>
          </section>
        </aside>
      </form>

      {error ? <p className="error" role="alert">{error}</p> : null}
    </main>
  );
}
