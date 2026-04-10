#!/bin/bash
# Send a test webhook to your local endpoint
#
# Usage:
#   ./test-webhook.sh [endpoint] [event_type]
#
# Example:
#   ./test-webhook.sh http://localhost:3000/api/webhooks/recur checkout.completed

ENDPOINT="${1:-http://localhost:3000/api/webhooks/recur}"
EVENT_TYPE="${2:-checkout.completed}"
SECRET="${RECUR_WEBHOOK_SECRET:-test_secret}"

# Generate timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create payload based on event type
case $EVENT_TYPE in
  "checkout.completed")
    PAYLOAD=$(cat <<EOF
{
  "id": "evt_test_$(date +%s)",
  "type": "checkout.completed",
  "timestamp": "$TIMESTAMP",
  "data": {
    "checkoutId": "chk_test_123",
    "customerId": "cus_test_456",
    "customerEmail": "test@example.com",
    "subscriptionId": "sub_test_789",
    "productId": "prod_test_abc",
    "amount": 29900,
    "currency": "TWD"
  }
}
EOF
)
    ;;
  "subscription.activated")
    PAYLOAD=$(cat <<EOF
{
  "id": "evt_test_$(date +%s)",
  "type": "subscription.activated",
  "timestamp": "$TIMESTAMP",
  "data": {
    "subscriptionId": "sub_test_789",
    "customerId": "cus_test_456",
    "productId": "prod_test_abc",
    "status": "ACTIVE",
    "currentPeriodStart": "$TIMESTAMP",
    "currentPeriodEnd": "$(date -u -v+1m +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '+1 month' +"%Y-%m-%dT%H:%M:%SZ")"
  }
}
EOF
)
    ;;
  "subscription.cancelled")
    PAYLOAD=$(cat <<EOF
{
  "id": "evt_test_$(date +%s)",
  "type": "subscription.cancelled",
  "timestamp": "$TIMESTAMP",
  "data": {
    "subscriptionId": "sub_test_789",
    "customerId": "cus_test_456",
    "cancelledAt": "$TIMESTAMP",
    "accessUntil": "$(date -u -v+1m +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '+1 month' +"%Y-%m-%dT%H:%M:%SZ")"
  }
}
EOF
)
    ;;
  *)
    PAYLOAD=$(cat <<EOF
{
  "id": "evt_test_$(date +%s)",
  "type": "$EVENT_TYPE",
  "timestamp": "$TIMESTAMP",
  "data": {}
}
EOF
)
    ;;
esac

# Calculate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

echo "📤 Sending test webhook..."
echo "Endpoint: $ENDPOINT"
echo "Event: $EVENT_TYPE"
echo "Signature: ${SIGNATURE:0:20}..."
echo ""

# Send request
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "x-recur-signature: $SIGNATURE" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response: $HTTP_CODE"
echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Webhook delivered successfully!"
else
  echo "❌ Webhook delivery failed"
fi
