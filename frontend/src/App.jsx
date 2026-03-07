import { useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000/api/v1";

// Получить актуальное состояние конкретной версии модели.
async function apiGetModelVersion(id) {
  const resp = await fetch(`${API_BASE}/model-versions/${id}?ts=${Date.now()}`, {
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(`status ${resp.status}`);
  return resp.json();
}

// Загрузка файла модели в backend через multipart/form-data.
async function apiUpload({ modelId, sourceFormat, file }) {
  const form = new FormData();
  form.append("model_id", modelId);
  form.append("source_format", sourceFormat);
  form.append("file", file);

  const resp = await fetch(`${API_BASE}/uploads`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`upload failed (${resp.status}): ${body}`);
  }
  return resp.json();
}

// Отправить решение клиента по модели (approve/reject + комментарий).
async function apiApproval(modelVersionId, decision, comment) {
  const resp = await fetch(`${API_BASE}/model-versions/${modelVersionId}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, comment: comment || null }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`approval failed (${resp.status}): ${body}`);
  }
  return resp.json();
}

export function App() {
  const [modelId, setModelId] = useState("model_demo_ui");
  const [sourceFormat, setSourceFormat] = useState("step");
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");

  async function handleUpload(e) {
    e.preventDefault();
    setError("");
    if (!file) {
      setError("Выбери файл");
      return;
    }

    setLoading(true);
    try {
      // После загрузки сразу показываем новую строку в таблице.
      const data = await apiUpload({ modelId, sourceFormat, file });
      const row = data.model_version;
      setRows((prev) => [row, ...prev]);
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
      const updated = await apiGetModelVersion(id);
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  async function approve(id, decision) {
    setError("");
    try {
      // Сохраняем решение, затем перечитываем статус строки.
      await apiApproval(id, decision, comment);
      await refreshOne(id);
    } catch (err) {
      setError(String(err.message || err));
    }
  }

  const processingCount = useMemo(
    // Кол-во строк в processing для индикатора нагрузки.
    () => rows.filter((r) => r.status === "processing").length,
    [rows]
  );

  return (
    <main className="page">
      <h1>CADRelay MVP</h1>
      <p className="muted">Upload → processing → ready</p>

      <form className="card" onSubmit={handleUpload}>
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
          File
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        <button disabled={loading}>{loading ? "Загрузка..." : "Upload"}</button>
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
                  <td>{r.id}</td>
                  <td>{r.status}</td>
                  <td>{r.storage_key_original || "-"}</td>
                  <td>{r.storage_key_glb || "-"}</td>
                  <td>
                    <div className="actions">
                      <button onClick={() => refreshOne(r.id)}>Refresh</button>
                      <button onClick={() => approve(r.id, "approve")}>Approve</button>
                      <button onClick={() => approve(r.id, "reject")}>Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
