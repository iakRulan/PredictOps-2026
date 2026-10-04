#!/bin/bash
# 下载 NASA CWRU 官方 .mat 原始文件并校验哈希
#
#   ./tools/fetch-cwru.sh [目标目录]      默认 /tmp/cwru
#
# 编号清单与 assets/data/cwru.json 中已抽取的样本一致；重复执行会自动跳过已存在文件。
# 下载完成后执行：
#   node tools/cwru-catalog.js <目录页html> ...   # 目录映射（需另存官网页面）
#   node tools/cwru-extract.js <目标目录> assets/data
set -u

OUT="${1:-/tmp/cwru}"
BASE="https://engineering.case.edu/sites/default/files"
IDS="97 98 99 100 105 106 107 108 118 119 120 121 122 130 131 132 133 144 169 209 3004"
JOBS=3

mkdir -p "$OUT"
cd "$OUT" || exit 1

fetch() {
  local id="$1"
  [ -s "$id.mat" ] && { echo "SKIP $id (已存在)"; return; }
  for try in 1 2 3; do
    if curl -fsSL --max-time 1800 -o "$id.mat.part" "$BASE/$id.mat"; then
      mv "$id.mat.part" "$id.mat"
      echo "DONE $id $(stat -f%z "$id.mat" 2>/dev/null || stat -c%s "$id.mat")"
      return
    fi
    echo "RETRY $id ($try/3)"; sleep 5
  done
  rm -f "$id.mat.part"; echo "FAIL $id"
}
export -f fetch; export BASE

echo "→ 从 $BASE 下载 $(echo $IDS | wc -w) 只 .mat 到 $OUT（并发 $JOBS，官网单连接限速约 6.5 KB/s）"
printf '%s\n' $IDS | xargs -P "$JOBS" -I{} bash -c 'fetch {}'

echo
echo "→ 校验：与 assets/data/cwru.json 记录的 sha256 比对（仅比对已抽取过的编号）"
node -e '
const fs=require("fs"),crypto=require("crypto"),path=require("path");
const dir=process.argv[1], idx=JSON.parse(fs.readFileSync("assets/data/cwru.json","utf8"));
let ok=0,bad=0,miss=0;
idx.samples.forEach(s=>{
  const p=path.join(dir,s.file);
  if(!fs.existsSync(p)){ console.log("  缺失  "+s.file); miss++; return; }
  const h=crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  if(h===s.sha256){ ok++; } else { bad++; console.log("  不符  "+s.file+"  现算 "+h.slice(0,16)+"… ≠ 记录 "+s.sha256.slice(0,16)+"…"); }
});
console.log("  一致 "+ok+" | 不符 "+bad+" | 缺失 "+miss);
process.exit(bad?1:0);
' "$OUT"
