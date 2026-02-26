#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-remiderbot-3c1b0}"
ZONE="${ZONE:-us-west1-a}"
INSTANCE="${INSTANCE:-reminder-bot-vm}"
REMOTE_DIR="${REMOTE_DIR:-~/remiderbot}"
HEALTH_URL="${HEALTH_URL:-http://localhost:8080/healthz}"
RSYNC_EXCLUDES=(
  ".git/"
  ".gcloud/"
  "node_modules/"
  "dist/"
  ".DS_Store"
)

log() {
  printf "\n[%s] %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少必要指令：$1"
    exit 1
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

require_cmd gcloud
require_cmd rsync

log "確認 gcloud 帳號與專案"
gcloud config set project "${PROJECT_ID}" >/dev/null
ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
if [[ -z "${ACTIVE_ACCOUNT}" ]]; then
  echo "尚未登入 gcloud，請先執行：gcloud auth login"
  exit 1
fi
echo "使用帳號：${ACTIVE_ACCOUNT}"
echo "目標 VM：${INSTANCE} (${ZONE})"

log "確保遠端目錄存在"
gcloud compute ssh "${INSTANCE}" \
  --zone="${ZONE}" \
  --project="${PROJECT_ID}" \
  --command="mkdir -p ${REMOTE_DIR}"

log "同步程式碼到 VM"
EXCLUDE_FLAGS=()
for item in "${RSYNC_EXCLUDES[@]}"; do
  EXCLUDE_FLAGS+=(--exclude="${item}")
done

gcloud compute ssh "${INSTANCE}" \
  --zone="${ZONE}" \
  --project="${PROJECT_ID}" \
  --command="command -v rsync >/dev/null 2>&1 || (sudo apt-get update && sudo apt-get install -y rsync)"

RSYNC_RSH="$(mktemp)"
cat >"${RSYNC_RSH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
host="\$1"
shift
exec gcloud compute ssh "\${host}" --project="${PROJECT_ID}" --zone="${ZONE}" -- -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "\$@"
EOF
chmod +x "${RSYNC_RSH}"
trap 'rm -f "${RSYNC_RSH}"' EXIT

rsync -az --delete "${EXCLUDE_FLAGS[@]}" \
  -e "${RSYNC_RSH}" \
  "${REPO_ROOT}/" "${INSTANCE}:${REMOTE_DIR}/"

log "遠端 build + PM2 restart + health check"
gcloud compute ssh "${INSTANCE}" \
  --zone="${ZONE}" \
  --project="${PROJECT_ID}" \
  --command="set -euo pipefail; cd ${REMOTE_DIR}; npm ci; npm run build; pm2 restart reminder-server; pm2 restart reminder-bot; pm2 status; for attempt in {1..15}; do if curl -fsS ${HEALTH_URL} >/dev/null; then echo 'health check passed'; exit 0; fi; echo \"waiting for server... (\${attempt}/15)\"; sleep 2; done; echo 'health check failed'; exit 1"

log "部署完成"
