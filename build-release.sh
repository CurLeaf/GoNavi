#!/bin/bash

# 配置
APP_NAME="GoNavi"
DIST_DIR="dist"
BUILD_BIN_DIR="build/bin"
DEFAULT_BINARY_NAME="GoNavi" # 对应 wails.json 中的 outputfilename

# 提取版本号
VERSION=$(grep '"version":' frontend/package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g' | tr -d '[[:space:]]')
if [ -z "$VERSION" ]; then
    VERSION="0.0.0"
fi
echo "ℹ️  检测到版本号: $VERSION"
LDFLAGS="-s -w -X GoNavi-Wails/internal/app.AppVersion=$VERSION"

# 颜色配置
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

get_file_size_bytes() {
    local target="$1"
    if [ ! -f "$target" ]; then
        echo 0
        return
    fi
    if stat -f%z "$target" >/dev/null 2>&1; then
        stat -f%z "$target"
        return
    fi
    if stat -c%s "$target" >/dev/null 2>&1; then
        stat -c%s "$target"
        return
    fi
    wc -c <"$target" | tr -d '[:space:]'
}

format_size_mb() {
    local bytes="${1:-0}"
    awk -v b="$bytes" 'BEGIN { printf "%.2fMB", b / 1024 / 1024 }'
}

try_compress_binary_with_upx() {
    local exe_path="$1"
    local label="$2"
    if [ ! -f "$exe_path" ]; then
        echo -e "${RED}   ❌ 未找到 ${label} 文件：$exe_path${NC}"
        exit 1
    fi

    if ! command -v upx >/dev/null 2>&1; then
        echo -e "${RED}   ❌ 未找到 upx，${label} 必须进行压缩后才能继续打包。${NC}"
        case "$(uname -s)" in
            Darwin)
                echo "      安装命令: brew install upx"
                ;;
            Linux)
                echo "      安装命令: sudo apt-get install -y upx-ucl  (或对应发行版包管理器)"
                ;;
        esac
        exit 1
    fi

    local before_bytes after_bytes
    before_bytes=$(get_file_size_bytes "$exe_path")
    echo "   🗜️  正在使用 UPX 压缩 ${label}..."
    if upx --best --lzma --force "$exe_path" >/dev/null 2>&1; then
        if ! upx -t "$exe_path" >/dev/null 2>&1; then
            echo -e "${RED}   ❌ UPX 校验失败：${label}${NC}"
            exit 1
        fi
        after_bytes=$(get_file_size_bytes "$exe_path")
        if [ "$after_bytes" -lt "$before_bytes" ]; then
            local saved_bytes=$((before_bytes - after_bytes))
            echo "   ✅ UPX 压缩完成: $(format_size_mb "$before_bytes") -> $(format_size_mb "$after_bytes")，减少 $(format_size_mb "$saved_bytes")"
        else
            echo "   ℹ️  UPX 压缩完成: $(format_size_mb "$before_bytes") -> $(format_size_mb "$after_bytes")"
        fi
    else
        echo -e "${RED}   ❌ UPX 压缩失败：${label}${NC}"
        exit 1
    fi
}

clear_macos_bundle_xattrs() {
    local bundle_path="$1"
    if [ -z "$bundle_path" ] || [ ! -e "$bundle_path" ]; then
        return
    fi
    if command -v xattr >/dev/null 2>&1; then
        xattr -cr "$bundle_path" >/dev/null 2>&1 || true
    fi
}

