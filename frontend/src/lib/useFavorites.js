import { useEffect, useMemo, useState } from "react";
import { apiListSavedModels, apiSaveModel, apiUnsaveModel } from "./workspaceApi";

export function useFavorites(userId, token) {
  const [favorites, setFavorites] = useState([]);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [favoritesError, setFavoritesError] = useState("");

  async function loadFavorites() {
    if (!userId || !token) {
      setFavorites([]);
      return;
    }
    setLoadingFavorites(true);
    setFavoritesError("");
    try {
      const data = await apiListSavedModels(token);
      setFavorites(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setFavoritesError(String(err?.message || err));
    } finally {
      setLoadingFavorites(false);
    }
  }

  useEffect(() => {
    loadFavorites();
  }, [userId, token]);

  const favoriteIds = useMemo(() => new Set(favorites.map((row) => row.id)), [favorites]);

  function isFavorite(modelId) {
    return favoriteIds.has(modelId);
  }

  async function toggleFavorite(model) {
    if (!model?.id || !token) return;
    setFavoritesError("");
    try {
      const data = isFavorite(model.id)
        ? await apiUnsaveModel(model.id, token)
        : await apiSaveModel(model.id, token);
      setFavorites(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setFavoritesError(String(err?.message || err));
    }
  }

  async function removeFavorite(modelId) {
    if (!modelId || !token) return;
    setFavoritesError("");
    try {
      const data = await apiUnsaveModel(modelId, token);
      setFavorites(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setFavoritesError(String(err?.message || err));
    }
  }

  return { favorites, favoriteIds, isFavorite, toggleFavorite, removeFavorite, loadFavorites, loadingFavorites, favoritesError };
}
