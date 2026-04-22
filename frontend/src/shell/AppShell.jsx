import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getFirebaseConfigStatus, signOutCurrentUser, watchAuthState } from "../lib/firebaseAuth";

const THEME_STORAGE_KEY = "cadrelay_theme";

function detectInitialTheme() {
  // Берем тему из localStorage, иначе смотрим системную.
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function AppShell() {
  const [theme, setTheme] = useState(detectInitialTheme);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const firebaseReady = getFirebaseConfigStatus();

  useEffect(() => {
    // Применяем тему через data-атрибут на корневом html.
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    // При смене страницы на мобильном закрываем меню.
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    // Подписываемся на auth-состояние, чтобы кнопка в top bar была актуальной.
    if (!firebaseReady) return undefined;
    const stop = watchAuthState((user) => setAuthUser(user || null));
    return stop;
  }, [firebaseReady]);

  const themeToggleLabel = useMemo(() => (theme === "dark" ? "Light" : "Dark"), [theme]);

  async function handleAuthButton() {
    if (!authUser) {
      navigate("/auth");
      return;
    }
    try {
      await signOutCurrentUser();
      navigate("/");
    } catch {
      // Если logout не удался, остаемся на текущем экране.
    }
  }

  return (
    <div className="shell-layout">
      <aside className={`shell-sidebar ${mobileMenuOpen ? "shell-sidebar-open" : ""}`}>
        <NavLink to="/" className="shell-brand">
          CADRelay
        </NavLink>
        <nav className="shell-nav">
          <span className="shell-nav-title">Navigation</span>
          <NavLink to="/" className={({ isActive }) => `shell-link ${isActive ? "shell-link-active" : ""}`} end>
            Explore
          </NavLink>
          <NavLink
            to="/workspace"
            className={({ isActive }) => `shell-link ${isActive ? "shell-link-active" : ""}`}
          >
            Workspace
          </NavLink>
        </nav>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar-left">
            <button type="button" className="shell-menu-btn" onClick={() => setMobileMenuOpen((v) => !v)}>
              Menu
            </button>
            <div className="shell-topbar-links">
              <NavLink to="/" className="shell-topbar-link">
                Home
              </NavLink>
              <NavLink to="/workspace" className="shell-topbar-link">
                My Models
              </NavLink>
            </div>
          </div>
          <div className="shell-topbar-actions">
            <button
              type="button"
              className="shell-theme-btn"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            >
              Theme: {themeToggleLabel}
            </button>
            <button type="button" className="shell-auth-btn" onClick={handleAuthButton}>
              {authUser ? "Log out" : "Sign in / Sign up"}
            </button>
          </div>
        </header>

        <section className="shell-content">
          <Outlet />
        </section>
      </div>

      {mobileMenuOpen ? <button type="button" className="shell-backdrop" onClick={() => setMobileMenuOpen(false)} /> : null}
    </div>
  );
}
