const PREFERENCES_KEY = "graphysx.shelf.preferences.v1";

type ShelfPreferences = {
  favorites: string[];
  recent: Record<string, number>;
};

const emptyPreferences = (): ShelfPreferences => ({ favorites: [], recent: {} });

function readPreferences(): ShelfPreferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY) ?? "null") as Partial<ShelfPreferences> | null;
    return {
      favorites: Array.isArray(value?.favorites) ? value.favorites.filter((key): key is string => typeof key === "string") : [],
      recent: value?.recent && typeof value.recent === "object" ? value.recent as Record<string, number> : {},
    };
  } catch {
    return emptyPreferences();
  }
}

function writePreferences(preferences: ShelfPreferences): void {
  try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* optional enhancement */ }
}

/** Search, favorites, recent ordering, reset, counts, and empty guidance shared by both shelves. */
export function mountShelfPersonalization(
  card: HTMLElement,
  list: HTMLElement,
  options: { label: string; placeholder: string },
): () => void {
  let preferences = readPreferences();
  const items = Array.from(list.querySelectorAll<HTMLElement>("[data-shelf-key]"));
  const originalOrder = new Map(items.map((item, index) => [item, index]));

  const controls = document.createElement("div");
  controls.className = "gx-shelf-tools";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "gx-shelf-search";
  search.placeholder = options.placeholder;
  search.setAttribute("aria-label", options.placeholder);
  const count = document.createElement("span");
  count.className = "gx-shelf-count";
  count.setAttribute("aria-live", "polite");
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "gx-shelf-reset";
  reset.textContent = "Reset preferences";
  reset.title = "Clear favorites and recent ordering";
  controls.append(search, count, reset);

  const empty = document.createElement("div");
  empty.className = "gx-shelf-empty";
  empty.hidden = true;
  empty.innerHTML = `<strong>No matches</strong><span>Try a course, scene, archive name, or clear the search.</span>`;
  list.append(empty);

  const update = (): void => {
    const favoriteSet = new Set(preferences.favorites);
    for (const item of items) {
      const key = item.dataset.shelfKey ?? "";
      const favorite = favoriteSet.has(key);
      item.classList.toggle("gx-shelf-item--favorite", favorite);
      const star = item.querySelector<HTMLElement>(".gx-shelf-favorite");
      if (star) {
        star.textContent = favorite ? "★" : "☆";
        star.title = favorite ? "Remove from favorites" : "Add to favorites";
        star.setAttribute("aria-label", `${favorite ? "Remove" : "Add"} ${item.dataset.shelfLabel ?? "item"} ${favorite ? "from" : "to"} favorites`);
        star.setAttribute("aria-pressed", String(favorite));
      }
      const tag = item.querySelector<HTMLElement>(".gx-shelf-personal-tag");
      if (tag) {
        const recent = Number(preferences.recent[key] ?? 0) > 0;
        tag.textContent = favorite ? "Favorite" : recent ? "Recent" : "";
        tag.hidden = !favorite && !recent;
      }
    }
    items.sort((a, b) => {
      const aKey = a.dataset.shelfKey ?? "";
      const bKey = b.dataset.shelfKey ?? "";
      const favoriteDelta = Number(favoriteSet.has(bKey)) - Number(favoriteSet.has(aKey));
      if (favoriteDelta) return favoriteDelta;
      const recentDelta = Number(preferences.recent[bKey] ?? 0) - Number(preferences.recent[aKey] ?? 0);
      return recentDelta || (originalOrder.get(a) ?? 0) - (originalOrder.get(b) ?? 0);
    });
    list.append(...items, empty);
    applyFilter();
  };

  const applyFilter = (): void => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const item of items) {
      const searchable = item.dataset.shelfSearch ?? item.textContent ?? "";
      item.hidden = !!query && !searchable.toLocaleLowerCase().includes(query);
      if (!item.hidden) visible += 1;
    }
    count.textContent = `${visible} of ${items.length} ${options.label}`;
    empty.hidden = visible > 0;
  };

  for (const item of items) {
    const star = document.createElement("span");
    star.className = "gx-shelf-favorite";
    star.setAttribute("role", "button");
    star.tabIndex = 0;
    const tag = document.createElement("span");
    tag.className = "gx-shelf-personal-tag";
    tag.hidden = true;
    const toggleFavorite = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      const key = item.dataset.shelfKey ?? "";
      const favorites = new Set(preferences.favorites);
      if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
      preferences.favorites = [...favorites];
      writePreferences(preferences);
      update();
      star.focus();
    };
    star.addEventListener("click", toggleFavorite);
    star.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") toggleFavorite(event);
    });
    item.addEventListener("click", (event) => {
      if ((event.target as Element | null)?.closest(".gx-shelf-favorite")) return;
      const key = item.dataset.shelfKey ?? "";
      preferences.recent[key] = Date.now();
      writePreferences(preferences);
    }, { capture: true });
    item.append(tag, star);
  }

  search.addEventListener("input", applyFilter);
  reset.addEventListener("click", () => {
    preferences = emptyPreferences();
    writePreferences(preferences);
    update();
    search.focus();
  });
  card.insertBefore(controls, list);
  update();

  return () => controls.remove();
}

