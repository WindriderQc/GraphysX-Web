# GraphysX Web progress

Original prompt: "lets go then, lets make this happen!!"

- 2026-07-18: Created the standalone web-product repository from GraphysX restoration commit `36eac3d5a023e7a21f7b319e6e335d7ffca7d1d1`.
- 2026-07-18: Kept only the runtime source, curated browser assets, operational QA, and agent adapter. Historical archives and generated browser output remain in the source GraphysX repository.
- 2026-07-18: Added an atomic static release workflow for `graphysx.specialblend.ca`.
- 2026-07-18: Vendored the ten vehicle models/textures used at runtime and removed the final build-time dependency on the historical archive tree.
- 2026-07-18: `npm ci` and `npm run build` pass with the Linux-generated cross-platform lockfile; Vite emits the ten curated vehicle assets in the standalone release.
- 2026-07-18: Generic web-game smoke test produced synchronized canvas/text state with no console errors. Agent World API v2 passed 69 assertions with zero errors. The fresh restoration matrix visually verified both vendored vehicle packs and progressed through the remaining archive worlds until the local command wrapper's two-minute ceiling; the same source baseline previously passed the complete 293-assertion release matrix.
- TODO: Point authoritative DNS for `graphysx.specialblend.ca` to `103.54.59.80`, then run the staged one-time nginx/TLS installer.
