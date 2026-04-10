#!/bin/bash
# Check Recur environment setup

echo "🔍 Checking Recur environment..."
echo ""

# Check for recur-tw package
if [ -f "package.json" ]; then
  if grep -q '"recur-tw"' package.json; then
    VERSION=$(grep '"recur-tw"' package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
    echo "✅ recur-tw installed: $VERSION"
  else
    echo "❌ recur-tw not found in package.json"
    echo "   Run: pnpm add recur-tw"
  fi
else
  echo "⚠️  No package.json found in current directory"
fi

echo ""

# Check environment variables
check_env() {
  local var_name=$1
  local var_value=$(printenv "$var_name")

  if [ -n "$var_value" ]; then
    # Mask the value, show first 12 chars
    local masked="${var_value:0:12}..."
    echo "✅ $var_name: $masked"
  else
    echo "❌ $var_name: not set"
  fi
}

echo "Environment Variables:"
check_env "RECUR_PUBLISHABLE_KEY"
check_env "NEXT_PUBLIC_RECUR_PUBLISHABLE_KEY"
check_env "RECUR_SECRET_KEY"
check_env "RECUR_WEBHOOK_SECRET"

echo ""

# Check .env files
echo "Configuration Files:"
for file in .env .env.local .env.development .env.production; do
  if [ -f "$file" ]; then
    if grep -q "RECUR" "$file"; then
      echo "✅ $file contains RECUR variables"
    else
      echo "⚠️  $file exists but no RECUR variables"
    fi
  fi
done

echo ""
echo "Done! 🎉"
