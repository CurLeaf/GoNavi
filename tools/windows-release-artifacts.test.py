#!/usr/bin/env python3
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = (
    ROOT / ".github" / "workflows" / "release.yml",
    ROOT / ".github" / "workflows" / "dev-build.yml",
)
INSTALLER = ROOT / "build" / "windows" / "installer.wxs"
WIX_NAMESPACE = "http://wixtoolset.org/schemas/v4/wxs"
UPGRADE_CODE = "CDD6BF2F-ED1E-4345-A0AB-DCDB7E15FB23"
AMD64_COMPONENT_GUID = "0BCEE70B-9CF2-449C-9ADE-190188493234"
ARM64_COMPONENT_GUID = "7F4C7757-329F-42B0-B312-D4B8AD50415E"


class WindowsReleaseArtifactsTest(unittest.TestCase):
    def test_release_workflows_publish_portable_and_msi_assets(self) -> None:
        for workflow in WORKFLOWS:
            with self.subTest(workflow=workflow.name):
                source = workflow.read_text(encoding="utf-8")
                self.assertIn("Package Windows Portable EXE and MSI", source)
                self.assertIn("-Portable.exe", source)
                self.assertIn("-Installer.msi", source)
                self.assertIn("GoNavi-*.msi", source)
                self.assertIn("dotnet tool install wix --tool-path $wixTools --version $wixVersion", source)
                self.assertIn('WixToolset.UI.wixext/$wixVersion', source)
                self.assertIn('WixToolset.UI.wixext/6.0.2', source)
                self.assertIn("-arch $wixArch", source)
                self.assertIn("TestExpectedAssetNameForWindowsInstallMode", source)
                self.assertIn("TestInstallUpdateAndRestartMSI", source)
                self.assertIn("TestBuildWindowsMSIUpdatePowerShellScript", source)
                self.assertIn('-d "ProductName=GoNavi"', source)
                self.assertIn(f'-d "UpgradeCode={UPGRADE_CODE}"', source)
                self.assertIn('-d "InstallFolderName=GoNavi"', source)
                self.assertIn('-d "RegistryKeyName=GoNavi"', source)
                self.assertIn(f'"{AMD64_COMPONENT_GUID}"', source)
                self.assertIn(f'"{ARM64_COMPONENT_GUID}"', source)
                self.assertIn('$installMarkerPath = Join-Path $env:RUNNER_TEMP ".gonavi-msi-install"', source)
                self.assertIn('-d "InstallMarker=$installMarkerPath"', source)
                self.assertNotIn('-d "ProductName=GoNavi Dev"', source)
                self.assertNotIn('-d "InstallFolderName=GoNavi Dev"', source)
                self.assertNotIn('-d "RegistryKeyName=GoNavi Dev"', source)
                self.assertNotIn("DA3DACF2-1E4B-428C-8E6F-A37D3A05CAF7", source)
                self.assertNotIn(
                    '$finalExeName = "GoNavi-$version-${{ matrix.os_name }}-${{ matrix.arch_name }}${{ matrix.artifact_suffix }}.exe"',
                    source,
                )

        dev_source = WORKFLOWS[1].read_text(encoding="utf-8")
        self.assertIn('$productVersion = "255.0.$runNumber"', dev_source)
        self.assertNotIn('$productVersion = "0.0.$runNumber"', dev_source)

    def test_installer_declares_upgrade_shortcuts_and_uninstall_metadata(self) -> None:
        root = ET.parse(INSTALLER).getroot()
        ns = {"wix": WIX_NAMESPACE}
        package = root.find("wix:Package", ns)
        self.assertIsNotNone(package)
        assert package is not None
        self.assertEqual(package.attrib["Scope"], "perMachine")
        self.assertEqual(package.attrib["InstallerVersion"], "500")
        self.assertEqual(package.attrib["ProductCode"], "*")
        major_upgrade = package.find("wix:MajorUpgrade", ns)
        self.assertIsNotNone(major_upgrade)
        assert major_upgrade is not None
        self.assertEqual(major_upgrade.attrib["AllowDowngrades"], "yes")
        self.assertEqual(major_upgrade.attrib["Schedule"], "afterInstallInitialize")
        self.assertNotIn("AllowSameVersionUpgrades", major_upgrade.attrib)
        self.assertNotIn("DowngradeErrorMessage", major_upgrade.attrib)
        self.assertIsNotNone(package.find("wix:MediaTemplate", ns))
        self.assertIsNotNone(package.find("wix:Property[@Id='ARPPRODUCTICON']", ns))
        self.assertIsNotNone(package.find("wix:SetProperty[@Id='ARPINSTALLLOCATION']", ns))
        executable = package.find(".//wix:File[@Id='GoNaviExe']", ns)
        self.assertIsNotNone(executable)
        assert executable is not None
        start_menu_shortcut = executable.find("wix:Shortcut[@Id='StartMenuShortcut']", ns)
        self.assertIsNotNone(start_menu_shortcut)
        assert start_menu_shortcut is not None
        self.assertNotIn("Icon", start_menu_shortcut.attrib)
        desktop_shortcut = executable.find("wix:Shortcut[@Id='DesktopShortcut']", ns)
        self.assertIsNotNone(desktop_shortcut)
        assert desktop_shortcut is not None
        self.assertNotIn("Icon", desktop_shortcut.attrib)
        marker = package.find(".//wix:RegistryValue[@Name='InstallType']", ns)
        self.assertIsNotNone(marker)
        assert marker is not None
        self.assertEqual(marker.attrib["Value"], "MSI")
        install_path = package.find(".//wix:RegistryValue[@Name='InstallPath']", ns)
        self.assertIsNotNone(install_path)
        assert install_path is not None
        self.assertEqual(install_path.attrib["Value"], "[INSTALLFOLDER]GoNavi.exe")
        file_marker = package.find(".//wix:File[@Id='GoNaviMsiInstallMarker']", ns)
        self.assertIsNotNone(file_marker)
        assert file_marker is not None
        self.assertEqual(file_marker.attrib["Source"], "$(var.InstallMarker)")
        self.assertEqual(file_marker.attrib["Name"], ".gonavi-msi-install")


if __name__ == "__main__":
    unittest.main()
