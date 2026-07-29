Set-Location "C:\Users\Yanik\codes\GraphysX-Web"
git fetch origin
git switch main
git pull --ff-only origin main
git am --3way ".\patches\shader-ppl-r1\0001-feat-revival-restore-BallZ-ppl-shader.patch"
npm run verify -- --wait
