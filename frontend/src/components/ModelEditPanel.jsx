import { Save, UploadCloud, X } from "lucide-react";
import { buildDownloadUrl } from "../lib/workspaceApi";

const SOURCE_FORMATS = ["step", "stp", "iges", "igs", "3mf", "stl", "obj"];
const CONVERSION_PROFILES = [
  ["fast", "Fast"],
  ["balanced", "Balanced"],
  ["high", "High"],
];

function renderTitle(model) {
  return model?.model_name || model?.model_id || model?.id || "Model";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ModelEditPanel({
  model,
  idToken,
  thumbnail,
  categories,
  draft,
  onDraftChange,
  onClose,
  onSave,
  saving,
}) {
  if (!model) return null;

  const title = renderTitle(model);
  const customThumbUrl =
    idToken && model.storage_key_thumbnail_custom
      ? buildDownloadUrl({ modelVersionId: model.id, kind: "thumbnail", token: idToken })
      : "";

  function update(patch) {
    onDraftChange((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="detail-layer" role="presentation">
      <button type="button" className="detail-scrim" onClick={onClose} aria-label="Закрыть редактирование" />
      <aside className="model-detail-panel model-edit-panel" aria-label={`Редактирование ${title}`}>
        <header className="detail-header">
          <div>
            <p className="page-kicker">Редактирование модели</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть" title="Закрыть">
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

        <form className="model-edit-form" onSubmit={onSave}>
          <section className="model-edit-section">
            <div className="model-edit-section-heading">
              <h3>Описание</h3>
              <span>Изменено: {formatDateTime(model.updated_at || model.created_at)}</span>
            </div>
            <label>
              Название
              <input value={draft.modelName} onChange={(e) => update({ modelName: e.target.value })} required />
            </label>
            <label>
              Категория
              <select value={draft.modelCategory} onChange={(e) => update({ modelCategory: e.target.value })}>
                <option value="">Без категории</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.label}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Теги
              <input
                value={draft.modelTags}
                onChange={(e) => update({ modelTags: e.target.value })}
                placeholder="game, printable, fixture"
              />
            </label>
            <label>
              Описание
              <textarea rows={4} value={draft.modelDescription} onChange={(e) => update({ modelDescription: e.target.value })} />
            </label>
          </section>

          <section className="model-edit-section">
            <div className="model-edit-section-heading">
              <h3>Файлы</h3>
              <span>Замена модели запустит новый GLB-preview</span>
            </div>
            <div className="model-edit-grid">
              <label>
                Формат
                <select value={draft.sourceFormat} onChange={(e) => update({ sourceFormat: e.target.value })}>
                  {SOURCE_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {format.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Профиль
                <select value={draft.conversionProfile} onChange={(e) => update({ conversionProfile: e.target.value })}>
                  {CONVERSION_PROFILES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="model-edit-file">
              <span>
                <UploadCloud size={16} />
                Файл модели
              </span>
              <input
                type="file"
                accept=".step,.stp,.iges,.igs,.3mf,.stl,.obj"
                onChange={(e) => update({ modelFile: e.target.files?.[0] || null })}
              />
              <small>{draft.modelFile ? draft.modelFile.name : "Оставь пустым, если файл модели не меняется."}</small>
            </label>
            <label className="model-edit-file">
              <span>
                <UploadCloud size={16} />
                Превью
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => update({ thumbnailFile: e.target.files?.[0] || null })}
              />
              <small>{draft.thumbnailFile ? draft.thumbnailFile.name : "PNG, JPG или WEBP. Можно заменить отдельно от модели."}</small>
            </label>
          </section>

          <footer className="detail-actions model-edit-actions">
            <button type="button" className="button button-secondary" onClick={onClose} disabled={saving}>
              <X size={16} />
              Отменить
            </button>
            <button type="submit" className="button button-primary" disabled={saving}>
              <Save size={16} />
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </footer>
        </form>
      </aside>
    </div>
  );
}
