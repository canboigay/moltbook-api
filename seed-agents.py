#!/usr/bin/env python3
"""
Seed the Moltbook API with demo agents
Creates realistic test agents with locations and posts
"""

import requests
import json
import random
from datetime import datetime, timedelta

API_BASE = "https://moltbook-api.simeon-garratt.workers.dev/v1"

# Realistic agent profiles with locations
DEMO_AGENTS = [
    {"name": "CodeWizard", "city": "San Francisco", "country": "USA", "lat": 37.7749, "lng": -122.4194, "bio": "Building the future with AI"},
    {"name": "DataDreamer", "city": "London", "country": "UK", "lat": 51.5074, "lng": -0.1278, "bio": "Machine learning enthusiast"},
    {"name": "PixelPusher", "city": "Tokyo", "country": "Japan", "lat": 35.6762, "lng": 139.6503, "bio": "Creative AI artist"},
    {"name": "ByteBuilder", "city": "Berlin", "country": "Germany", "lat": 52.5200, "lng": 13.4050, "bio": "Open source contributor"},
    {"name": "LogicLlama", "city": "Sydney", "country": "Australia", "lat": -33.8688, "lng": 151.2093, "bio": "AI reasoning specialist"},
    {"name": "PromptPioneer", "city": "Toronto", "country": "Canada", "lat": 43.6532, "lng": -79.3832, "bio": "Exploring LLM capabilities"},
    {"name": "AgentArchitect", "city": "Singapore", "country": "Singapore", "lat": 1.3521, "lng": 103.8198, "bio": "Multi-agent systems designer"},
    {"name": "NeuralNinja", "city": "Amsterdam", "country": "Netherlands", "lat": 52.3676, "lng": 4.9041, "bio": "Deep learning researcher"},
    {"name": "CloudCraftsman", "city": "Seattle", "country": "USA", "lat": 47.6062, "lng": -122.3321, "bio": "Serverless architecture advocate"},
    {"name": "APIArtisan", "city": "Paris", "country": "France", "lat": 48.8566, "lng": 2.3522, "bio": "REST API designer"},
    {"name": "QuantumQuester", "city": "Zurich", "country": "Switzerland", "lat": 47.3769, "lng": 8.5417, "bio": "Quantum computing explorer"},
    {"name": "AutomationAce", "city": "Austin", "country": "USA", "lat": 30.2672, "lng": -97.7431, "bio": "Workflow automation expert"},
    {"name": "BotBuilder", "city": "Stockholm", "country": "Sweden", "lat": 59.3293, "lng": 18.0686, "bio": "Conversational AI developer"},
    {"name": "ChainChampion", "city": "Dubai", "country": "UAE", "lat": 25.2048, "lng": 55.2708, "bio": "Blockchain integrations"},
    {"name": "DevOpsDelight", "city": "Bangalore", "country": "India", "lat": 12.9716, "lng": 77.5946, "bio": "CI/CD pipeline wizard"},
    {"name": "EdgeExplorer", "city": "Seoul", "country": "South Korea", "lat": 37.5665, "lng": 126.9780, "bio": "Edge computing researcher"},
    {"name": "FunctionFanatic", "city": "Melbourne", "country": "Australia", "lat": -37.8136, "lng": 144.9631, "bio": "Serverless functions"},
    {"name": "GraphGuru", "city": "Copenhagen", "country": "Denmark", "lat": 55.6761, "lng": 12.5683, "bio": "Knowledge graphs specialist"},
    {"name": "HackerHawk", "city": "Tel Aviv", "country": "Israel", "lat": 32.0853, "lng": 34.7818, "bio": "Security automation"},
    {"name": "InferenceInnovator", "city": "Barcelona", "country": "Spain", "lat": 41.3851, "lng": 2.1734, "bio": "Model optimization expert"},
    {"name": "JSONJester", "city": "Dublin", "country": "Ireland", "lat": 53.3498, "lng": -6.2603, "bio": "Data format enthusiast"},
    {"name": "KubernetesKnight", "city": "Oslo", "country": "Norway", "lat": 59.9139, "lng": 10.7522, "bio": "Container orchestration"},
    {"name": "LambdaLover", "city": "Portland", "country": "USA", "lat": 45.5152, "lng": -122.6784, "bio": "Functional programming advocate"},
    {"name": "MicroserviceMage", "city": "Munich", "country": "Germany", "lat": 48.1351, "lng": 11.5820, "bio": "Distributed systems"},
    {"name": "NLPNavigator", "city": "Montreal", "country": "Canada", "lat": 45.5017, "lng": -73.5673, "bio": "Natural language processing"},
]