verify_macos_dmg_bundle_signature() {
    local dmg_path="$1"
    local mount_dir=""
    local app_path=""

    if [ -z "$dmg_path" ] || [ ! -f "$dmg_path" ]; then
        echo -e "${RED}   ❌ DMG 文件不存在，无法校验签名：$dmg_path${NC}"
        return 1
    fi
    if ! command -v hdiutil >/dev/null 2>&1 || ! command -v codesign >/dev/null 2>&1; then
        echo -e "${YELLOW}   ⚠️  当前环境缺少 hdiutil 或 codesign，跳过 DMG 内应用签名校验。${NC}"
        return 0
    fi

    mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/gonavi-dmg-verify.XXXXXX")
    if [ -z "$mount_dir" ] || [ ! -d "$mount_dir" ]; then
        echo -e "${RED}   ❌ 创建 DMG 校验挂载目录失败。${NC}"
        return 1
    fi

    if ! hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg_path" >/dev/null 2>&1; then
        rmdir "$mount_dir" >/dev/null 2>&1 || true
        echo -e "${RED}   ❌ 挂载 DMG 失败，无法校验签名。${NC}"
        return 1
    fi

    app_path=$(find "$mount_dir" -maxdepth 1 -name "*.app" -print -quit)
    if [ -z "$app_path" ] || [ ! -d "$app_path" ]; then
        hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
        rmdir "$mount_dir" >/dev/null 2>&1 || true
        echo -e "${RED}   ❌ DMG 内未找到 .app 应用包。${NC}"
        return 1
    fi

    if ! codesign --verify --deep --strict --verbose=4 "$app_path" >/dev/null 2>&1; then
        echo -e "${RED}   ❌ DMG 内 .app 签名校验失败：$(basename "$app_path")${NC}"
        codesign --verify --deep --strict --verbose=4 "$app_path" 2>&1 | sed 's/^/      /'
        hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
        rmdir "$mount_dir" >/dev/null 2>&1 || true
        return 1
    fi

    hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
    rmdir "$mount_dir" >/dev/null 2>&1 || true
    return 0
}

MAC_VOLICON_PATH="build/darwin/icon.icns"
if [ ! -f "$MAC_VOLICON_PATH" ]; then
    MAC_VOLICON_PATH=""
fi

echo -e "${GREEN}🚀 开始构建 $APP_NAME $VERSION...${NC}"

# 清理并创建输出目录
rm -rf $DIST_DIR
mkdir -p $DIST_DIR

