; Build only via scripts/build-windows-installer.py. All input/output paths are relative.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

Name "自测本"
OutFile "QuizNotebook-Windows-x64-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\QuizNotebook"
RequestExecutionLevel user
SetCompressor /SOLID lzma
AllowSkipFiles off
SetDateSave off
CRCCheck force
ManifestDPIAware true
BrandingText "Chi-cha-zly"
VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=2052 "ProductName" "自测本"
VIAddVersionKey /LANG=2052 "ProductVersion" "1.0.0"
VIAddVersionKey /LANG=2052 "FileVersion" "1.0.0"
VIAddVersionKey /LANG=2052 "CompanyName" "Chi-cha-zly"
VIAddVersionKey /LANG=2052 "LegalCopyright" "Copyright (c) Chi-cha-zly"
VIAddVersionKey /LANG=2052 "FileDescription" "自测本 Windows 安装程序"

!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\QuizNotebook"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_WELCOMEPAGE_TEXT "将为当前用户安装自测本 1.0.0。$\r$\n$\r$\n安装前请关闭自测本。题库与答题记录保留在 AppData 中，更新及卸载不会删除它们。$\r$\n$\r$\n安装位置：$LOCALAPPDATA\Programs\QuizNotebook"
!define MUI_FINISHPAGE_TEXT "自测本已安装。可从桌面或开始菜单打开。$\r$\n$\r$\n题库与答题记录独立保存在 %APPDATA%\QuizNotebook。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

Var InstallerMutex

; Fail closed when the executable cannot be opened for exclusive write, including
; Windows' sharing violation for an executing image. Never kill the user's app.
!macro CHECK_CLOSED PREFIX
Function ${PREFIX}CheckClosed
  check_again:
  IfFileExists "$INSTDIR\自测本.exe" 0 done
  System::Call 'kernel32::CreateFileW(w "$INSTDIR\自测本.exe", i 0x40000000, i 0, p 0, i 3, i 0x80, p 0) p .r0'
  ${If} $0 == -1
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "无法更新或移除程序文件。请关闭所有自测本窗口后重试；也请检查目录是否可写。题库与答题记录不会被删除。" /SD IDCANCEL IDRETRY check_again
    SetErrorLevel 2
    Quit
  ${EndIf}
  System::Call 'kernel32::CloseHandle(p r0)'
  done:
FunctionEnd
!macroend
!insertmacro CHECK_CLOSED ""
!insertmacro CHECK_CLOSED "un."

!macro INIT PREFIX CHECKPREFIX
Function ${PREFIX}.onInit
  SetShellVarContext current
  SetRegView 64
  ; Deliberately override /D and uninstaller _?= so removal can never target a
  ; user-selected directory. There is no directory selection page.
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\QuizNotebook"
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "此安装程序需要 64 位 Windows。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  System::Call 'kernel32::CreateMutexW(p 0, i 0, w "Local\QuizNotebookInstaller") p .r0 ?e'
  Pop $1
  StrCpy $InstallerMutex $0
  ${If} $0 == 0
  ${OrIf} $1 == 183
    MessageBox MB_OK|MB_ICONSTOP "另一个自测本安装或卸载程序正在运行，或无法获得安装锁。请稍后重试。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  Call ${CHECKPREFIX}CheckClosed
FunctionEnd
!macroend
!insertmacro INIT "" ""
!insertmacro INIT "un" "un."

Section "Install"
  Call CheckClosed
  SetOverwrite on
  ClearErrors
  !include "install-files.nsh"
  IfErrors install_failed
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  IfErrors install_failed
  CreateDirectory "$SMPROGRAMS\自测本"
  CreateShortCut "$SMPROGRAMS\自测本\自测本.lnk" "$INSTDIR\自测本.exe" "" "$INSTDIR\resources\app\icon.ico"
  CreateShortCut "$SMPROGRAMS\自测本\卸载自测本.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\自测本.lnk" "$INSTDIR\自测本.exe" "" "$INSTDIR\resources\app\icon.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "自测本"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "1.0.0"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Chi-cha-zly"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\resources\app\icon.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" ${PAYLOAD_KIB}
  IfErrors install_failed
  Goto install_done
  install_failed:
  MessageBox MB_OK|MB_ICONSTOP "安装未能完成。请检查可用空间、目录权限，并关闭自测本后重新安装。" /SD IDOK
  SetErrorLevel 2
  Abort
  install_done:
SectionEnd

Section "Uninstall"
  Call un.CheckClosed
  ClearErrors
  ; The build generates exact Delete paths; RMDir only removes empty directories.
  !include "uninstall-files.nsh"
  Delete "$DESKTOP\自测本.lnk"
  Delete "$SMPROGRAMS\自测本\自测本.lnk"
  Delete "$SMPROGRAMS\自测本\卸载自测本.lnk"
  RMDir "$SMPROGRAMS\自测本"
  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  Delete "$INSTDIR\Uninstall.exe"
  SetOutPath "$TEMP"
  RMDir "$INSTDIR"
  Goto done
  removal_failed:
  MessageBox MB_OK|MB_ICONEXCLAMATION "部分程序文件未能移除。请关闭自测本后重新运行卸载程序。额外放入安装目录的文件和题库记录会保留。" /SD IDOK
  SetErrorLevel 2
  done:
SectionEnd
