import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../shell/AppShell";
import { AdminCategoriesPage } from "../views/AdminCategoriesPage";
import { AdminUsersPage } from "../views/AdminUsersPage";
import { AuthPage } from "../views/AuthPage";
import { ExplorePage } from "../views/ExplorePage";
import { WorkspacePage } from "../views/WorkspacePage";
import { WorkspaceRenderPage } from "../views/WorkspaceRenderPage";
import { WorkspaceUploadPage } from "../views/WorkspaceUploadPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ExplorePage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/workspace/new" element={<WorkspaceUploadPage />} />
          <Route path="/workspace/render/:modelVersionId" element={<WorkspaceRenderPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
