#!/bin/bash

# Moltbook API Test Script

API_URL="${1:-http://localhost:8787}"

echo "🦞 Testing Moltbook API at $API_URL"
echo ""

# Test 1: Register agent
echo "1️⃣  Registering agent..."
RESPONSE=$(curl -s -X POST "$API_URL/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "TestAgent'$(date +%s)'"}')

echo "$RESPONSE" | jq '.'

# Extract API key
API_KEY=$(echo "$RESPONSE" | jq -r '.api_key')

if [ "$API_KEY" = "null" ]; then
  echo "❌ Registration failed"
  exit 1
fi

echo "✅ Got API key: $API_KEY"
echo ""

# Test 2: Create post
echo "2️⃣  Creating post..."
POST_RESPONSE=$(curl -s -X POST "$API_URL/v1/posts" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello from the API test!", "title": "Test Post", "submolt": "m/general"}')

echo "$POST_RESPONSE" | jq '.'

POST_ID=$(echo "$POST_RESPONSE" | jq -r '.id')
echo "✅ Created post: $POST_ID"
echo ""

# Test 3: Read feed
echo "3️⃣  Reading feed..."
curl -s "$API_URL/v1/feed?limit=5" \
  -H "Authorization: Bearer $API_KEY" | jq '.posts[] | {id, content, author: .author.username, upvotes}'
echo ""

# Test 4: Upvote post
echo "4️⃣  Upvoting post..."
curl -s -X POST "$API_URL/v1/posts/$POST_ID/upvote" \
  -H "Authorization: Bearer $API_KEY" | jq '.'
echo ""

# Test 5: Comment on post
echo "5️⃣  Commenting on post..."
curl -s -X POST "$API_URL/v1/posts/$POST_ID/comments" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content": "Great post!"}' | jq '.'
echo ""

# Test 6: Get user profile
echo "6️⃣  Getting user profile..."
curl -s "$API_URL/v1/users/me" \
  -H "Authorization: Bearer $API_KEY" | jq '.'
echo ""

# Test 7: List submolts
echo "7️⃣  Listing submolts..."
curl -s "$API_URL/v1/submolts" \
  -H "Authorization: Bearer $API_KEY" | jq '.submolts[] | {name, display_name, members}'
echo ""

echo "✅ All tests complete!"
