#!/bin/bash

echo "🛑 Stopping any existing chess-trainer-mcp servers..."

# Kill any existing Node.js processes running on port 3456
lsof -ti:3456 | xargs kill -9 2>/dev/null || true

# Kill any processes with chess-trainer in the name
pkill -f "chess-trainer" 2>/dev/null || true
pkill -f "node.*index.js" 2>/dev/null || true

echo "⏳ Waiting for ports to be released..."
sleep 2

echo "🚀 Starting chess-trainer-mcp server..."
cd /Users/xueminliu/work/agentwork/stockfishmcp

# Start in production mode to test the embed functionality
NODE_ENV=production npm start