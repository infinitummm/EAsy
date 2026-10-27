!macro NSIS_HOOK_PREINSTALL
  ; 1. Cerrar procesos anteriores si estuviesen en ejecucion
  nsExec::Exec 'taskkill /F /IM EAsy.exe /T'
  nsExec::Exec 'taskkill /F /IM "Itero Local.exe" /T'

  ; 2. Comprobar si existe desinstalador de la version anterior en el Registro de Windows (HKCU)
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.itero.local" "UninstallString"
  ${If} $R0 != ""
    ExecWait '$R0 /S'
    Sleep 1000
  ${EndIf}

  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\EAsy" "UninstallString"
  ${If} $R1 != ""
    ExecWait '$R1 /S'
    Sleep 1000
  ${EndIf}

  ; 3. Limpieza preventiva del directorio de instalacion anterior en Programs\EAsy
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\EAsy\Uninstall EAsy.exe"
    ExecWait '"$LOCALAPPDATA\Programs\EAsy\Uninstall EAsy.exe" /S'
    Sleep 1000
  ${EndIf}
!macroend
