#!/bin/zsh
# Build the web version of MonoMate and publish it to Cloudflare Pages (free).
# Run from anywhere: zsh scripts/deploy-website.sh
# First time only: `npx wrangler@4 login` (opens the browser to sign in to Cloudflare).
set -e
cd "$(dirname "$0")/.."
export PATH=/opt/homebrew/bin:$PATH
PROJECT=${MONOMATE_SITE:-monomate}
OUT=web-build

rm -rf $OUT
npx expo export -p web --output-dir $OUT

# Cloudflare never uploads folders named node_modules, and Expo puts the fonts and navigation
# icons in assets/node_modules/. Rename the folder and point the code at the new name.
mv $OUT/assets/node_modules $OUT/assets/_nm
grep -rl '/assets/node_modules/' $OUT/_expo | xargs perl -pi -e 's{/assets/node_modules/}{/assets/_nm/}g'
if grep -rq '/assets/node_modules/' $OUT; then echo "node_modules links left over" >&2; exit 1; fi

# Home-screen support: on iPhone, "Add to Home Screen" opens MonoMate full screen with its own icon.
sips -z 180 180 assets/icon.png --out $OUT/apple-touch-icon.png > /dev/null
sips -z 512 512 assets/icon.png --out $OUT/icon-512.png > /dev/null
cat > $OUT/manifest.json <<'EOF'
{
  "name": "MonoMate",
  "short_name": "MonoMate",
  "description": "Free chess: play bots, learn with a coach, review your games.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#FFFFFF",
  "icons": [{ "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }]
}
EOF
export HEAD='<meta name="description" content="Free chess: play bots, learn with a coach, review your games."/><meta name="theme-color" content="#FFFFFF"/><meta name="apple-mobile-web-app-capable" content="yes"/><meta name="mobile-web-app-capable" content="yes"/><meta name="apple-mobile-web-app-title" content="MonoMate"/><meta name="apple-mobile-web-app-status-bar-style" content="default"/><link rel="apple-touch-icon" href="/apple-touch-icon.png"/><link rel="manifest" href="/manifest.json"/>'
perl -0pi -e 's{</head>}{$ENV{HEAD}</head>}' $OUT/index.html
# Stop phones from zooming when a square is double-tapped.
perl -0pi -e 's#initial-scale=1, shrink-to-fit=no#initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover#' $OUT/index.html

# Upload. Wrangler runs from an empty folder: run inside the project it "auto-configures" it,
# writing wrangler.jsonc and exporting into dist/, which wipes the APK and Windows installer there.
# (The 'monomate' Pages project was created once with `wrangler pages project create --force`.)
SITE=$PWD/$OUT
EMPTY=$(mktemp -d)
cd $EMPTY
npx -y wrangler@4 pages deploy "$SITE" --project-name $PROJECT --branch main --commit-dirty=true
cd - > /dev/null
rm -rf $EMPTY
