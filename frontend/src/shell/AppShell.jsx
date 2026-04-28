import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  Boxes,
  FolderKanban,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Shield,
  Sun,
  Tags,
  UploadCloud,
  X,
} from "lucide-react";
import {
  getCurrentIdTokenResult,
  getFirebaseConfigStatus,
  signOutCurrentUser,
  watchAuthState,
} from "../lib/firebaseAuth";

const THEME_STORAGE_KEY = "cadrelay_theme";

const NAV_ITEMS = [
  { to: "/", label: "Explore", icon: Boxes, end: true },
  { to: "/workspace", label: "Workspace", icon: FolderKanban },
  { to: "/workspace/new", label: "Upload", icon: UploadCloud },
];

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
  const [authRole, setAuthRole] = useState("editor");
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
    const stop = watchAuthState(async (user) => {
      setAuthUser(user || null);
      if (!user) {
        setAuthRole("editor");
        return;
      }
      try {
        // Тянем роль из token claims для отображения admin-ссылок.
        const tokenResult = await getCurrentIdTokenResult();
        const roleClaim = tokenResult?.claims?.role;
        setAuthRole(typeof roleClaim === "string" ? roleClaim : "editor");
      } catch {
        setAuthRole("editor");
      }
    });
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
          <span className="shell-brand-mark">
            <Box size={20} strokeWidth={2.1} />
          </span>
          <span>
            <span className="shell-brand-name">CADRelay</span>
            <span className="shell-brand-caption">Model exchange</span>
          </span>
        </NavLink>
        <nav className="shell-nav">
          <span className="shell-nav-title">Navigation</span>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `shell-link ${isActive ? "shell-link-active" : ""}`}
                end={item.end}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          {authRole === "admin" ? (
            <>
              <NavLink
                to="/admin/users"
                className={({ isActive }) => `shell-link ${isActive ? "shell-link-active" : ""}`}
              >
                <Shield size={18} />
                <span>Users</span>
              </NavLink>
              <NavLink
                to="/admin/categories"
                className={({ isActive }) => `shell-link ${isActive ? "shell-link-active" : ""}`}
              >
                <Tags size={18} />
                <span>Categories</span>
              </NavLink>
            </>
          ) : null}
        </nav>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar-left">
            <button
              type="button"
              className="icon-btn shell-menu-btn"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
              title={mobileMenuOpen ? "Close navigation" : "Open navigation"}
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="shell-product-status">
              <span className="status-dot" />
              <span>Local MVP</span>
            </div>
          </div>
          <div className="shell-topbar-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              aria-label={`Switch to ${themeToggleLabel} theme`}
              title={`Switch to ${themeToggleLabel} theme`}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button type="button" className="shell-auth-btn" onClick={handleAuthButton}>
              {authUser ? <LogOut size={16} /> : <LogIn size={16} />}
              <span>{authUser ? "Log out" : "Sign in"}</span>
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
