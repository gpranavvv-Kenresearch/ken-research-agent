#!/usr/bin/env bash
# vps-health.sh — one-shot health snapshot of srv1828409.
# Usage: bash scripts/vps-health.sh
# Needs key auth: ~/.ssh/ken_vps_ed25519 (see project_vps_deploy_topology memory).
set -euo pipefail
KEY="${VPS_KEY:-$HOME/.ssh/ken_vps_ed25519}"
HOST="${VPS_HOST:-root@200.97.170.123}"

ssh -i "$KEY" -o BatchMode=yes "$HOST" 'bash -s' <<'EOF'
echo "===== MEM / SWAP ====="; free -h | grep -iE 'mem|swap'
echo "===== LOAD ====="; uptime
echo "===== OOM KILLS (last 24h) ====="
journalctl -k --since "24 hours ago" --no-pager 2>/dev/null | grep -c 'Out of memory' | xargs echo "oom-kills:"
echo "===== CHROME ====="; echo "procs: $(pgrep -c -f chrome 2>/dev/null || echo 0)"
ps -eo args 2>/dev/null | grep -oE '\-\-user-data-dir=[^ ]+' | sort -u | wc -l | xargs echo "distinct browser profiles open:"
echo "===== DISK ====="; df -h / | tail -1
du -sh /home/deploy/full-team-agent/.sessions-* 2>/dev/null | sort -rh | head -4
echo "===== PM2 (name / restarts / status) ====="
sudo -u deploy pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s)){console.log(`${p.name}\t↺${p.pm2_env.restart_time}\t${p.pm2_env.status}\t${Math.round((p.monit.memory||0)/1048576)}MB`)}})' 2>/dev/null || sudo -u deploy pm2 list
echo "===== SCHEDULER PHASE ====="
grep -E '"phase"|"stage"|"currentPlatform"' /home/deploy/full-team-agent/.sessions/scheduler-status.json 2>/dev/null || echo "no status file"
EOF
