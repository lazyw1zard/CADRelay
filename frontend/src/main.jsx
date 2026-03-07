import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Точка входа React-приложения: монтируем App в #root.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
