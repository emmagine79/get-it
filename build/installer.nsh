!include LogicLib.nsh

!macro closeLegacyProcess PROCESS_NAME
  DetailPrint "Closing ${PROCESS_NAME} if it is still running."
  nsExec::ExecToStack 'taskkill /F /T /IM "${PROCESS_NAME}"'
  Pop $0
  Pop $0
!macroend

!macro customInit
  !insertmacro closeLegacyProcess "Gentle Day.exe"
  !insertmacro closeLegacyProcess "Get It.exe"
!macroend

!macro removeBrokenLegacyFiles
  DetailPrint "Removing files left by a broken legacy install."
  Delete "$INSTDIR\Gentle Day.exe"
  Delete "$INSTDIR\Get It.exe"
  Delete "$INSTDIR\Uninstall Gentle Day.exe"
  Delete "$INSTDIR\Uninstall Get It.exe"
  RMDir /r "$INSTDIR\resources"
!macroend

!macro customUnInstallCheck
  DetailPrint "Previous uninstaller failed or is corrupted; continuing with repair install."
  !insertmacro removeBrokenLegacyFiles
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  DetailPrint "Previous current-user uninstaller failed or is corrupted; continuing with repair install."
  !insertmacro removeBrokenLegacyFiles
  ClearErrors
!macroend
