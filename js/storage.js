const makeKey = () => crypto.randomUUID().replaceAll("-", "");

export function getBrowserKey(name) {
  const storageKey = `acfa:${name}`;
  let value = localStorage.getItem(storageKey);
  if (!value) {
    value = makeKey();
    localStorage.setItem(storageKey, value);
  }
  return value;
}

export function getTemplates() {
  try { return JSON.parse(localStorage.getItem("acfa:messageTemplates") || "[]"); }
  catch { return []; }
}

export function saveTemplate(template) {
  const templates = getTemplates();
  templates.unshift({ ...template, id: crypto.randomUUID(), savedAt: new Date().toISOString() });
  localStorage.setItem("acfa:messageTemplates", JSON.stringify(templates.slice(0, 25)));
  return templates;
}

export function clearTemplates() {
  localStorage.removeItem("acfa:messageTemplates");
}
