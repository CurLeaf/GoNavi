#!/bin/bash
# 把当前 Linux 包装进当前用户的应用菜单。重复执行会覆盖程序和图标。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_BIN="${1:-$ROOT/dist/GoNavi}"
ICON_SRC="$ROOT/build/appicon.png"

if [ ! -f "$SRC_BIN" ]; then
  echo "找不到可执行文件：$SRC_BIN" >&2
  exit 1
fi
if [ ! -f "$ICON_SRC" ]; then
  echo "找不到图标：$ICON_SRC" >&2
  exit 1
fi

DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA_HOME/gonavi"
BIN_LINK="$HOME/.local/bin/GoNavi"
DEST_BIN="$APP_DIR/GoNavi"
DESKTOP_DIR="$DATA_HOME/applications"
DESKTOP_FILE="$DESKTOP_DIR/gonavi.desktop"
ICON_ROOT="$DATA_HOME/icons/hicolor"

mkdir -p "$APP_DIR" "$HOME/.local/bin" "$DESKTOP_DIR" \
  "$ICON_ROOT/256x256/apps" "$ICON_ROOT/512x512/apps"

install_binary() {
  local tmp
  tmp="$(mktemp "$APP_DIR/GoNavi.XXXXXX")"
  cp -f "$SRC_BIN" "$tmp"
  chmod 755 "$tmp"
  mv -f "$tmp" "$DEST_BIN"
  ln -sfn "$DEST_BIN" "$BIN_LINK"
}

install_icons() {
  magick "$ICON_SRC" -resize 256x256 "$ICON_ROOT/256x256/apps/gonavi.png"
  magick "$ICON_SRC" -resize 512x512 "$ICON_ROOT/512x512/apps/gonavi.png"
  if [ ! -f "$ICON_ROOT/index.theme" ]; then
    cat >"$ICON_ROOT/index.theme" <<'EOF'
[Icon Theme]
Name=Hicolor
Comment=Fallback icon theme
Hidden=true
Directories=256x256/apps,512x512/apps

[256x256/apps]
Size=256
Context=Applications
Type=Threshold

[512x512/apps]
Size=512
Context=Applications
Type=Threshold
EOF
  fi
  gtk-update-icon-cache -f "$ICON_ROOT" >/dev/null
}

write_desktop_file() {
  cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Version=1.5
Name=GoNavi
GenericName=数据源工作台
Comment=连接、查询、同步与对比数据源
Exec=$DEST_BIN
Icon=gonavi
Terminal=false
Categories=Development;Database;
StartupWMClass=GoNavi
StartupNotify=true
EOF
  chmod 644 "$DESKTOP_FILE"
  desktop-file-validate "$DESKTOP_FILE"
  update-desktop-database "$DESKTOP_DIR"
}

install_binary
install_icons
write_desktop_file

echo "应用菜单已更新：GoNavi"
echo "程序：$DEST_BIN"
echo "命令：GoNavi"
