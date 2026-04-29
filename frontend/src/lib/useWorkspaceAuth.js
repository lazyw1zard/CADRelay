import { useEffect, useState } from "react";
import {
  getCurrentIdToken,
  getCurrentIdTokenResult,
  getFirebaseConfigStatus,
  watchAuthState,
} from "./firebaseAuth";
import { formatErrorMessage } from "./errorMessages";

export function useWorkspaceAuth() {
  const firebaseReady = getFirebaseConfigStatus();
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [authUser, setAuthUser] = useState(null);
  const [idToken, setIdToken] = useState("");
  const [authRole, setAuthRole] = useState("editor");
  const [emailVerified, setEmailVerified] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!firebaseReady) return undefined;
    const stop = watchAuthState(async (user) => {
      setAuthUser(user || null);
      if (!user) {
        setIdToken("");
        setAuthRole("editor");
        setEmailVerified(false);
        setAuthReady(true);
        return;
      }
      try {
        // На каждом входе синхронизируем token + role + verify-статус.
        const token = await getCurrentIdToken();
        const tokenResult = await getCurrentIdTokenResult();
        const roleClaim = tokenResult?.claims?.role;
        const verifiedClaim = tokenResult?.claims?.email_verified;
        setIdToken(token || "");
        setAuthRole(typeof roleClaim === "string" ? roleClaim : "editor");
        setEmailVerified(Boolean(user.emailVerified || verifiedClaim));
        setAuthError("");
      } catch (err) {
        setIdToken("");
        setAuthRole("editor");
        setEmailVerified(Boolean(user.emailVerified));
        setAuthError(formatErrorMessage(err, "Не удалось проверить сессию пользователя."));
      } finally {
        setAuthReady(true);
      }
    });
    return stop;
  }, [firebaseReady]);

  return {
    firebaseReady,
    authReady,
    authUser,
    idToken,
    authRole,
    emailVerified,
    authError,
  };
}