# --- macOS ARM64 构建 ---
echo -e "${GREEN}🍎 正在构建 macOS (arm64)...${NC}"
wails build -platform darwin/arm64 -clean -ldflags "$LDFLAGS"
if [ $? -eq 0 ]; then
    APP_SRC="$BUILD_BIN_DIR/$DEFAULT_BINARY_NAME.app"
    APP_DEST_NAME="${APP_NAME}-${VERSION}-mac-arm64.app"
    DMG_NAME="${APP_NAME}-${VERSION}-mac-arm64.dmg"
    
    # 移动 .app 到 dist
    mv "$APP_SRC" "$DIST_DIR/$APP_DEST_NAME"

    APP_BIN_PATH=$(find "$DIST_DIR/$APP_DEST_NAME/Contents/MacOS" -maxdepth 1 -type f -print -quit)
    if [ -n "$APP_BIN_PATH" ] && [ -f "$APP_BIN_PATH" ]; then
        echo -e "${YELLOW}   ⚠️  macOS arm64 不再执行 UPX 压缩，保留原始主程序。${NC}"
    else
        echo -e "${RED}   ❌ 未找到 macOS arm64 主程序文件。${NC}"
        exit 1
	    fi
	    
		    # Ad-hoc 代码签名（无 Apple Developer 账号时防止 Gatekeeper 报已损坏）
		    echo "   🔏 正在对 .app 进行 ad-hoc 签名 (arm64)..."
		    clear_macos_bundle_xattrs "$DIST_DIR/$APP_DEST_NAME"
		    codesign --force --deep --sign - "$DIST_DIR/$APP_DEST_NAME"

		    # 创建 DMG
		    if command -v create-dmg &> /dev/null; then
		        echo "   📦 正在打包 DMG (arm64)..."
		        # 移除已存在的 DMG (以防万一)
		        rm -f "$DIST_DIR/$DMG_NAME"
		        # create-dmg 的 source 需要是“包含 .app 的目录”，不能直接传 .app 路径。
		        STAGE_DIR=$(mktemp -d "$DIST_DIR/.dmg-stage-${APP_NAME}-${VERSION}-arm64.XXXXXX")
	        if [ -z "$STAGE_DIR" ] || [ ! -d "$STAGE_DIR" ]; then
	            echo -e "${RED}   ❌ 创建 DMG 临时目录失败，跳过 DMG 打包。${NC}"
	        else
	            if command -v ditto &> /dev/null; then
	                ditto "$DIST_DIR/$APP_DEST_NAME" "$STAGE_DIR/$APP_DEST_NAME"
	            else
	                cp -R "$DIST_DIR/$APP_DEST_NAME" "$STAGE_DIR/$APP_DEST_NAME"
	            fi

	        # 注意：本地验证表明 `--sandbox-safe` 与“目录作为 source”组合会污染 DMG 内 .app 的扩展属性，
	        # 导致签名校验失败，因此这里显式禁用该参数，优先保证产物可打开。
	        CREATE_DMG_ARGS=(--volname "${APP_NAME} ${VERSION}" --format UDZO)
	        if [ -n "$MAC_VOLICON_PATH" ]; then
	            CREATE_DMG_ARGS+=(--volicon "$MAC_VOLICON_PATH")
        else
            echo -e "${YELLOW}   ⚠️  未找到 macOS 卷图标 (build/darwin/icon.icns)，跳过 --volicon。${NC}"
        fi

	        create-dmg "${CREATE_DMG_ARGS[@]}" \
	            --window-pos 200 120 \
	            --window-size 800 400 \
	            --icon-size 100 \
	            --icon "$APP_DEST_NAME" 200 190 \
	            --hide-extension "$APP_DEST_NAME" \
	            --app-drop-link 600 185 \
	            "$DIST_DIR/$DMG_NAME" \
	            "$STAGE_DIR"

	        CREATE_DMG_EXIT_CODE=$?
	        rm -rf "$STAGE_DIR"
	        
	        if [ $CREATE_DMG_EXIT_CODE -ne 0 ]; then
	            echo -e "${RED}   ❌ create-dmg 执行失败 (exit=$CREATE_DMG_EXIT_CODE)，保留 .app 以便排查。${NC}"
	        else
            # create-dmg 可能会在失败时遗留 rw.*.dmg 中间产物；不要直接当作最终产物使用
            if [ ! -f "$DIST_DIR/$DMG_NAME" ]; then
                RW_FILE=$(find "$DIST_DIR" -maxdepth 1 -name "rw.*.dmg" -print -quit)
                if [ -n "$RW_FILE" ]; then
                    echo -e "${YELLOW}   ⚠️  检测到 create-dmg 中间产物: $(basename "$RW_FILE")，正在转换为可分发 DMG...${NC}"
                    hdiutil convert "$RW_FILE" -format UDZO -o "$DIST_DIR/$DMG_NAME" >/dev/null 2>&1
                    rm -f "$RW_FILE"
                fi
            fi

            # 防御性：即使生成了目标文件，也要确保不是 UDRW（UDRW 在 Finder 下可能表现为“已损坏/无法打开”）
            if [ -f "$DIST_DIR/$DMG_NAME" ] && command -v hdiutil &> /dev/null; then
                DMG_FORMAT=$(hdiutil imageinfo "$DIST_DIR/$DMG_NAME" 2>/dev/null | awk -F': ' '/^Format:/{print $2; exit}')
                if [ "$DMG_FORMAT" = "UDRW" ]; then
                    echo -e "${YELLOW}   ⚠️  检测到 UDRW（可写原始映像），正在转换为 UDZO...${NC}"
                    TMP_UDZO="$DIST_DIR/.tmp.$DMG_NAME"
                    rm -f "$TMP_UDZO"
                    hdiutil convert "$DIST_DIR/$DMG_NAME" -format UDZO -o "$TMP_UDZO" >/dev/null 2>&1 && mv "$TMP_UDZO" "$DIST_DIR/$DMG_NAME"
                fi
            fi

	            if [ -f "$DIST_DIR/$DMG_NAME" ] && command -v hdiutil &> /dev/null; then
	                hdiutil verify "$DIST_DIR/$DMG_NAME" >/dev/null 2>&1
	                if [ $? -ne 0 ]; then
	                    echo -e "${RED}   ❌ DMG 校验失败，保留 .app 以便排查。${NC}"
	                elif ! verify_macos_dmg_bundle_signature "$DIST_DIR/$DMG_NAME"; then
	                    echo -e "${RED}   ❌ DMG 内应用签名校验失败，保留 .app 与 .dmg 以便排查。${NC}"
	                else
	                    # 删除中间的 .app 文件，保持目录整洁
	                    rm -rf "$DIST_DIR/$APP_DEST_NAME"
	                    echo "   ✅ 已生成 $DMG_NAME"
	                fi
            fi
        fi

	        if [ ! -f "$DIST_DIR/$DMG_NAME" ]; then
	            echo -e "${RED}   ❌ DMG 生成失败，请检查 create-dmg 输出。${NC}"
	        fi
	        fi
	    else
	        echo -e "${YELLOW}   ⚠️  未找到 create-dmg 工具，跳过 DMG 打包，仅保留 .app。${NC}"
	        echo "      安装命令: brew install create-dmg"
	    fi
	else
    echo -e "${RED}   ❌ macOS arm64 构建失败。${NC}"
