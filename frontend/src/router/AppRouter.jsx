import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../shell/AppShell";
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
          <Route path="/admin/users" element={<Navigate to="/workspace" replace />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
