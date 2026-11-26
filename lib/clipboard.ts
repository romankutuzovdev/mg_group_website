/** Copy on HTTPS and local/insecure browsers, with explicit failure reporting. */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Permission restrictions can still permit copying from a selected textarea.
  }
  const field = document.createElement("textarea");
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  document.body.appendChild(field);
  field.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Скопируйте текст вручную из поля ниже.");
  } finally {
    field.remove();
    focused?.focus({ preventScroll: true });
  }
}
