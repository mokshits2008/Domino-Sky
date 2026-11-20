#!/usr/bin/env bash
set -e

echo "=== DOMINO SKY VERIFICATION SUITE ==="

echo "1. TypeScript Typecheck..."
npx tsc --noEmit

echo "2. ESLint..."
npx eslint .

echo "3. Vitest Test Suite..."
npx vitest run

echo "4. Production Build..."
npx next build

echo "5. Playwright E2E Suite..."
npx playwright test

echo "=== ALL VERIFICATION CHECKS PASSED ==="
