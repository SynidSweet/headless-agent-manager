#!/bin/bash

# Frontend Test Isolation Validation Script

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Frontend Test Isolation System Validation               ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: TypeScript compilation
echo "📝 Check 1: TypeScript compilation..."
npx tsc --noEmit e2e/helpers/testIsolation.ts 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ testIsolation.ts compiles${NC}"
else
  echo -e "${RED}❌ testIsolation.ts has compilation errors${NC}"
  exit 1
fi

npx tsc --noEmit e2e/fullstack/event-driven-core-isolated.spec.ts 2>&1
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ event-driven-core-isolated.spec.ts compiles${NC}"
else
  echo -e "${RED}❌ event-driven-core-isolated.spec.ts has compilation errors${NC}"
  exit 1
fi

echo ""

# Check 2: Files exist
echo "📁 Check 2: Required files exist..."
files=(
  "e2e/helpers/testIsolation.ts"
  "e2e/fullstack/event-driven-core-isolated.spec.ts"
  "e2e/TEST_ISOLATION_MIGRATION.md"
  "e2e/ISOLATION_SYSTEM_SUMMARY.md"
)

all_exist=true
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✅ $file${NC}"
  else
    echo -e "${RED}❌ $file (missing)${NC}"
    all_exist=false
  fi
done

if [ "$all_exist" = false ]; then
  exit 1
fi

echo ""

# Check 3: Backend running
echo "🔌 Check 3: Backend health..."
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health)
if [ "$response" = "200" ]; then
  echo -e "${GREEN}✅ Backend is running (port 3001)${NC}"
else
  echo -e "${YELLOW}⚠️  Backend not running - tests will fail${NC}"
  echo "   Start backend: cd ../backend && npm run dev"
fi

echo ""

# Summary
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  Validation Summary                                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Test isolation system is properly configured"
echo "✅ All files present and compile successfully"
echo ""
echo "Next steps:"
echo "1. Start backend: cd ../backend && npm run dev"
echo "2. Run reference tests: npm run test:e2e -- fullstack/event-driven-core-isolated.spec.ts"
echo "3. Migrate existing tests using: e2e/TEST_ISOLATION_MIGRATION.md"
echo ""
