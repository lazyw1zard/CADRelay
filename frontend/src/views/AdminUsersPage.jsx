import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useWorkspaceAuth } from "../lib/useWorkspaceAuth";
import { apiAdminListUsers, apiAdminSetUserRole } from "../lib/workspaceApi";

export function AdminUsersPage() {
  const navigate = useNavigate();
  const { firebaseReady, authReady, authUser, idToken, authRole, emailVerified, authError } = useWorkspaceAuth();
  const [users, setUsers] = useState([]);
  const [roleDraftByUid, setRoleDraftByUid] = useState({});
  const [nextPageToken, setNextPageToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingUid, setSavingUid] = useState("");
  const [error, setError] = useState("");

  async function loadUsers({ append = false } = {}) {
    if (!idToken) return;
    if (!emailVerified) {
      setError("Подтверди email, чтобы управлять ролями.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      // Загружаем страницу пользователей из backend admin endpoint.
      const data = await apiAdminListUsers({
        token: idToken,
        limit: 50,
        pageToken: append ? nextPageToken : "",
      });
      const incoming = Array.isArray(data.users) ? data.users : [];
      setUsers((prev) => (append ? [...prev, ...incoming] : incoming));
      setRoleDraftByUid((prev) => {
        const next = { ...prev };
        for (const row of incoming) {
          if (!next[row.uid]) next[row.uid] = row.role;
        }
        return next;
      });
      setNextPageToken(data.next_page_token || "");
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function saveUserRole(uid) {
    if (!idToken) return;
    if (!emailVerified) {
      setError("Подтверди email, чтобы менять роли.");
      return;
    }
    const role = roleDraftByUid[uid];
    if (!role) return;

    setError("");
    setSavingUid(uid);
    try {
      // Обновляем роль через backend (Firebase custom claims).
      const updated = await apiAdminSetUserRole({ token: idToken, uid, role });
      setUsers((prev) => prev.map((row) => (row.uid === uid ? updated : row)));
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setSavingUid("");
    }
  }

  useEffect(() => {
    if (!authReady || !authUser || authRole !== "admin") return;
    // На входе в админку сразу тянем первую страницу пользователей.
    loadUsers({ append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, authUser, authRole, idToken]);

  if (!firebaseReady) {
    return (
      <main className="page workspace-page">
        <section className="card">
          <h2>Admin users</h2>
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
          <h2>Admin users</h2>
          <p className="muted">Доступ разрешен только для роли admin.</p>
          <button type="button" onClick={() => navigate("/workspace")}>
            Back to workspace
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page workspace-page admin-users-page">
      <section className="card workspace-upload-header">
        <h1>Admin: Users & Roles</h1>
        <div className="workspace-actions-right">
          <button type="button" onClick={() => navigate("/workspace")}>
            Back to workspace
          </button>
          <button type="button" onClick={() => loadUsers({ append: false })} disabled={loading || !emailVerified}>
            {loading ? "Loading..." : "Refresh users"}
          </button>
        </div>
      </section>

      {!emailVerified ? <p className="muted">Подтверди email, чтобы управлять ролями.</p> : null}

      <section className="card">
        {users.length === 0 ? (
          <p className="muted">Пользователи пока не загружены.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>UID</th>
                <th>Email</th>
                <th>Verified</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid}>
                  <td>{u.uid}</td>
                  <td>{u.email || "-"}</td>
                  <td>{u.email_verified ? "yes" : "no"}</td>
                  <td>
                    <select
                      value={roleDraftByUid[u.uid] || u.role}
                      disabled={!emailVerified || savingUid === u.uid}
                      onChange={(e) => setRoleDraftByUid((prev) => ({ ...prev, [u.uid]: e.target.value }))}
                    >
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                      <option value="reviewer">reviewer</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => saveUserRole(u.uid)}
                      disabled={savingUid === u.uid || !emailVerified}
                    >
                      {savingUid === u.uid ? "Saving..." : "Apply"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {nextPageToken ? (
          <button type="button" onClick={() => loadUsers({ append: true })} disabled={loading || !emailVerified}>
            {loading ? "Loading..." : "Load more"}
          </button>
        ) : null}
      </section>

      {authError ? <p className="error">{authError}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