fi

# --- macOS AMD64 构建 ---
echo -e "${GREEN}🍎 正在构建 macOS (amd64)...${NC}"
wails build -platform darwin/amd64 -clean -ldflags "$LDFLAGS"
if [ $? -eq 0 ]; then
    APP_SRC="$BUILD_BIN_DIR/$DEFAULT_BINARY_NAME.app"
    APP_DEST_NAME="${APP_NAME}-${VERSION}-mac-amd64.app"
    DMG_NAME="${APP_NAME}-${VERSION}-mac-amd64.dmg"
    
    mv "$APP_SRC" "$DIST_DIR/$APP_DEST_NAME"

    APP_BIN_PATH=$(find "$DIST_DIR/$APP_DEST_NAME/Contents/MacOS" -maxdepth 1 -type f -print -quit)
    if [ -n "$APP_BIN_PATH" ] && [ -f "$APP_BIN_PATH" ]; then
        echo -e "${YELLOW}   ⚠️  macOS amd64 不再执行 UPX 压缩，保留原始主程序。${NC}"
    else
        echo -e "${RED}   ❌ 未找到 macOS amd64 主程序文件。${NC}"
        exit 1
	    fi
	    
		    # Ad-hoc 代码签名
		    echo "   🔏 正在对 .app 进行 ad-hoc 签名 (amd64)..."
		    clear_macos_bundle_xattrs "$DIST_DIR/$APP_DEST_NAME"
		    codesign --force --deep --sign - "$DIST_DIR/$APP_DEST_NAME"

	    if command -v create-dmg &> /dev/null; then
	        echo "   📦 正在打包 DMG (amd64)..."
	        rm -f "$DIST_DIR/$DMG_NAME"
	        # create-dmg 的 source 需要是“包含 .app 的目录”，不能直接传 .app 路径。
	        STAGE_DIR=$(mktemp -d "$DIST_DIR/.dmg-stage-${APP_NAME}-${VERSION}-amd64.XXXXXX")
	        if [ -z "$STAGE_DIR" ] || [ ! -d "$STAGE_DIR" ]; then
	            echo -e "${RED}   ❌ 创建 DMG 临时目录失败，跳过 DMG 打包。${NC}"
	        else
	            if command -v ditto &> /dev/null; then
	                ditto "$DIST_DIR/$APP_DEST_NAME" "$STAGE_DIR/$APP_DEST_NAME"
	            else
	                cp -R "$DIST_DIR/$APP_DEST_NAME" "$STAGE_DIR/$APP_DEST_NAME"
	            fi

	        # 注意：本地验证表明 `--sandbox-safe` 与“目录作为 source”组合会污染 DMG 内 .app 的扩展属性，
	        # 导致签名校验失败，因此这里显式禁用该参数，优先保证产物可打开。
	        CREATE_DMG_ARGS=(--volname "${APP_NAME} ${VERSION}" --format UDZO)
	        if [ -n "$MAC_VOLICON_PATH" ]; then
	            CREATE_DMG_ARGS+=(--volicon "$MAC_VOLICON_PATH")
        else
            echo -e "${YELLOW}   ⚠️  未找到 macOS 卷图标 (build/darwin/icon.icns)，跳过 --volicon。${NC}"
        fi

	        create-dmg "${CREATE_DMG_ARGS[@]}" \
	            --window-pos 200 120 \
	            --window-size 800 400 \
	            --icon-size 100 \
	            --icon "$APP_DEST_NAME" 200 190 \
	            --hide-extension "$APP_DEST_NAME" \
	            --app-drop-link 600 185 \
	            "$DIST_DIR/$DMG_NAME" \
	            "$STAGE_DIR"

	        CREATE_DMG_EXIT_CODE=$?
	        rm -rf "$STAGE_DIR"

	        if [ $CREATE_DMG_EXIT_CODE -ne 0 ]; then
	            echo -e "${RED}   ❌ create-dmg 执行失败 (exit=$CREATE_DMG_EXIT_CODE)，保留 .app 以便排查。${NC}"
	        else
            if [ ! -f "$DIST_DIR/$DMG_NAME" ]; then
                RW_FILE=$(find "$DIST_DIR" -maxdepth 1 -name "rw.*.dmg" -print -quit)
                if [ -n "$RW_FILE" ]; then
                    echo -e "${YELLOW}   ⚠️  检测到 create-dmg 中间产物: $(basename "$RW_FILE")，正在转换为可分发 DMG...${NC}"
                    hdiutil convert "$RW_FILE" -format UDZO -o "$DIST_DIR/$DMG_NAME" >/dev/null 2>&1
                    rm -f "$RW_FILE"
                fi
            fi

            if [ -f "$DIST_DIR/$DMG_NAME" ] && command -v hdiutil &> /dev/null; then
                DMG_FORMAT=$(hdiutil imageinfo "$DIST_DIR/$DMG_NAME" 2>/dev/null | awk -F': ' '/^Format:/{print $2; exit}')
                if [ "$DMG_FORMAT" = "UDRW" ]; then
                    echo -e "${YELLOW}   ⚠️  检测到 UDRW（可写原始映像），正在转换为 UDZO...${NC}"
                    TMP_UDZO="$DIST_DIR/.tmp.$DMG_NAME"
                    rm -f "$TMP_UDZO"
                    hdiutil convert "$DIST_DIR/$DMG_NAME" -format UDZO -o "$TMP_UDZO" >/dev/null 2>&1 && mv "$TMP_UDZO" "$DIST_DIR/$DMG_NAME"
                fi
            fi

	            if [ -f "$DIST_DIR/$DMG_NAME" ] && command -v hdiutil &> /dev/null; then
	                hdiutil verify "$DIST_DIR/$DMG_NAME" >/dev/null 2>&1
	                if [ $? -ne 0 ]; then
	                    echo -e "${RED}   ❌ DMG 校验失败，保留 .app 以便排查。${NC}"
	                elif ! verify_macos_dmg_bundle_signature "$DIST_DIR/$DMG_NAME"; then
	                    echo -e "${RED}   ❌ DMG 内应用签名校验失败，保留 .app 与 .dmg 以便排查。${NC}"
	                else
	                    rm -rf "$DIST_DIR/$APP_DEST_NAME"
	                    echo "   ✅ 已生成 $DMG_NAME"
	                fi
            fi
        fi
        
	        if [ ! -f "$DIST_DIR/$DMG_NAME" ]; then
	            echo -e "${RED}   ❌ DMG 生成失败。${NC}"
	        fi
	        fi
	    else
	        echo -e "${YELLOW}   ⚠️  未找到 create-dmg 工具。${NC}"
	    fi
	else
	    echo -e "${RED}   ❌ macOS amd64 构建失败。${NC}"
