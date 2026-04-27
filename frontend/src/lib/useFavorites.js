import { useEffect, useMemo, useState } from "react";

const FAVORITES_STORAGE_PREFIX = "cadrelay_favorites";

function getStorageKey(userId) {
  return `${FAVORITES_STORAGE_PREFIX}:${userId || "anonymous"}`;
}

function readFavorites(userId) {
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFavorites(userId, rows) {
  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(rows));
  } catch {
    // Favorites are an MVP convenience layer; storage failures should not block the UI.
  }
}

function toFavoriteRecord(model) {
  return {
    id: model.id,
    model_id: model.model_id,
    model_name: model.model_name,
    model_description: model.model_description,
    model_category: model.model_category,
    model_tags: Array.isArray(model.model_tags) ? model.model_tags : [],
    source_format: model.source_format,
    conversion_profile: model.conversion_profile,
    status: model.status,
    owner_user_id: model.owner_user_id,
    created_at: model.created_at,
    preview_available: Boolean(model.preview_available || model.storage_key_glb),
    custom_thumbnail_available: Boolean(model.custom_thumbnail_available || model.storage_key_thumbnail_custom),
    saved_at: new Date().toISOString(),
  };
}

export function useFavorites(userId) {
  const [favorites, setFavorites] = useState(() => readFavorites(userId));

  useEffect(() => {
    setFavorites(readFavorites(userId));
  }, [userId]);

  const favoriteIds = useMemo(() => new Set(favorites.map((row) => row.id)), [favorites]);

  function isFavorite(modelId) {
    return favoriteIds.has(modelId);
  }

  function toggleFavorite(model) {
    if (!model?.id) return;
    setFavorites((prev) => {
      const exists = prev.some((row) => row.id === model.id);
      const next = exists
        ? prev.filter((row) => row.id !== model.id)
        : [toFavoriteRecord(model), ...prev.filter((row) => row.id !== model.id)];
      writeFavorites(userId, next);
      return next;
    });
  }

  function removeFavorite(modelId) {
    setFavorites((prev) => {
      const next = prev.filter((row) => row.id !== modelId);
      writeFavorites(userId, next);
      return next;
    });
  }

  return { favorites, favoriteIds, isFavorite, toggleFavorite, removeFavorite };
}
