import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiUploadModel } from "../lib/workspaceApi";
import { useWorkspaceAuth } from "../lib/useWorkspaceAuth";

export function WorkspaceUploadPage() {
  const navigate = useNavigate();
  const { firebaseReady, authReady, authUser, idToken, emailVerified } = useWorkspaceAuth();
  const [modelName, setModelName] = useState("");
  const [modelDescription, setModelDescription] = useState("");
  const [modelCategory, setModelCategory] = useState("");
  const [modelTags, setModelTags] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [sourceFormat, setSourceFormat] = useState("step");
  const [conversionProfile, setConversionProfile] = useState("balanced");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      setError(String(err?.message || err));
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
        <h1>Upload New Model</h1>
        <button type="button" onClick={() => navigate("/workspace")}>
          Back to workspace
        </button>
      </section>

      <form className="card" onSubmit={handleUpload}>
        <label>
          Model Name
          <input
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="Например: Universal Clamp v2"
          />
        </label>

        <label>
          Description
          <textarea
            rows={3}
            value={modelDescription}
            onChange={(e) => setModelDescription(e.target.value)}
            placeholder="Кратко: для чего модель, особенности печати/сборки"
          />
        </label>

        <label>
          Category
          <input value={modelCategory} onChange={(e) => setModelCategory(e.target.value)} placeholder="Tools" />
        </label>

        <label>
          Tags
          <input value={modelTags} onChange={(e) => setModelTags(e.target.value)} placeholder="clamp, printable" />
        </label>

        <label>
          Custom thumbnail (optional)
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setThumbnailFile(e.target.files?.[0] ?? null)} />
        </label>

        <label>
          Format
          <select value={sourceFormat} onChange={(e) => setSourceFormat(e.target.value)}>
            <option value="step">step</option>
            <option value="stp">stp</option>
            <option value="iges">iges</option>
            <option value="igs">igs</option>
            <option value="3mf">3mf</option>
            <option value="stl">stl</option>
            <option value="obj">obj</option>
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
        <button type="submit" disabled={loading || !emailVerified}>
          {loading ? "Загрузка..." : "Upload"}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
