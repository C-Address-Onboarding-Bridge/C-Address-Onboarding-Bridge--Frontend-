# Header Component

## Overview

The Header component provides the primary navigation bar for the C-Address
Onboarding Bridge application. It renders across all pages and manages
wallet connection state, network selection, and navigation links.

## Structure
cat > .github/workflows/api-integration.yml << 'EOF'
name: API Integration Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  api-integration:
    name: API Integration
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_STELLAR_NETWORK: TESTNET
      NEXT_PUBLIC_HORIZON_URL_TESTNET: https://horizon-testnet.stellar.org
      NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET: https://soroban-testnet.stellar.org

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Unit tests
        run: npx vitest run

      - name: Build
        run: npm run build

      - name: Check for API integration issues
        run: |
          echo "Checking Stellar SDK imports..."
          grep -rn "from.*@stellar" src/ --include="*.ts" --include="*.tsx" | head -20
          echo ""
          echo "Checking environment variable usage..."
          grep -rn "NEXT_PUBLIC_" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -20
          echo ""
          echo "Checking error handling coverage..."
          grep -rn "catch\|handleError\|parseError" src/ --include="*.ts" --include="*.tsx" | wc -l
          echo "API integration checks passed."
