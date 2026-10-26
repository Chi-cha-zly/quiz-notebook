#!/bin/bash
# Build: scripts/build-macos.sh [--dmg] [--arm64-only]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(mktemp -d /tmp/quiz-macos-build.XXXXXX)"
DMG_MOUNT=""
cleanup() {
  if [[ -n "$DMG_MOUNT" ]]; then
    # Never remove a staging tree while its disk image is still mounted.
    if ! hdiutil detach "$DMG_MOUNT"; then
      printf 'Could not detach image; retained staging directory: %s\n' "$BUILD" >&2
      return 1
    fi
  fi
  rm -rf "$BUILD"
}
trap cleanup EXIT
DMG=0
UNIVERSAL=1
for arg in "$@"; do
  case "$arg" in
    --dmg) DMG=1 ;;
    --arm64-only) UNIVERSAL=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
APP="$BUILD/自测本.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web" "$ROOT/release"
cp -X "$ROOT/desktop/Info.plist" "$APP/Contents/Info.plist"
for asset in index.html styles.css core.js app.js; do cp -X "$ROOT/$asset" "$APP/Contents/Resources/web/$asset"; done
for arch in arm64 x86_64; do
  if [[ "$arch" == x86_64 && "$UNIVERSAL" == 0 ]]; then continue; fi
  xcrun swiftc -parse-as-library -O -target "$arch-apple-macos13.0" -module-cache-path /tmp/quiz-swift-module-cache -framework AppKit -framework WebKit "$ROOT/desktop/Services.swift" "$ROOT/desktop/main.swift" -o "$BUILD/QuizNotebook-$arch"
done
if [[ "$UNIVERSAL" == 1 ]]; then
  xcrun lipo -create "$BUILD/QuizNotebook-arm64" "$BUILD/QuizNotebook-x86_64" -output "$APP/Contents/MacOS/QuizNotebook"
else
  cp -X "$BUILD/QuizNotebook-arm64" "$APP/Contents/MacOS/QuizNotebook"
fi
cp -X "$ROOT/desktop/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
# Strip local filesystem metadata before signing the fresh staging bundle.
xattr -cr "$APP"
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
# Replace only this build's named release outputs. User data lives elsewhere.
rm -rf "$ROOT/release/自测本.app"
ditto --norsrc --noextattr --noqtn "$APP" "$ROOT/release/自测本.app"
rm -f "$ROOT/release/自测本-macOS.zip"
ditto --norsrc --noextattr --noqtn -c -k --keepParent "$APP" "$ROOT/release/自测本-macOS.zip"
if [[ "$DMG" == 1 ]]; then
  mkdir -p "$BUILD/dmg"
  ditto --norsrc --noextattr --noqtn "$APP" "$BUILD/dmg/自测本.app"
  ln -s /Applications "$BUILD/dmg/Applications"
  # HFS authoring omits APFS provenance attributes which macOS can regenerate
  # immediately after xattr cleanup. Direct create -srcfolder copies them.
  hdiutil makehybrid -hfs -hfs-volume-name '自测本' -o "$BUILD/dmg-hybrid.dmg" "$BUILD/dmg"
  hdiutil convert "$BUILD/dmg-hybrid.dmg" -format UDRW -o "$BUILD/dmg-writable.dmg"
  hdiutil attach -nobrowse -mountpoint "$BUILD/dmg-mount" "$BUILD/dmg-writable.dmg"
  DMG_MOUNT="$BUILD/dmg-mount"
  # makehybrid writes Finder positions, which strict codesign rejects.
  # Removing them on HFS does not recreate APFS provenance attributes.
  xattr -cr "$DMG_MOUNT/自测本.app"
  codesign --verify --deep --strict "$DMG_MOUNT/自测本.app"
  [[ -L "$DMG_MOUNT/Applications" && "$(readlink "$DMG_MOUNT/Applications")" == /Applications ]]
  hdiutil detach "$DMG_MOUNT"
  DMG_MOUNT=""
  if LC_ALL=C grep -aFq 'com.apple.provenance' "$BUILD/dmg-writable.dmg"; then
    printf 'Refusing to publish disk image containing local provenance metadata.\n' >&2
    exit 1
  fi
  hdiutil convert "$BUILD/dmg-writable.dmg" -format UDZO -ov -o "$ROOT/release/自测本-macOS.dmg"
fi
printf 'Built: %s\n' "$ROOT/release/自测本.app"
lipo -archs "$ROOT/release/自测本.app/Contents/MacOS/QuizNotebook"
