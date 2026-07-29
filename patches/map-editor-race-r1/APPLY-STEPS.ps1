Set-Location "C:\Users\Yanik\codes\GraphysX-Web"
git fetch origin
git switch main
git pull --ff-only origin main
git am --3way ".\patches\map-editor-race-r1\0001-feat-levels-author-playable-race-rules.patch"
npm run verify -- --wait
