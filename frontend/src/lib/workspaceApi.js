const API_BASE = "http://127.0.0.1:8000/api/v1";

export function withAuthToken(url, token) {
  if (!token) return url;
  const qs = new URLSearchParams();
  qs.set("access_token", token);
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${qs.toString()}`;
}

async function apiFetch(path, { token = "", method = "GET", headers = {}, body, cache = "no-store" } = {}) {
  const finalHeaders = new Headers(headers);
  if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(`${API_BASE}${path}`, { method, headers: finalHeaders, body, cache });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${method} ${path} failed (${resp.status}): ${text}`);
  }
  return resp;
}

export async function apiListModelVersions({ ownerUserId, token, limit = 100 }) {
  const qs = new URLSearchParams();
  if (ownerUserId) qs.set("owner_user_id", ownerUserId);
  qs.set("limit", String(limit));
  const resp = await apiFetch(`/model-versions?${qs.toString()}`, { token });
  return resp.json();
}

export async function apiGetModelVersion(id, token) {
  const resp = await apiFetch(`/model-versions/${id}?ts=${Date.now()}`, { token });
  return resp.json();
}

export async function apiUploadModel({
  modelName,
  modelDescription,
  modelCategory,
  modelTags,
  thumbnailFile,
  sourceFormat,
  conversionProfile,
  file,
  token,
}) {
  const form = new FormData();
  // Передаем только бизнес-поля модели, без технических id в UI.
  form.append("model_name", modelName);
  form.append("model_description", modelDescription || "");
  form.append("model_category", modelCategory || "");
  form.append("model_tags", modelTags || "");
  if (thumbnailFile) form.append("thumbnail_file", thumbnailFile);
  form.append("source_format", sourceFormat);
  form.append("conversion_profile", conversionProfile);
  form.append("file", file);

  const resp = await apiFetch("/uploads", { token, method: "POST", body: form });
  return resp.json();
}

export async function apiListModelCategories() {
  const resp = await apiFetch("/model-categories");
  return resp.json();
}

export async function apiApproveModelVersion({ modelVersionId, decision, comment, actorUserId, token }) {
  const resp = await apiFetch(`/model-versions/${modelVersionId}/approval`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision,
      comment: comment || null,
      created_by_user_id: actorUserId || null,
    }),
  });
  return resp.json();
}

export async function apiReactToModelVersion({ modelVersionId, decision, token }) {
  const resp = await apiFetch(`/model-versions/${modelVersionId}/reaction`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  return resp.json();
}

export async function apiUpdateModelVersion({ modelVersionId, token, modelName, modelDescription, modelCategory, modelTags }) {
  const resp = await apiFetch(`/model-versions/${modelVersionId}`, {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_name: modelName,
      model_description: modelDescription,
      model_category: modelCategory,
      model_tags: modelTags,
    }),
  });
  return resp.json();
}

export async function apiFullUpdateModelVersion({
  modelVersionId,
  token,
  modelName,
  modelDescription,
  modelCategory,
  modelTags,
  sourceFormat,
  conversionProfile,
  file,
  thumbnailFile,
}) {
  const form = new FormData();
  form.append("model_name", modelName);
  form.append("model_description", modelDescription || "");
  form.append("model_category", modelCategory || "");
  form.append("model_tags", modelTags || "");
  form.append("source_format", sourceFormat);
  form.append("conversion_profile", conversionProfile);
  if (file) form.append("file", file);
  if (thumbnailFile) form.append("thumbnail_file", thumbnailFile);

  const resp = await apiFetch(`/model-versions/${modelVersionId}/full-edit`, {
    token,
    method: "PUT",
    body: form,
  });
  return resp.json();
}

export async function apiDeleteModelVersion(modelVersionId, token) {
  const resp = await apiFetch(`/model-versions/${modelVersionId}`, { token, method: "DELETE" });
  return resp.json();
}

export async function apiDeleteCurrentAccount(token) {
  const resp = await apiFetch("/me", { token, method: "DELETE" });
  return resp.json();
}

export async function apiListSavedModels(token) {
  const resp = await apiFetch("/me/saved-models", { token });
  return resp.json();
}

export async function apiSaveModel(modelVersionId, token) {
  const resp = await apiFetch(`/me/saved-models/${modelVersionId}`, { token, method: "PUT" });
  return resp.json();
}

export async function apiUnsaveModel(modelVersionId, token) {
  const resp = await apiFetch(`/me/saved-models/${modelVersionId}`, { token, method: "DELETE" });
  return resp.json();
}

export async function apiAdminListUsers({ token, limit = 50, pageToken = "" }) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (pageToken) qs.set("page_token", pageToken);
  const resp = await apiFetch(`/admin/users?${qs.toString()}`, { token });
  return resp.json();
}

export async function apiAdminSetUserRole({ token, uid, role }) {
  const resp = await apiFetch(`/admin/users/${uid}/role`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return resp.json();
}

export async function apiAdminListModelCategories({ token }) {
  const resp = await apiFetch("/admin/model-categories", { token });
  return resp.json();
}

export async function apiAdminCreateModelCategory({ token, label }) {
  const resp = await apiFetch("/admin/model-categories", {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  return resp.json();
}

export async function apiAdminDeleteModelCategory({ token, categoryId }) {
  const resp = await apiFetch(`/admin/model-categories/${categoryId}`, { token, method: "DELETE" });
  return resp.json();
}

export async function apiAdminUpdateModelCategory({ token, categoryId, label, sortOrder }) {
  const body = {};
  if (label !== undefined) body.label = label;
  if (sortOrder !== undefined) body.sort_order = sortOrder;
  const resp = await apiFetch(`/admin/model-categories/${categoryId}`, {
    token,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.json();
}

export function buildDownloadUrl({ modelVersionId, kind, token }) {
  return withAuthToken(`${API_BASE}/model-versions/${modelVersionId}/download?kind=${kind}`, token);
}
