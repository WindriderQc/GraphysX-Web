import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { KIDX_PROGRESS_KEY, readKidxProgress, type KidxDocument } from "./kidx-library";

GlobalWorkerOptions.workerSrc = workerUrl;

export function mountKidxPdfReader(root: HTMLElement, document: KidxDocument, local: boolean, onClose: () => void) {
  const panel = window.document.createElement("section");
  panel.className = "kx-reader";
  panel.setAttribute("aria-label", `Notice de ${document.title}`);
  panel.innerHTML = `<header class="kx-reader-head"><button data-reader-back>← Bibliothèque</button><div><small>NOTICE LEGO · PAS À PAS</small><h2></h2></div><a target="_blank" rel="noopener noreferrer">PDF original ↗</a></header>
    <div class="kx-reader-status" role="status">Ouverture de la notice…</div>
    <div class="kx-paper"><canvas aria-label="Page de la notice LEGO"></canvas></div>
    <footer class="kx-reader-controls"><button data-page-prev aria-label="Page précédente">←</button><label>Page <input data-page-number type="number" min="1" inputmode="numeric" aria-label="Numéro de page"> <span data-page-total></span></label><button data-page-next aria-label="Page suivante">→</button><button data-page-zoom aria-label="Agrandir la page">Zoom +</button></footer>`;
  panel.querySelector("h2")!.textContent = document.title;
  const source = panel.querySelector("a")!;
  const url = local ? `/kidx-documents/${document.id}.pdf` : document.sourceUrl;
  source.hidden = !url;
  if (url) source.href = url;
  const paper = panel.querySelector<HTMLElement>(".kx-paper")!;
  const canvas = panel.querySelector("canvas")!;
  const status = panel.querySelector<HTMLElement>(".kx-reader-status")!;
  const previous = panel.querySelector<HTMLButtonElement>("[data-page-prev]")!;
  const next = panel.querySelector<HTMLButtonElement>("[data-page-next]")!;
  const number = panel.querySelector<HTMLInputElement>("input")!;
  const zoomButton = panel.querySelector<HTMLButtonElement>("[data-page-zoom]")!;
  let pdf: PDFDocumentProxy | null = null;
  let task: RenderTask | null = null;
  let page = 1;
  try { page = readKidxProgress(localStorage)[document.id] ?? 1; } catch { /* browser storage is optional */ }
  let zoom = false;
  let revision = 0;
  let loadRevision = 0;
  let disposed = false;
  let loading: ReturnType<typeof getDocument> | null = null;
  const controls = () => {
    previous.disabled = !pdf || page <= 1;
    next.disabled = !pdf || page >= pdf.numPages;
    number.disabled = !pdf;
    number.value = String(page);
    number.max = String(pdf?.numPages ?? document.pages);
    panel.querySelector("[data-page-total]")!.textContent = `/ ${pdf?.numPages ?? document.pages}`;
    zoomButton.disabled = !pdf;
  };
  const render = async () => {
    if (!pdf || disposed) return;
    const token = ++revision;
    const previousTask = task;
    previousTask?.cancel();
    delete panel.dataset.page;
    controls();
    status.textContent = "Chargement de la page…";
    try {
      // PDF.js owns the canvas until the cancelled render has settled.
      await previousTask?.promise.catch(() => {});
      if (token !== revision || disposed) return;
      const pdfPage = await pdf.getPage(page);
      if (token !== revision || disposed) return;
      const natural = pdfPage.getViewport({ scale: 1 });
      const fit = Math.min((paper.clientWidth - 28) / natural.width, (paper.clientHeight - 28) / natural.height);
      const cssScale = Math.max(.15, fit) * (zoom ? 1.8 : 1);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: cssScale * pixelRatio });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${natural.width * cssScale}px`;
      canvas.style.height = `${natural.height * cssScale}px`;
      task = pdfPage.render({ canvas, viewport });
      await task.promise;
      if (token !== revision || disposed) return;
      status.textContent = `Page ${page} sur ${pdf.numPages} · Observe les pièces, puis passe à la suite.`;
      panel.dataset.page = String(page);
      try {
        localStorage.setItem(KIDX_PROGRESS_KEY, JSON.stringify({ ...readKidxProgress(localStorage), [document.id]: page }));
      } catch { status.textContent += " La reprise ne peut pas être enregistrée dans ce navigateur."; }
    } catch (error) {
      if (token === revision && !disposed && !(error instanceof Error && error.name === "RenderingCancelledException"))
        status.textContent = "Cette page n’a pas pu être affichée. Réessaie ou ouvre le PDF original.";
    }
  };
  const go = (value: number) => {
    if (!pdf || !Number.isFinite(value)) { controls(); return; }
    page = Math.max(1, Math.min(pdf.numPages, Math.floor(value)));
    paper.scrollTo(0, 0);
    void render();
  };
  const load = async (source: string | Uint8Array) => {
    const token = ++loadRevision;
    try {
      await loading?.destroy();
      if (disposed || token !== loadRevision) return;
      const current = getDocument(typeof source === "string" ? { url: source } : { data: source });
      loading = current;
      const loaded = await current.promise;
      if (disposed || token !== loadRevision) { await current.destroy(); return; }
      pdf = loaded;
      page = Math.min(page, pdf.numPages);
      controls();
      await render();
    } catch {
      if (!disposed && token === loadRevision) showImport();
    }
  };
  const showImport = () => {
    status.replaceChildren(window.document.createTextNode("Ajoute cette notice depuis ton ordinateur pour la lire ici. "));
    const input = window.document.createElement("input");
    input.type = "file"; input.accept = "application/pdf,.pdf";
    input.setAttribute("aria-label", "Choisir la notice PDF");
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.name !== document.filename) { status.firstChild!.textContent = `Choisis le fichier ${document.filename}. `; return; }
      void file.arrayBuffer().then((data) => load(new Uint8Array(data)));
    });
    status.append(input);
  };
  previous.addEventListener("click", () => go(page - 1));
  next.addEventListener("click", () => go(page + 1));
  number.addEventListener("change", () => go(Number(number.value)));
  zoomButton.addEventListener("click", () => { zoom = !zoom; zoomButton.textContent = zoom ? "Ajuster" : "Zoom +"; void render(); });
  panel.querySelector("[data-reader-back]")!.addEventListener("click", onClose);
  const keyboard = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === "ArrowRight") { event.preventDefault(); go(page + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(page - 1); }
    if (event.key === "Escape") onClose();
  };
  panel.addEventListener("keydown", keyboard);
  let resizeTimer: ReturnType<typeof setTimeout>;
  const resize = new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => void render(), 120); });
  root.append(panel); resize.observe(paper); controls();
  panel.querySelector<HTMLButtonElement>("[data-reader-back]")!.focus();
  if (url) void load(url); else showImport();
  return {
    state: () => ({ documentId: document.id, page, pages: pdf?.numPages ?? document.pages, loaded: Boolean(pdf), zoom }),
    dispose: () => { disposed = true; revision++; loadRevision++; clearTimeout(resizeTimer); resize.disconnect(); task?.cancel(); void loading?.destroy(); panel.remove(); },
  };
}