fi

# --- Windows AMD64 构建 ---
echo -e "${GREEN}🪟 正在构建 Windows (amd64)...${NC}"
if command -v x86_64-w64-mingw32-gcc &> /dev/null; then
    wails build -platform windows/amd64 -clean -ldflags "$LDFLAGS"
    if [ $? -eq 0 ]; then
        TARGET_EXE="$DIST_DIR/${APP_NAME}-${VERSION}-windows-amd64.exe"
        mv "$BUILD_BIN_DIR/${DEFAULT_BINARY_NAME}.exe" "$TARGET_EXE"
        try_compress_binary_with_upx "$TARGET_EXE" "Windows amd64 可执行文件"
        echo "   ✅ 已生成 ${APP_NAME}-${VERSION}-windows-amd64.exe"
    else
        echo -e "${RED}   ❌ Windows amd64 构建失败。${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  未找到 MinGW 工具 (x86_64-w64-mingw32-gcc)，跳过 Windows amd64 构建。${NC}"
fi

# --- Windows ARM64 构建 ---
echo -e "${GREEN}🪟 正在构建 Windows (arm64)...${NC}"
if command -v aarch64-w64-mingw32-gcc &> /dev/null; then
    wails build -platform windows/arm64 -clean -ldflags "$LDFLAGS"
    if [ $? -eq 0 ]; then
        TARGET_EXE="$DIST_DIR/${APP_NAME}-${VERSION}-windows-arm64.exe"
        mv "$BUILD_BIN_DIR/${DEFAULT_BINARY_NAME}.exe" "$TARGET_EXE"
        echo -e "${YELLOW}   ⚠️  当前 UPX 不支持 win64/arm64，跳过 Windows arm64 压缩。${NC}"
        echo "   ✅ 已生成 ${APP_NAME}-${VERSION}-windows-arm64.exe"
    else
        echo -e "${RED}   ❌ Windows arm64 构建失败。${NC}"
    fi
