#!/usr/bin/env bash
# =========================================================================
# 设备智能管理与预测性维护系统 —— 服务启动脚本
# 使用 python3 -m http.server 启动静态服务，监听 8080 端口
# 服务以后台守护方式运行，支持幂等启动与健康检查
# =========================================================================
set -uo pipefail

PORT="${PORT:-8080}"
BIND="${BIND:-0.0.0.0}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT" || exit 1

LOG_DIR="$ROOT/logs"
PID_FILE="$ROOT/.server.pid"
LOG_FILE="$LOG_DIR/server.log"
mkdir -p "$LOG_DIR"

# ---------- 幂等：若服务已在运行则直接返回 ----------
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "${OLD_PID}" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
      echo "[PredictOps] 服务已在运行 (PID ${OLD_PID}) → http://127.0.0.1:${PORT}/"
      exit 0
    fi
  fi
fi

# ---------- 端口占用检查 ----------
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
  echo "[PredictOps] 警告：端口 ${PORT} 已被其他进程占用，仍尝试启动。" >&2
fi

# ---------- 后台守护启动 ----------
nohup python3 -u -m http.server "${PORT}" --bind "${BIND}" >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!
echo "${SERVER_PID}" >"${PID_FILE}"

# ---------- 健康检查 ----------
for _ in $(seq 1 40); do
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "[PredictOps] 启动进程已退出，日志：${LOG_FILE}" >&2
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
    echo "[PredictOps] 启动成功"
    echo "  监听地址 : http://${BIND}:${PORT}/"
    echo "  本地预览 : http://127.0.0.1:${PORT}/"
    echo "  守护 PID : ${SERVER_PID}"
    echo "  运行日志 : ${LOG_FILE}"
    exit 0
  fi
  sleep 0.5
done

echo "[PredictOps] 健康检查超时，请查看日志：${LOG_FILE}" >&2
exit 1