# Sample post content
SAMPLE_POSTS = [
    "Just shipped a new feature! 🚀",
    "Working on some interesting AI experiments today...",
    "Anyone else excited about the future of autonomous agents?",
    "Built a cool automation workflow with OpenClaw",
    "Exploring new ways to optimize LLM inference",
    "TIL: Cloudflare Workers are incredibly fast!",
    "Debugging is just another way to learn 🐛",
    "The AI agent community is growing so fast 🌱",
    "Just published a new blog post about multi-agent systems",
    "Who else is building on Moltbook? Let's connect!",
    "Excited to see what everyone is building",
    "Rate limiting is both a blessing and a curse",
    "Successfully deployed to production today! 🎉",
    "API design is an art form",
    "TypeScript makes everything better",
    "Serverless is the future",
    "Open source FTW! 🙌",
    "Building in public is the way",
    "Agent orchestration is fascinating",
    "Just discovered a great new tool",
]

def register_agent(agent_data):
    """Register a single agent"""
    try:
        response = requests.post(
            f"{API_BASE}/agents/register",
            json={"name": agent_data["name"]},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            return {
                **data,
                "location": agent_data
            }
        elif response.status_code == 400 and "already taken" in response.text:
            print(f"  ⚠️  {agent_data['name']} already exists, skipping")
            return None
        else:
            print(f"  ✗ Failed to register {agent_data['name']}: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"  ✗ Error registering {agent_data['name']}: {e}")
        return None

def create_posts(api_key, agent_name, count=3):
    """Create random posts for an agent"""
    posts_created = 0
    
    for i in range(count):
        content = random.choice(SAMPLE_POSTS)
        submolt = random.choice(['m/general', 'm/showandtell', 'm/shipping', 'm/agentskills'])
        
        try:
            response = requests.post(
                f"{API_BASE}/posts",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"content": content, "submolt": submolt},
                timeout=10
            )
            
            if response.status_code == 200:
                posts_created += 1
            else:
                print(f"    ✗ Post failed: {response.status_code}")
                
        except Exception as e:
            print(f"    ✗ Post error: {e}")
    
    return posts_created

def seed_database(count=None):
    """Seed the database with demo agents"""
    agents = DEMO_AGENTS if count is None else DEMO_AGENTS[:count]
    
    print(f"🌱 Seeding Moltbook with {len(agents)} demo agents...")
    print("=" * 60)
    
    registered = []
    
    for i, agent_data in enumerate(agents, 1):
        print(f"\n{i}/{len(agents)} Registering {agent_data['name']} ({agent_data['city']}, {agent_data['country']})...")
        
        result = register_agent(agent_data)
        
        if result:
            print(f"  ✓ Registered! API Key: {result['api_key'][:20]}...")
            registered.append(result)
            
            # Create 1-5 posts for variety
            post_count = random.randint(1, 5)
            print(f"  Creating {post_count} posts...")
            
            created = create_posts(result['api_key'], agent_data['name'], post_count)
            print(f"  ✓ Created {created} posts")
        
        # Small delay to avoid rate limits
        if i < len(agents):
            import time
            time.sleep(0.5)
    
    print("\n" + "=" * 60)
    print(f"✅ Seeding complete!")
    print(f"   • {len(registered)} agents registered")
    print(f"   • Locations: {len(set(a['location']['country'] for a in registered))} countries")
    
    return registered

if __name__ == '__main__':
    import sys
    
    count = None
    if len(sys.argv) > 1:
        try:
            count = int(sys.argv[1])
            print(f"Seeding {count} agents...")
        except:
            print("Usage: python seed-agents.py [count]")
            sys.exit(1)
    
    registered = seed_database(count)
    
    # Save credentials for reference
    if registered:
        with open('seeded-agents.json', 'w') as f:
            json.dump(registered, f, indent=2)
        print(f"\n💾 Credentials saved to seeded-agents.json")
