#!/bin/bash
# Phase 6.1: Test all packages with fixtures
# Created: 2026-02-26

OUTPUT_DIR="output/$(date +%Y%m%d)"
mkdir -p "$OUTPUT_DIR"

# Array of packages to test (excluding .bak and .disabled)
packages=(
  "axios"
  "cloudinary"
  "discord.js"
  "express"
  "firebase-admin"
  "ioredis"
  "mongodb"
  "mongoose"
  "openai"
  "pg"
  "react-hook-form"
  "redis"
  "square"
  "stripe"
  "twilio"
  "typescript"
  "zod"
  "@anthropic-ai/sdk"
  "@aws-sdk/client-s3"
  "@clerk/nextjs"
  "@octokit/rest"
  "@prisma/client"
  "@sendgrid/mail"
  "@slack/web-api"
  "@supabase/supabase-js"
  "@tanstack/react-query"
  "bullmq"
  "@vercel/postgres"
  "drizzle-orm"
  "socket.io"
  "joi"
  "ethers"
  "fastify"
  "next"
  "dotenv"
  "jsonwebtoken"
  "bcrypt"
  "multer"
  "helmet"
  "cors"
  "winston"
  "passport"
  "knex"
  "typeorm"
  "graphql"
  "uuid"
  "date-fns"
  "@nestjs/common"
  "@hapi/hapi"
)

echo "Starting Phase 6.1 Baseline Testing: ${#packages[@]} packages"
echo "Output directory: $OUTPUT_DIR"
echo "---"

# Run test for each package
for pkg in "${packages[@]}"; do
  echo ""
  echo "Testing: $pkg"

  # Sanitize package name for filename (replace / with -)
  safe_name="${pkg//\//-}"

  node dist/index.js \
    --tsconfig "../corpus/packages/$pkg/fixtures/tsconfig.json" \
    --corpus ../corpus \
    --output "$OUTPUT_DIR/${safe_name}-audit.json" \
    2>&1 | tee "$OUTPUT_DIR/${safe_name}-output.txt"

  echo "✓ Completed: $pkg"
done

echo ""
echo "---"
echo "Phase 6.1 testing complete!"
echo "Results saved to: $OUTPUT_DIR/"
