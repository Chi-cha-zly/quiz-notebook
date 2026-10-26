#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="$(mktemp -d /tmp/quiz-native-tests.XXXXXX)"
trap 'rm -rf "$BUILD"' EXIT
xcrun swiftc -module-cache-path "/tmp/quiz-swift-module-cache" "$ROOT/desktop/Services.swift" "$ROOT/desktop/tests/ServicesTests.swift" -o "$BUILD/services-tests"
"$BUILD/services-tests"
