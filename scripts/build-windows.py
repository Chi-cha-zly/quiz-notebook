#!/usr/bin/env python3
"""Package official prebuilt Windows Electron without executing Windows code.

Python 3.10+ standard library only. Download once, then build offline from cache.
The Windows application is unsigned; run-time validation requires Windows.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import struct
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
WINDOWS = ROOT / "desktop" / "windows"
APP_NAME = "自测本"
FOLDER_NAME = f"{APP_NAME}-Windows-x64"
WRAPPER_FILES = ("package.json", "main.cjs", "preload.cjs", "services.cjs", "icon.ico")
WEB_FILES = ("index.html", "styles.css", "core.js", "app.js")
ZIP_TIME = (2026, 10, 27, 0, 0, 0)


def sha256(file: Path) -> str:
    digest = hashlib.sha256()
    with file.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(url: str, destination: Path, offline: bool) -> None:
    if destination.is_file():
        return
    if offline:
        raise RuntimeError(f"离线缓存缺失：{destination}")
    if not url.startswith("https://github.com/electron/electron/releases/download/"):
        raise ValueError("运行文件必须来自 Electron 官方 HTTPS 发布地址")
    temporary = destination.with_suffix(destination.suffix + ".part")
    print(f"Downloading {url}", flush=True)
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "QuizNotebook-Packager/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            if not response.url.startswith("https://"):
                raise ValueError("下载重定向必须使用 HTTPS")
            shutil.copyfileobj(response, output)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def verify_runtime(runtime: dict, archive: Path, manifest: Path) -> None:
    entries = {}
    for line in manifest.read_text(encoding="utf-8").splitlines():
        match = re.fullmatch(r"([0-9a-fA-F]{64})\s+\*?(.+)", line)
        if match:
            entries[match[2]] = match[1].lower()
    if entries.get(runtime["archive"]) != runtime["sha256"]:
        raise ValueError("官方清单与已固定的 SHA256 不一致；已停止打包")
    if sha256(archive) != runtime["sha256"]:
        raise ValueError("运行文件 SHA256 校验失败；已停止打包，请重新下载缓存文件")


def safe_extract(archive: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive) as source:
        names = set()
        for info in source.infolist():
            path = PurePosixPath(info.filename)
            folded = info.filename.rstrip("/").casefold()
            mode = info.external_attr >> 16
            if (not info.filename or path.is_absolute() or ".." in path.parts
                    or "\\" in info.filename or ":" in info.filename
                    or stat.S_ISLNK(mode) or folded in names):
                raise ValueError(f"不安全或重复的 ZIP 路径：{info.filename}")
            names.add(folded)
            if not (destination / info.filename).resolve().is_relative_to(destination.resolve()):
                raise ValueError("ZIP 路径超出目标目录")
        damaged = source.testzip()
        if damaged:
            raise ValueError(f"运行文件 ZIP 损坏：{damaged}")
        source.extractall(destination)


def verify_pe(file: Path) -> None:
    with file.open("rb") as source:
        if source.read(2) != b"MZ":
            raise ValueError("Windows 可执行文件缺少 MZ 标头")
        source.seek(0x3C)
        offset = struct.unpack("<I", source.read(4))[0]
        source.seek(offset)
        signature, machine = struct.unpack("<4sH", source.read(6))
    if signature != b"PE\0\0" or machine != 0x8664:
        raise ValueError("Windows 可执行文件不是 AMD64 PE")


def add_app(folder: Path) -> None:
    resources = folder / "resources"
    (resources / "default_app.asar").unlink()
    app = resources / "app"
    web = app / "web"
    web.mkdir(parents=True)
    for filename in WRAPPER_FILES:
        shutil.copyfile(WINDOWS / filename, app / filename)
    for filename in WEB_FILES:
        shutil.copyfile(ROOT / filename, web / filename)
    shutil.copyfile(WINDOWS / "renderer-adapter.js", web / "renderer-adapter.js")
    index = (web / "index.html").read_text(encoding="utf-8")
    marker = '<script src="app.js" defer></script>'
    if index.count(marker) != 1:
        raise ValueError("无法唯一识别 app.js 的加载位置")
    index = index.replace(marker, '<script src="renderer-adapter.js" defer></script>\n  ' + marker)
    (web / "index.html").write_text(index, encoding="utf-8")
    (folder / "electron.exe").rename(folder / f"{APP_NAME}.exe")
    wer = folder / "electron_wer.dll"
    if wer.exists():
        wer.rename(folder / f"{APP_NAME}_wer.dll")


def add_documentation(folder: Path, runtime: dict, manifest: Path) -> None:
    notes = """自测本 · Windows 64 位免安装版

适用系统：Windows 10 / 11，x64（Intel / AMD 64 位）。
1. 先完整解压整个 ZIP 到你自己的文件夹。
2. 双击文件夹中的“自测本.exe”。可为它创建桌面快捷方式。
3. 导入 Markdown 题目即可答题；交卷后可查看结果并导出错题。

