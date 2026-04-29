export function formatErrorMessage(error, fallback = "Не удалось выполнить действие. Попробуй ещё раз.") {
  const raw = String(error?.message || error || "").trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
    return "Не удалось подключиться к серверу. Проверь, что backend запущен.";
  }

  if (lower.includes("auth/invalid-credential") || lower.includes("auth/user-not-found") || lower.includes("auth/wrong-password")) {
    return "Неверный email или пароль.";
  }
  if (lower.includes("auth/email-already-in-use")) return "Этот email уже зарегистрирован.";
  if (lower.includes("auth/weak-password")) return "Пароль слишком слабый. Используй минимум 6 символов.";
  if (lower.includes("auth/too-many-requests")) return "Слишком много попыток. Подожди немного и попробуй снова.";
  if (lower.includes("auth/network-request-failed")) return "Не удалось связаться с Firebase. Проверь соединение.";

  const apiMatch = raw.match(/failed \((\d{3})\):/i);
  if (apiMatch) {
    const status = Number(apiMatch[1]);
    if (status === 400) return "Запрос не прошел проверку. Проверь введенные данные.";
    if (status === 401) return "Сессия истекла. Войди снова.";
    if (status === 403) return "Недостаточно прав для этого действия.";
    if (status === 404) return "Запрошенная запись не найдена.";
    if (status === 409) return "Такое действие конфликтует с текущим состоянием данных.";
    if (status >= 500) return "Сервер не смог обработать запрос. Попробуй позже.";
    return fallback;
  }

  if (raw.length <= 120 && !raw.includes("/api/") && !raw.includes("GET ") && !raw.includes("POST ")) {
    return raw;
  }

  return fallback;
}
