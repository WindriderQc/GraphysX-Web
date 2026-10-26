# Modèles de la maison connectée (sources)

Dépose ici un `.glb` par machine, nommé par l'identifiant du nœud de `src/ecosystem-data.ts` :
`ugfrank.glb`, `nas.glb`, `ugalien.glb`, `ugbrutal.glb`, `devx.glb`, `piusb.glb`, `pit.glb`,
`babypi.glb`, `pitft.glb`, `deco.glb`, `browser.glb`, `phone.glb`, `gcal.glb`, `ugsmall.glb`,
`ugstation.glb`, `ugfrank-old.glb`, `pi123.glb`, et les services `core.glb`, `nestor.glb`,
`dsh.glb`, `imagex.glb`, `rag.glb`, `media.glb`, `homeassistant.glb`, `monitoring.glb`.

Règles d'export (Blender : File → Export → glTF 2.0, format **glb**, +Y up) :

- un seul fichier binaire, textures incluses (pas de `.bin` ni d'images à côté) ;
- le modèle repose sur y = 0, centré en x/z ; la face avant regarde +Z ;
- l'échelle n'a pas d'importance : la vue ajuste le modèle à la plus grande dimension de
  l'emplacement (`ECO_PLACEMENTS` dans `src/ecosystem-scene.ts`) ; garde les proportions ;
- triangles seulement, pas de squelette ni d'animation ; couleurs par `baseColorFactor`
  ou une texture `baseColorTexture` (PNG/JPG embarqué), rien d'autre n'est lu ;
- licence : CC0 ou tes propres modèles ; note la source dans le message de commit.

Puis :

```bash
node scripts/vendor-ecosystem-models.mjs
```

écrit `public/assets/ecosystem/models/<id>.json` et met à jour
`public/assets/ecosystem/models.json`, que `?app=ecosystem` lit au montage. Les `.glb`
sources restent hors git (`.gitignore`) ; seul le JSON converti est publié.