else
    echo -e "${YELLOW}   ⚠️  未找到 MinGW ARM64 工具 (aarch64-w64-mingw32-gcc)，跳过 Windows arm64 构建。${NC}"
    echo "      安装命令: brew install mingw-w64 (需要支持 ARM64 的版本)"
fi

# --- Linux AMD64 构建 ---
echo -e "${GREEN}🐧 正在构建 Linux (amd64)...${NC}"
# 检测当前系统
CURRENT_OS=$(uname -s)
CURRENT_ARCH=$(uname -m)

if [ "$CURRENT_OS" = "Linux" ] && [ "$CURRENT_ARCH" = "x86_64" ]; then
    # 本机 Linux amd64，直接构建
    wails build -platform linux/amd64 -clean -ldflags "$LDFLAGS"
    if [ $? -eq 0 ]; then
        TARGET_LINUX_BIN="$DIST_DIR/${APP_NAME}-${VERSION}-linux-amd64"
        mv "$BUILD_BIN_DIR/${DEFAULT_BINARY_NAME}" "$TARGET_LINUX_BIN"
        chmod +x "$TARGET_LINUX_BIN"
        try_compress_binary_with_upx "$TARGET_LINUX_BIN" "Linux amd64 可执行文件"
        # 打包为 tar.gz
        cd "$DIST_DIR"
        tar -czvf "${APP_NAME}-${VERSION}-linux-amd64.tar.gz" "${APP_NAME}-${VERSION}-linux-amd64"
        rm "${APP_NAME}-${VERSION}-linux-amd64"
        cd ..
        echo "   ✅ 已生成 ${APP_NAME}-${VERSION}-linux-amd64.tar.gz"
    else
        echo -e "${RED}   ❌ Linux amd64 构建失败。${NC}"
    fi
elif command -v x86_64-linux-gnu-gcc &> /dev/null; then
    # macOS 或其他系统，尝试交叉编译
    export CC=x86_64-linux-gnu-gcc
    export CXX=x86_64-linux-gnu-g++
    export CGO_ENABLED=1
    wails build -platform linux/amd64 -clean -ldflags "$LDFLAGS"
    if [ $? -eq 0 ]; then
        TARGET_LINUX_BIN="$DIST_DIR/${APP_NAME}-${VERSION}-linux-amd64"
        mv "$BUILD_BIN_DIR/${DEFAULT_BINARY_NAME}" "$TARGET_LINUX_BIN"
        chmod +x "$TARGET_LINUX_BIN"
        try_compress_binary_with_upx "$TARGET_LINUX_BIN" "Linux amd64 可执行文件"
        cd "$DIST_DIR"
        tar -czvf "${APP_NAME}-${VERSION}-linux-amd64.tar.gz" "${APP_NAME}-${VERSION}-linux-amd64"
        rm "${APP_NAME}-${VERSION}-linux-amd64"
        cd ..
        echo "   ✅ 已生成 ${APP_NAME}-${VERSION}-linux-amd64.tar.gz"
    else
        echo -e "${RED}   ❌ Linux amd64 交叉编译失败。${NC}"
    fi
    unset CC CXX CGO_ENABLED
else
    echo -e "${YELLOW}   ⚠️  非 Linux 系统且未找到交叉编译工具，跳过 Linux amd64 构建。${NC}"
    echo "      在 Linux 上运行此脚本可直接构建，或安装交叉编译工具链。"
fi

