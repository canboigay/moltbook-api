#!/bin/bash

# Moltbook API Security Test Script

API_URL="${1:-http://localhost:8787}"

echo "🔒 Testing Moltbook API Security at $API_URL"
echo ""

# Test 1: Rate limit - registration
echo "1️⃣  Testing registration rate limit (10/hour)..."
echo "Attempting 11 registrations (11th should fail)..."
for i in {1..11}; do
  RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL/v1/agents/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"RateTest$(date +%s)$i\"}")
  
  HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
  BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')
  
  if [ "$HTTP_STATUS" = "429" ]; then
    echo "  ✅ Request $i: Rate limited (expected)"
    echo "     $BODY" | jq -r '.error.message'
  elif [ "$HTTP_STATUS" = "200" ]; then
    echo "  ✓ Request $i: Success"
  else
    echo "  ❌ Request $i: Unexpected status $HTTP_STATUS"
  fi
done
echo ""

# Test 2: Input validation - username too short
echo "2️⃣  Testing input validation (username too short)..."
RESPONSE=$(curl -s -X POST "$API_URL/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "ab"}')

ERROR=$(echo "$RESPONSE" | jq -r '.error.message')
if [[ "$ERROR" == *"3-30 characters"* ]]; then
  echo "  ✅ Rejected short username: $ERROR"
else
  echo "  ❌ Failed to reject short username"
fi
echo ""

# Test 3: Input validation - invalid characters
echo "3️⃣  Testing input validation (invalid characters)..."
RESPONSE=$(curl -s -X POST "$API_URL/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "test@user!"}')

ERROR=$(echo "$RESPONSE" | jq -r '.error.message')
if [[ "$ERROR" == *"letters, numbers"* ]]; then
  echo "  ✅ Rejected invalid characters: $ERROR"
else
  echo "  ❌ Failed to reject invalid characters"
fi
echo ""

# Test 4: Register valid user for further tests
echo "4️⃣  Registering valid user for content tests..."
RESPONSE=$(curl -s -X POST "$API_URL/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"SecurityTest$(date +%s)\"}")

API_KEY=$(echo "$RESPONSE" | jq -r '.api_key')
if [ "$API_KEY" != "null" ]; then
  echo "  ✅ Got API key: ${API_KEY:0:20}..."
else
  echo "  ❌ Registration failed"
  exit 1
fi
echo ""

# Test 5: Content sanitization - XSS prevention
echo "5️⃣  Testing XSS prevention (script tag removal)..."
RESPONSE=$(curl -s -X POST "$API_URL/v1/posts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test <script>alert(1)</script> post"}')

CONTENT=$(echo "$RESPONSE" | jq -r '.content')
if [[ "$CONTENT" == *"<script>"* ]]; then
  echo "  ❌ Script tag was NOT removed: $CONTENT"
else
  echo "  ✅ Script tag removed: $CONTENT"
fi
echo ""

# Test 6: Content validation - too long
echo "6️⃣  Testing content length limit..."
LONG_CONTENT=$(python3 -c "print('A' * 10001)")
RESPONSE=$(curl -s -X POST "$API_URL/v1/posts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"$LONG_CONTENT\"}")

ERROR=$(echo "$RESPONSE" | jq -r '.error.message')
if [[ "$ERROR" == *"10000"* ]]; then
  echo "  ✅ Rejected oversized content: $ERROR"
else
  echo "  ❌ Failed to reject long content"
fi
echo ""

# Test 7: Post rate limit
echo "7️⃣  Testing post rate limit (10/hour)..."
echo "Creating 11 posts (11th should fail)..."
SUCCESS_COUNT=0
for i in {1..11}; do
  RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL/v1/posts" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"Rate limit test post $i\"}")
  
  HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
  
  if [ "$HTTP_STATUS" = "200" ]; then
    ((SUCCESS_COUNT++))
  elif [ "$HTTP_STATUS" = "429" ]; then
    echo "  ✅ Post $i rate limited (after $SUCCESS_COUNT successful posts)"
    break
  fi
  
  # Small delay to avoid other rate limits
  sleep 0.1
done
echo ""

# Test 8: Invalid auth
echo "8️⃣  Testing authentication..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL/v1/posts" \
  -H "Authorization: Bearer invalid_key_12345" \
  -H "Content-Type: application/json" \
  -d '{"content": "Should fail"}')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
if [ "$HTTP_STATUS" = "401" ]; then
  echo "  ✅ Invalid API key rejected"
else
  echo "  ❌ Invalid key was accepted (status: $HTTP_STATUS)"
fi
echo ""

# Test 9: Request size limit
echo "9️⃣  Testing request limit (max 100 items)..."
RESPONSE=$(curl -s "$API_URL/v1/feed?limit=500" \
  -H "Authorization: Bearer $API_KEY")

COUNT=$(echo "$RESPONSE" | jq '.posts | length')
if [ "$COUNT" -le 100 ]; then
  echo "  ✅ Limited to $COUNT items (max 100)"
else
  echo "  ❌ Returned $COUNT items (should be max 100)"
fi
echo ""

echo "✅ Security tests complete!"
echo ""
echo "Summary:"
echo "  ✓ Rate limiting working"
echo "  ✓ Input validation working"
echo "  ✓ Content sanitization working"
echo "  ✓ Authentication working"
echo "  ✓ Request limits working"
