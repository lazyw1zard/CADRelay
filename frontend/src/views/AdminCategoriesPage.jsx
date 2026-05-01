import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { formatErrorMessage } from "../lib/errorMessages";
import { useWorkspaceAuth } from "../lib/useWorkspaceAuth";
import {
  apiAdminCreateModelCategory,
  apiAdminDeleteModelCategory,
  apiAdminListModelCategories,
  apiAdminUpdateModelCategory,
} from "../lib/workspaceApi";

export function AdminCategoriesPage() {
  const navigate = useNavigate();
  const { firebaseReady, authReady, authUser, idToken, authRole, emailVerified, authError } = useWorkspaceAuth();
  const [categories, setCategories] = useState([]);
  const [labelDraft, setLabelDraft] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editingLabel, setEditingLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadCategories() {
    if (!idToken) return;
    setLoading(true);
    setError("");
    try {
      const rows = await apiAdminListModelCategories({ token: idToken });
      setCategories(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось загрузить категории."));
    } finally {
      setLoading(false);
    }
  }

  async function addCategory(e) {
    e.preventDefault();
    const label = labelDraft.trim();
    if (!label) return;
    setSaving(true);
    setError("");
    try {
      await apiAdminCreateModelCategory({ token: idToken, label });
      setLabelDraft("");
      await loadCategories();
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось добавить категорию."));
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(categoryId) {
    setSaving(true);
    setError("");
    try {
      await apiAdminDeleteModelCategory({ token: idToken, categoryId });
      await loadCategories();
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось скрыть категорию."));
    } finally {
      setSaving(false);
    }
  }

  async function saveCategoryLabel(categoryId) {
    const label = editingLabel.trim();
    if (!label) return;
    setSaving(true);
    setError("");
    try {
      await apiAdminUpdateModelCategory({ token: idToken, categoryId, label });
      setEditingId("");
      setEditingLabel("");
      await loadCategories();
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось переименовать категорию."));
    } finally {
      setSaving(false);
    }
  }

  async function moveCategory(index, direction) {
    const target = categories[index];
    const swap = categories[index + direction];
    if (!target || !swap) return;
    setSaving(true);
    setError("");
    try {
      await Promise.all([
        apiAdminUpdateModelCategory({
          token: idToken,
          categoryId: target.id,
          sortOrder: swap.sort_order,
        }),
        apiAdminUpdateModelCategory({
          token: idToken,
          categoryId: swap.id,
          sortOrder: target.sort_order,
        }),
      ]);
      await loadCategories();
    } catch (err) {
      setError(formatErrorMessage(err, "Не удалось изменить порядок категорий."));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!authReady || !authUser || authRole !== "admin") return;
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser, authRole, idToken]);

  if (!firebaseReady) {
    return (
      <main className="page workspace-page">
        <section className="card">
          <h2>Категории</h2>
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

  if (authRole !== "admin") {
    return (
      <main className="page workspace-page">
        <section className="card">
          <h2>Категории</h2>
          <p className="muted">Доступ разрешен только для роли admin.</p>
          <button type="button" onClick={() => navigate("/workspace")}>
            Назад в workspace
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page workspace-page admin-users-page">
      <section className="card workspace-upload-header">
        <div>
          <p className="page-kicker">Administration</p>
          <h1>Категории моделей</h1>
        </div>
        <div className="workspace-actions-right">
          <button type="button" onClick={() => navigate("/workspace")}>
            <ArrowLeft size={16} />
            Назад в workspace
          </button>
          <button type="button" onClick={loadCategories} disabled={loading || !emailVerified}>
            <RefreshCw size={16} />
            {loading ? "Загрузка..." : "Обновить"}
          </button>
        </div>
      </section>

      {!emailVerified ? <p className="muted">Подтверди email, чтобы управлять категориями.</p> : null}

      <section className="card admin-category-panel">
        <form className="admin-category-form" onSubmit={addCategory}>
          <label>
            Новая категория
            <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} placeholder="Например: Fixtures" />
          </label>
          <button type="submit" className="button button-primary" disabled={saving || !emailVerified || !labelDraft.trim()}>
            <Plus size={15} />
            Добавить
          </button>
        </form>

        {loading && categories.length === 0 ? (
          <div className="state-panel state-panel-compact" aria-live="polite">
            <RefreshCw size={18} />
            <p>Загружаем категории...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="state-panel state-panel-compact">
            <p>Категории пока не загружены.</p>
            <span>Добавь первую категорию, чтобы она появилась в Upload и Explore.</span>
          </div>
        ) : (
          <div className="admin-category-list">
            {categories.map((category, index) => (
              <div key={category.id} className={`admin-category-row ${category.active ? "" : "admin-category-disabled"}`}>
                <div>
                  {editingId === category.id ? (
                    <input
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      aria-label={`Новое название категории ${category.label}`}
                    />
                  ) : (
                    <>
                      <strong>{category.label}</strong>
                      <span className="muted">{category.active ? "active" : "hidden"}</span>
                    </>
                  )}
                </div>
                <div className="admin-category-actions">
                  {editingId === category.id ? (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => saveCategoryLabel(category.id)}
                        disabled={saving || !emailVerified || !editingLabel.trim()}
                        title="Сохранить"
                        aria-label={`Сохранить категорию ${category.label}`}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setEditingId("");
                          setEditingLabel("");
                        }}
                        disabled={saving}
                        title="Отменить"
                        aria-label="Отменить переименование"
                      >
                        <X size={15} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => moveCategory(index, -1)}
                        disabled={saving || !emailVerified || index === 0}
                        title="Выше"
                        aria-label={`Поднять категорию ${category.label}`}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => moveCategory(index, 1)}
                        disabled={saving || !emailVerified || index === categories.length - 1}
                        title="Ниже"
                        aria-label={`Опустить категорию ${category.label}`}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingLabel(category.label);
                        }}
                        disabled={saving || !emailVerified || !category.active}
                        title="Переименовать"
                        aria-label={`Переименовать категорию ${category.label}`}
                      >
                        <Pencil size={15} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeCategory(category.id)}
                    disabled={saving || !emailVerified || !category.active}
                    title="Скрыть категорию"
                    aria-label={`Скрыть категорию ${category.label}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {authError ? <p className="error" role="alert">{authError}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </main>
  );
}