# --- Linux ARM64 构建 ---
echo -e "${GREEN}🐧 正在构建 Linux (arm64)...${NC}"
if [ "$CURRENT_OS" = "Linux" ] && [ "$CURRENT_ARCH" = "aarch64" ]; then
    # 本机 Linux arm64，直接构建
    wails build -platform linux/arm64 -clean -ldflags "$LDFLAGS"
    if [ $? -eq 0 ]; then
        TARGET_LINUX_BIN="$DIST_DIR/${APP_NAME}-${VERSION}-linux-arm64"
        mv "$BUILD_BIN_DIR/${DEFAULT_BINARY_NAME}" "$TARGET_LINUX_BIN"
        chmod +x "$TARGET_LINUX_BIN"
        try_compress_binary_with_upx "$TARGET_LINUX_BIN" "Linux arm64 可执行文件"
        cd "$DIST_DIR"
        tar -czvf "${APP_NAME}-${VERSION}-linux-arm64.tar.gz" "${APP_NAME}-${VERSION}-linux-arm64"
        rm "${APP_NAME}-${VERSION}-linux-arm64"
        cd ..
        echo "   ✅ 已生成 ${APP_NAME}-${VERSION}-linux-arm64.tar.gz"
    else
        echo -e "${RED}   ❌ Linux arm64 构建失败。${NC}"
    fi
elif command -v aarch64-linux-gnu-gcc &> /dev/null; then
    # 交叉编译
    export CC=aarch64-linux-gnu-gcc
    export CXX=aarch64-linux-gnu-g++
    export CGO_ENABLED=1
    wails build -platform linux/arm64 -clean -ldflags "$LDFLAGS"
    if [ $? -eq 0 ]; then
        TARGET_LINUX_BIN="$DIST_DIR/${APP_NAME}-${VERSION}-linux-arm64"
        mv "$BUILD_BIN_DIR/${DEFAULT_BINARY_NAME}" "$TARGET_LINUX_BIN"
        chmod +x "$TARGET_LINUX_BIN"
        try_compress_binary_with_upx "$TARGET_LINUX_BIN" "Linux arm64 可执行文件"
        cd "$DIST_DIR"
        tar -czvf "${APP_NAME}-${VERSION}-linux-arm64.tar.gz" "${APP_NAME}-${VERSION}-linux-arm64"
        rm "${APP_NAME}-${VERSION}-linux-arm64"
        cd ..
        echo "   ✅ 已生成 ${APP_NAME}-${VERSION}-linux-arm64.tar.gz"
    else
        echo -e "${RED}   ❌ Linux arm64 交叉编译失败。${NC}"
    fi
    unset CC CXX CGO_ENABLED
else
    echo -e "${YELLOW}   ⚠️  非 Linux ARM64 系统且未找到交叉编译工具，跳过 Linux arm64 构建。${NC}"
    echo "      安装命令 (Ubuntu): sudo apt install gcc-aarch64-linux-gnu g++-aarch64-linux-gnu"
    echo "      安装命令 (macOS): brew install aarch64-linux-gnu-gcc (需要第三方 tap)"
fi

# 清理中间构建目录
rm -rf "build/bin"

echo -e "${GREEN}🔐 生成 SHA256SUMS...${NC}"
if command -v sha256sum &> /dev/null; then
    cd "$DIST_DIR"
    : > SHA256SUMS
    for f in *; do
        [ -f "$f" ] || continue
        sha256sum "$f" >> SHA256SUMS
    done
    cd ..
elif command -v shasum &> /dev/null; then
    cd "$DIST_DIR"
    : > SHA256SUMS
    for f in *; do
        [ -f "$f" ] || continue
        shasum -a 256 "$f" >> SHA256SUMS
    done
    cd ..
else
    echo -e "${YELLOW}   ⚠️  未找到 sha256sum/shasum，跳过校验文件生成。${NC}"
fi

echo ""
echo -e "${GREEN}🎉 所有任务完成！构建产物在 'dist/' 目录下：${NC}"
ls -lh "$DIST_DIR"
echo ""
echo -e "${GREEN}📋 支持的平台：${NC}"
echo "   • macOS (Intel/Apple Silicon): .dmg"
echo "   • Windows (x64/ARM64): .exe"
echo "   • Linux (x64/ARM64): .tar.gz"
echo ""
echo -e "${YELLOW}💡 提示：Linux AppImage 包请使用 GitHub Actions CI/CD 构建。${NC}"
