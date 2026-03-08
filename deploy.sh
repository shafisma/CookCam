#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# CookCam — Automated Cloud Run Deployment Script
#
# Usage:
#   ./deploy.sh                          # Deploy with defaults
#   ./deploy.sh --project my-gcp-proj    # Override project
#   ./deploy.sh --region asia-southeast1 # Override region
#
# Prerequisites:
#   - Google Cloud CLI installed (gcloud)
#   - Authenticated: gcloud auth login
#   - GEMINI_API_KEY set in .env or as environment variable
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────
SERVICE_NAME="cookcam"
REGION="us-central1"
MEMORY="512Mi"
TIMEOUT="3600"
MAX_INSTANCES="10"
CONCURRENCY="80"
PROJECT=""

# ── Parse arguments ──────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case $1 in
        --project)  PROJECT="$2";  shift 2 ;;
        --region)   REGION="$2";   shift 2 ;;
        --memory)   MEMORY="$2";   shift 2 ;;
        --service)  SERVICE_NAME="$2"; shift 2 ;;
        *)          echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Load API key from .env if not already set ────────────────────────────
if [[ -z "${GEMINI_API_KEY:-}" ]]; then
    if [[ -f .env ]]; then
        export "$(grep -E '^GEMINI_API_KEY=' .env | xargs)"
        echo "✅ Loaded GEMINI_API_KEY from .env"
    else
        echo "❌ GEMINI_API_KEY not set and no .env file found."
        echo "   Set it with: export GEMINI_API_KEY=your-key"
        exit 1
    fi
fi

# ── Set project if provided ──────────────────────────────────────────────
if [[ -n "$PROJECT" ]]; then
    gcloud config set project "$PROJECT"
    echo "✅ Project set to: $PROJECT"
fi

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
echo "📦 Deploying $SERVICE_NAME to Cloud Run..."
echo "   Project:  $PROJECT_ID"
echo "   Region:   $REGION"
echo "   Memory:   $MEMORY"
echo "   Timeout:  ${TIMEOUT}s"
echo ""

# ── Step 1: Enable required APIs ─────────────────────────────────────────
echo "🔧 Enabling required APIs..."
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    --quiet

# ── Step 2: Deploy from source ───────────────────────────────────────────
echo "🚀 Building and deploying..."
gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --port 8080 \
    --region "$REGION" \
    --memory "$MEMORY" \
    --timeout "$TIMEOUT" \
    --concurrency "$CONCURRENCY" \
    --max-instances "$MAX_INSTANCES" \
    --allow-unauthenticated \
    --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
    --quiet

# ── Step 3: Output the URL ───────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)")

echo ""
echo "═══════════════════════════════════════════════"
echo "✅ CookCam deployed successfully!"
echo ""
echo "   🌐 URL: $SERVICE_URL"
echo "   📊 Console: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME"
echo "═══════════════════════════════════════════════"
