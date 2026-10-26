"""Build-boundary tests; Windows runtime behavior still needs a Windows machine."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/build-windows-installer.py'


class InstallerContracts(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.is_file(), 'installer builder is not implemented')
        spec = importlib.util.spec_from_file_location('installer_builder', SCRIPT)
        self.builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.builder)

    def test_uninstaller_only_deletes_owned_payload_and_empty_directories(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'resources').mkdir()
            (root / 'resources/app.js').write_text('app')
            (root / '自测本.exe').write_bytes(b'app')
            install, uninstall = self.builder.payload_commands(root)
            self.assertEqual(uninstall, 'Delete "$INSTDIR\\resources\\app.js"\nDelete "$INSTDIR\\自测本.exe"\nIfErrors removal_failed\nRMDir "$INSTDIR\\resources"\n')
            self.assertIn('File "payload/resources/app.js"', install)
            self.assertNotIn(temp, install + uninstall)

    def test_rejects_nsis_injection_and_windows_special_names(self):
        for name in ('$TEMP', 'file*.txt', 'file?.txt', 'bad:name', 'bad"name', 'CON', 'tail.', 'tail '):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                (root / name).write_bytes(b'bad')
                with self.assertRaises(ValueError):
                    self.builder.payload_commands(root)

    def test_rejects_links_outside_owned_payload(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'link').symlink_to('/tmp')
            with self.assertRaises(ValueError):
                self.builder.payload_commands(root)

    def test_changed_tool_archive_is_rejected_before_extraction(self):
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / 'tool.tar.gz'
            archive.write_bytes(b'changed')
            with self.assertRaises(ValueError):
                self.builder.verify_sha256(archive, '0' * 64)

    def test_tool_tar_rejects_traversal_and_symlinks(self):
        import tarfile
        for name, kind in (('../outside', tarfile.REGTYPE), ('nsis-bundle/link', tarfile.SYMTYPE)):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                archive = root / 'tool.tar.gz'
                with tarfile.open(archive, 'w:gz') as output:
                    info = tarfile.TarInfo(name)
                    info.type = kind
                    info.linkname = '/tmp'
                    output.addfile(info)
                with self.assertRaises(ValueError):
                    self.builder.extract_tool(archive, root / 'out')
                self.assertFalse((root / 'out').exists())

    def test_payload_integrity_rejects_changed_or_unlisted_files(self):
        import hashlib
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'app.exe').write_bytes(b'original')
            checksum = hashlib.sha256(b'original').hexdigest()
            (root / 'FILES-SHA256.txt').write_text(checksum + '  app.exe\n')
            self.builder.verify_payload_manifest(root)
            (root / 'app.exe').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                self.builder.verify_payload_manifest(root)
            (root / 'app.exe').write_bytes(b'original')
            (root / 'private-notes.txt').write_text('must not be included')
            with self.assertRaises(ValueError):
                self.builder.verify_payload_manifest(root)

    def test_installer_pe_allows_32bit_bootstrap_but_rejects_non_pe(self):
        import struct
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'setup.exe'
            content = bytearray(256)
            content[:2] = b'MZ'
            struct.pack_into('<I', content, 0x3c, 128)
            content[128:134] = b'PE\0\0\x4c\x01'
            path.write_bytes(content)
            self.builder.verify_installer_pe(path)
            path.write_bytes(b'not an installer')
            with self.assertRaises(ValueError):
                self.builder.verify_installer_pe(path)


if __name__ == '__main__':
    unittest.main()
