import type { ClipboardResult } from './types';

export interface ClipboardEnvironment {
  readonly writeText?: (text: string) => Promise<void>;
  readonly execCommandCopy?: (text: string) => boolean;
}

function defaultExecCommandCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  document.body.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return typeof document.execCommand === 'function'
      ? document.execCommand('copy')
      : false;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

/**
 * Copies text to clipboard with automatic fallback for mobile WebViews (Threads/Instagram)
 * where navigator.clipboard may be undefined or blocked by permissions.
 */
export async function copyTextToClipboard(
  text: string,
  summaryLabel: string,
  env?: ClipboardEnvironment,
): Promise<ClipboardResult> {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const cleanLabel = summaryLabel.trim() || 'результат расчёта';

  if (!normalizedText) {
    return {
      ok: false,
      method: 'failed',
      summaryLabel: cleanLabel,
      message: 'Не удалось скопировать: пустой текст результата.',
    };
  }

  const writeTextFn =
    env?.writeText ??
    (typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
      ? (val: string) => navigator.clipboard.writeText(val)
      : undefined);

  if (writeTextFn) {
    try {
      await writeTextFn(normalizedText);
      return {
        ok: true,
        method: 'clipboard-api',
        summaryLabel: cleanLabel,
        message: `Скопировано в буфер: ${cleanLabel}`,
      };
    } catch {
      // Fall through to execCommand fallback for restricted WebView contexts
    }
  }

  const execCopyFn = env?.execCommandCopy ?? defaultExecCommandCopy;
  try {
    const copied = execCopyFn(normalizedText);
    if (copied) {
      return {
        ok: true,
        method: 'exec-command',
        summaryLabel: cleanLabel,
        message: `Скопировано в буфер: ${cleanLabel}`,
      };
    }
  } catch {
    // Ignore and return structured failure below
  }

  return {
    ok: false,
    method: 'failed',
    summaryLabel: cleanLabel,
    message: `Буфер обмена заблокирован браузером. Выделите и скопируйте вручную: ${cleanLabel}`,
  };
}
