#!/usr/bin/env python3
"""Build an unsigned Windows installer using native macOS NSIS; no Windows execution.

Python 3.10+ standard library only. All downloaded tools remain in .build.
Run build-windows.py first to prepare the portable ZIP; --offline uses cache only.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import struct
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
WINDOWS = ROOT / 'desktop/windows'
OUTPUT = 'QuizNotebook-Windows-x64-Setup.exe'


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def verify_sha256(path: Path, expected: str) -> None:
    if sha256(path) != expected:
        raise ValueError('Tool archive SHA256 mismatch; refusing to execute it')


def extract_tool(archive: Path, destination: Path) -> None:
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        names = set()
        for item in members:
            path = PurePosixPath(item.name)
            if (path.is_absolute() or '..' in path.parts or not path.parts
                    or path.parts[0] != 'nsis-bundle' or '\\' in item.name
                    or not (item.isfile() or item.isdir()) or item.name in names):
                raise ValueError('Unsafe tool archive member')
            names.add(item.name)
        destination.mkdir(parents=True)
        # Members were restricted to ordinary files/directories under nsis-bundle.
        for item in members:
            target = destination / item.name
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(item) as incoming, target.open('wb') as output:
                    shutil.copyfileobj(incoming, output)
                target.chmod(item.mode & 0o777)


def payload_commands(folder: Path) -> tuple[str, str]:
    files, directories, folded = [], [], set()
    for item in sorted(folder.rglob('*')):
        relative = item.relative_to(folder)
        if item.is_symlink() or not (item.is_file() or item.is_dir()):
            raise ValueError('Payload must contain only ordinary files and directories')
        for part in relative.parts:
            if (re.search(r'[\x00-\x1f$"<>:*?\\|]', part) or part.endswith(('.', ' '))
                    or re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', part, re.I)):
                raise ValueError('Unsafe Windows/NSIS payload path')
        key = relative.as_posix().casefold()
        if key in folded:
            raise ValueError('Case-insensitive duplicate payload path')
        folded.add(key)
        (files if item.is_file() else directories).append(relative)
    if not files:
        raise ValueError('Empty installer payload')
    install, uninstall = [], []
    for relative in files:
        parent = str(relative.parent).replace('/', '\\')
        target = '$INSTDIR' if parent == '.' else '$INSTDIR\\' + parent
        install.extend((f'SetOutPath "{target}"', f'File "payload/{relative.as_posix()}"'))
        windows_path = relative.as_posix().replace('/', '\\')
        uninstall.append(f'Delete "$INSTDIR\\{windows_path}"')
    # Catch locked/read-only owned files before removing registration. Non-empty
    # directories (user-added files) are deliberately preserved without failure.
    uninstall.append('IfErrors removal_failed')
    for relative in sorted(directories, key=lambda p: (-len(p.parts), p.as_posix())):
        windows_path = relative.as_posix().replace('/', '\\')
        uninstall.append(f'RMDir "$INSTDIR\\{windows_path}"')
    return '\n'.join(install) + '\n', '\n'.join(uninstall) + '\n'


def verify_payload_manifest(folder: Path) -> None:
    entries = {}
    for line in (folder / 'FILES-SHA256.txt').read_text(encoding='utf-8').splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  (.+)', line)
        if not match or match[2] in entries:
            raise ValueError('Invalid portable file checksum manifest')
        entries[match[2]] = match[1]
    actual = {item.relative_to(folder).as_posix() for item in folder.rglob('*')
              if item.is_file() and item.relative_to(folder).as_posix() != 'FILES-SHA256.txt'}
    if set(entries) != actual:
        raise ValueError('Portable payload has missing or unlisted files')
    for name, digest in entries.items():
        verify_sha256(folder / name, digest)


def verify_installer_pe(path: Path) -> None:
    with path.open('rb') as source:
        if source.read(2) != b'MZ':
            raise ValueError('Installer is not a PE executable')
        source.seek(0x3c)
        data = source.read(4)
        if len(data) != 4:
            raise ValueError('Truncated PE header')
        source.seek(struct.unpack('<I', data)[0])
        data = source.read(6)
    if len(data) != 6 or data[:4] != b'PE\0\0' or data[4:] != b'\x4c\x01':
        raise ValueError('Expected the NSIS x86 bootstrap (installs the x64 runtime)')


def fetch_tool(pin: dict, archive: Path, offline: bool) -> None:
    if archive.is_file():
        verify_sha256(archive, pin['sha256'])
        return
    if offline:
        raise RuntimeError('NSIS tool archive is missing from .build/windows-installer-cache')
    url = pin['url']
    if not url.startswith('https://github.com/electron-userland/electron-builder-binaries/releases/download/'):
        raise ValueError('Tool source must be the official electron-builder-binaries release')
    temporary = archive.with_suffix('.part')
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'QuizNotebook-Packager/1.0'})
        with urllib.request.urlopen(request, timeout=120) as source, temporary.open('wb') as target:
            if not source.url.startswith('https://'):
                raise ValueError('Tool download redirect must use HTTPS')
            shutil.copyfileobj(source, target)
        verify_sha256(temporary, pin['sha256'])
        temporary.replace(archive)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='Only use checksum-verified cached tools')
    args = parser.parse_args()
    if platform.system() != 'Darwin' or platform.machine() not in ('arm64', 'x86_64'):
        raise RuntimeError('This build entry point requires an Intel or Apple Silicon Mac')
    portable = ROOT / 'release/自测本-Windows-x64.zip'
    if not portable.is_file():
        raise RuntimeError('Run python3 scripts/build-windows.py first')
    spec = importlib.util.spec_from_file_location('portable_builder', ROOT / 'scripts/build-windows.py')
    portable_builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(portable_builder)
    pin = json.loads((WINDOWS / 'installer-toolchain.json').read_text(encoding='utf-8'))
    cache = ROOT / '.build/windows-installer-cache'
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / pin['archive']
    fetch_tool(pin, archive, args.offline)
    release = ROOT / 'release'
    with tempfile.TemporaryDirectory(prefix='installer-', dir=ROOT / '.build') as temporary:
        work = Path(temporary)
        extract_tool(archive, work / 'tool')
        bundle = work / 'tool/nsis-bundle'
        arch = 'arm64' if platform.machine() == 'arm64' else 'x64'
        compiler = bundle / f'mac/{arch}/makensis'
        compiler.chmod(0o755)
        portable_builder.safe_extract(portable, work / 'portable')
        payload = work / 'portable' / portable_builder.FOLDER_NAME
        portable_builder.validate_package(payload)
        verify_payload_manifest(payload)
        payload.rename(work / 'payload')
        payload = work / 'payload'
        shutil.copyfile(bundle / 'windows/COPYING', payload / 'NSIS-LICENSE.txt')
        shutil.copyfile(bundle / 'LICENSE', payload / 'NSIS-BUNDLE-LICENSE.txt')
        provenance = {
            'application': '自测本', 'version': '1.0.0', 'author': 'Chi-cha-zly',
            'installerToolchain': pin, 'portableZipSha256': sha256(portable),
            'windowsInstallerExecutionVerified': False, 'codeSigned': False,
            'installDirectory': '%LOCALAPPDATA%\\Programs\\QuizNotebook',
            'preservedUserData': '%APPDATA%\\QuizNotebook',
        }
        (payload / 'INSTALLER-BUILD-INFO.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        manifest_files = sorted(item for item in payload.rglob('*') if item.is_file() and item.name != 'FILES-SHA256.txt')
        (payload / 'FILES-SHA256.txt').write_text(''.join(f'{sha256(item)}  {item.relative_to(payload).as_posix()}\n' for item in manifest_files), encoding='utf-8')
        install, uninstall = payload_commands(payload)
        (work / 'install-files.nsh').write_text(install, encoding='utf-8')
        (work / 'uninstall-files.nsh').write_text(uninstall, encoding='utf-8')
        shutil.copyfile(WINDOWS / 'installer.nsi', work / 'installer.nsi')
        shutil.copyfile(WINDOWS / 'icon.ico', work / 'icon.ico')
        environment = os.environ.copy()
        environment['NSISDIR'] = str(bundle / 'windows')
        size_kib = sum(item.stat().st_size for item in payload.rglob('*') if item.is_file()) // 1024
        subprocess.run([str(compiler), '-V2', '-NOCD', '-INPUTCHARSET', 'UTF8', f'-DPAYLOAD_KIB={size_kib}', 'installer.nsi'], cwd=work, env=environment, check=True)
        result = work / OUTPUT
        verify_installer_pe(result)
        result.replace(release / OUTPUT)
    result = release / OUTPUT
    (release / (OUTPUT + '.sha256')).write_text(f'{sha256(result)}  {OUTPUT}\n', encoding='utf-8')
    print(f'Created release/{OUTPUT} ({result.stat().st_size} bytes)\nSHA256: {sha256(result)}')
    print('Native macOS compilation only; Windows install/upgrade/uninstall still need Windows testing.')


if __name__ == '__main__':
    main()
