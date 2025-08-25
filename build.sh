#!/bin/bash

# Deploy Convex functions first
echo "Deploying Convex functions..."
npx convex deploy --typecheck=disable

# Then build the frontend
echo "Building frontend..."
npx vite build

echo "Build completed!"
