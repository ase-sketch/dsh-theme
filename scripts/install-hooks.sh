#!/bin/bash
# 安装本仓库的 git 钩子（克隆后执行一次）。
# 用途：提交前拦截本地实例 token / API key 之类的凭据。
set -eu
root=$(git rev-parse --show-toplevel)
mkdir -p "$root/.git/hooks"
cp "$root/scripts/pre-commit" "$root/.git/hooks/pre-commit"
chmod +x "$root/.git/hooks/pre-commit"
echo "已安装 pre-commit 钩子：$root/.git/hooks/pre-commit"
