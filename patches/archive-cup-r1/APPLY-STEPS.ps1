git fetch origin
git switch main
git pull --ff-only origin main
git am .\patches\archive-cup-r1\0001-feat-games-launch-the-Archive-Cup-campaign.patch
npm run verify -- --wait