请保留整个文件夹，不能只复制 EXE；不需要另装 Python 或 Node。
首次运行后，题库和答题记录保存在：
%APPDATA%\\QuizNotebook\\state.json
更新版本时关闭旧程序，解压新版本后启动；记录独立保存在上述位置。
网页版本和 Mac 版本的历史不会自动迁移；可重新导入原 Markdown 试卷。

本版本未做 Windows 代码签名，系统可能显示发布者未验证提示。
此前免安装版的基本功能已由用户在 Windows 测试。
当前发布包在 Mac 重新构建，当前构建及新安装器仍需 Windows 真机验证。
制作此包无需安装、运行 Windows 系统，也不需要虚拟机。

运行时来自 Electron 官方预编译发行版，许可证见 LICENSE 与
LICENSES.chromium.html。来源及文件校验见 BUILD-INFO.json 和 FILES-SHA256.txt。
"""
    (folder / "使用说明.txt").write_text(notes.replace("\n", "\r\n"), encoding="utf-8-sig")
    shutil.copyfile(manifest, folder / "ELECTRON-SHASUMS256.txt")
    app = folder / "resources" / "app"
    provenance = {
        "application": APP_NAME,
        "author": "Chi-cha-zly",
        "priorPortableBasicFeaturesUserVerified": True,
        "appVersion": json.loads((app / "package.json").read_text())["version"],
        "target": "Windows x64",
        "runtime": runtime,
        "packaging": "Official prebuilt runtime; no Windows execution required",
        "windowsExecutionVerified": False,
        "codeSigned": False,
        "appFiles": {str(p.relative_to(app)): sha256(p) for p in sorted(app.rglob("*")) if p.is_file()},
    }
    (folder / "BUILD-INFO.json").write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    files = sorted(p for p in folder.rglob("*") if p.is_file())
    (folder / "FILES-SHA256.txt").write_text("".join(f"{sha256(p)}  {p.relative_to(folder).as_posix()}\n" for p in files), encoding="utf-8")


def validate_package(folder: Path) -> None:
    for filename in (f"{APP_NAME}.exe", f"{APP_NAME}_wer.dll", "LICENSE", "LICENSES.chromium.html",
                     "icudtl.dat", "ffmpeg.dll", "resources.pak", "v8_context_snapshot.bin",
                     "chrome_100_percent.pak", "chrome_200_percent.pak"):
        if not (folder / filename).is_file():
            raise ValueError(f"缺少运行文件：{filename}")
    if not list((folder / "locales").glob("*.pak")):
        raise ValueError("缺少 locales 资源")
    verify_pe(folder / f"{APP_NAME}.exe")
    if (folder / "version").read_text().strip() != "45.0.0":
        raise ValueError("运行时版本不匹配")
    app = folder / "resources" / "app"
    expected = set(WRAPPER_FILES) | {f"web/{name}" for name in WEB_FILES} | {"web/renderer-adapter.js"}
    actual = {p.relative_to(app).as_posix() for p in app.rglob("*") if p.is_file()}
    if actual != expected:
        raise ValueError(f"应用文件清单不匹配：{actual ^ expected}")


def archive_package(folder: Path, destination: Path) -> None:
    temporary = destination.with_suffix(".zip.part")
    try:
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as output:
            for file in sorted(folder.rglob("*")):
                if file.is_file():
                    info = zipfile.ZipInfo(file.relative_to(folder.parent).as_posix(), ZIP_TIME)
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100644 << 16
                    with file.open("rb") as source, output.open(info, "w") as target:
                        shutil.copyfileobj(source, target)
        with zipfile.ZipFile(temporary) as output:
            damaged = output.testzip()
            if damaged:
                raise ValueError(f"生成的 ZIP 损坏：{damaged}")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="只使用已经校验的缓存，不进行下载")
    args = parser.parse_args()
    runtime = json.loads((WINDOWS / "runtime.json").read_text(encoding="utf-8"))
    cache = ROOT / ".build" / "windows-cache"
    cache.mkdir(parents=True, exist_ok=True)
    archive, manifest = cache / runtime["archive"], cache / "SHASUMS256.txt"
    fetch(runtime["checksums_url"], manifest, args.offline)
    fetch(runtime["url"], archive, args.offline)
    verify_runtime(runtime, archive, manifest)
    release = ROOT / "release"
    release.mkdir(exist_ok=True)
    destination = release / f"{FOLDER_NAME}.zip"
    with tempfile.TemporaryDirectory(prefix="windows-package-", dir=ROOT / ".build") as staging:
        folder = Path(staging) / FOLDER_NAME
        folder.mkdir()
        safe_extract(archive, folder)
        add_app(folder)
        validate_package(folder)
        add_documentation(folder, runtime, manifest)
        archive_package(folder, destination)
    checksum = sha256(destination)
    (release / f"{FOLDER_NAME}.sha256").write_text(f"{checksum}  {destination.name}\n", encoding="utf-8")
    print(f"Created: {destination}\nBytes: {destination.stat().st_size}\nSHA256: {checksum}")
    print("Windows binaries were not executed. Windows machine testing remains required.")


if __name__ == "__main__":
    main()
