!macro NSIS_HOOK_PREINSTALL
  ; 1. Cerrar procesos anteriores si estuviesen en ejecucion
  nsExec::Exec 'taskkill /F /IM EAsy.exe /T'
  nsExec::Exec 'taskkill /F /IM easy-app.exe /T'
  nsExec::Exec 'taskkill /F /IM "Itero Local.exe" /T'

  ; 2. Comprobar si existe desinstalador de la version Electron anterior en el Registro
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.itero.local" "UninstallString"
  ${If} $R0 != ""
    ExecWait '$R0 /S'
    Sleep 1000
  ${EndIf}

  ; 3. Desinstalador directo de la version Electron si existe
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\EAsy\Uninstall EAsy.exe"
    ExecWait '"$LOCALAPPDATA\Programs\EAsy\Uninstall EAsy.exe" /S'
    Sleep 1000
  ${EndIf}
!macroend
