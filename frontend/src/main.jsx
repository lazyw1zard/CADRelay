import React from "react";
import { createRoot } from "react-dom/client";
import { AppRouter } from "./router/AppRouter";
import "./styles/main.scss";

// Точка входа React-приложения: монтируем App в #root.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
