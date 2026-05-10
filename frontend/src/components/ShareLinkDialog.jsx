import { Check, Copy, Link as LinkIcon, X } from "lucide-react";
import { useMemo, useState } from "react";

function fallbackCopy(value) {
  const el = document.createElement("textarea");
  el.value = value;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

export function ShareLinkDialog({ open, title = "Ссылка на модель", shareUrl, note, error, onClose }) {
  const [copied, setCopied] = useState(false);
  const displayUrl = useMemo(() => shareUrl || "", [shareUrl]);

  if (!open) return null;

  async function copyLink() {
    if (!displayUrl) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(displayUrl);
      } else {
        fallbackCopy(displayUrl);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      fallbackCopy(displayUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <div className="share-dialog-layer" role="presentation">
      <button type="button" className="share-dialog-scrim" onClick={onClose} aria-label="Закрыть окно ссылки" />
      <section className="share-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <div>
            <p className="page-kicker">Sharing</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть" title="Закрыть">
            <X size={18} />
          </button>
        </header>

        <div className="share-dialog-body">
          {displayUrl ? (
            <label>
              Ссылка
              <div className="share-link-row">
                <LinkIcon size={16} />
                <input value={displayUrl} readOnly onFocus={(e) => e.target.select()} />
              </div>
            </label>
          ) : null}
          {note ? <p className="muted">{note}</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
        </div>

        <footer>
          <button type="button" className="button button-secondary" onClick={onClose}>
            Закрыть
          </button>
          <button type="button" className="button button-share" onClick={copyLink} disabled={!displayUrl}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Скопировано" : "Копировать"}
          </button>
        </footer>
      </section>
    </div>
  );
}