export const SHELF_PERSONALIZATION_CSS = `
.gx-shelf-tools{display:flex;align-items:center;gap:8px}
.gx-shelf-search{flex:1;min-width:0;padding:8px 10px;border:1px solid rgba(79,208,230,.3);border-radius:8px;background:rgba(5,18,26,.9);color:var(--gx-ink);font:12px/1.2 var(--gx-font);outline:none}
.gx-shelf-search:focus{border-color:var(--gx-accent);box-shadow:0 0 0 3px var(--gx-accent-ring)}
.gx-shelf-count{color:var(--gx-ink-faint);font:10.5px/1 var(--gx-font);white-space:nowrap}
.gx-shelf-reset{padding:7px 9px;border:1px solid rgba(120,240,208,.25);border-radius:7px;background:transparent;color:var(--gx-ink-soft);cursor:pointer;font:10.5px/1 var(--gx-font)}
.gx-shelf-reset:hover,.gx-shelf-reset:focus-visible{border-color:var(--gx-accent);color:var(--gx-ink);outline:none}
[data-shelf-key]{position:relative}
[data-shelf-key][hidden]{display:none}
.gx-shelf-favorite{position:absolute;z-index:3;right:8px;top:7px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(120,240,208,.25);border-radius:999px;background:rgba(4,16,23,.82);color:#ffcd4d;cursor:pointer;font:17px/1 sans-serif}
.gx-shelf-favorite:hover,.gx-shelf-favorite:focus-visible{outline:none;border-color:#ffcd4d;transform:scale(1.06)}
.gx-shelf-personal-tag{position:absolute;z-index:2;left:9px;top:8px;padding:3px 7px;border-radius:999px;background:rgba(4,16,23,.86);border:1px solid rgba(255,205,77,.42);color:#ffdc7a;font:700 8.5px/1 var(--gx-font);letter-spacing:.06em;text-transform:uppercase}
.gx-shelf-empty{grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:28px;border:1px dashed rgba(79,208,230,.28);border-radius:10px;color:var(--gx-ink-faint);text-align:center;font:12px/1.4 var(--gx-font)}
.gx-shelf-empty[hidden]{display:none}.gx-shelf-empty strong{color:var(--gx-ink);font-size:14px}
@media(max-width:640px){.gx-shelf-tools{flex-wrap:wrap}.gx-shelf-search{flex-basis:100%}.gx-shelf-reset{margin-left:auto}}
@media(prefers-reduced-motion:reduce){.gx-shelf-favorite{transition:none}.gx-shelf-favorite:hover{transform:none}}
`;
