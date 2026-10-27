!macro NSIS_HOOK_PREINSTALL
  ; 1. Cerrar procesos anteriores si estuviesen en ejecucion
  nsExec::Exec 'taskkill /F /IM EAsy.exe /T'
  nsExec::Exec 'taskkill /F /IM easy-app.exe /T'
  nsExec::Exec 'taskkill /F /IM "Itero Local.exe" /T'

  ; 2. Comprobar y ejecutar desinstaladores de versiones Electron anteriores en el Registro
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ddc1a574-b15f-59d7-be15-dead1c00164d" "UninstallString"
  ${If} $R0 != ""
    ExecWait '$R0 /S'
    Sleep 1000
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ddc1a574-b15f-59d7-be15-dead1c00164d"
  ${EndIf}

  ReadRegStr $R1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.itero.local" "UninstallString"
  ${If} $R1 != ""
    ExecWait '$R1 /S'
    Sleep 1000
  ${EndIf}

  ; 3. Desinstaladores directos de versiones Electron anteriores si existen en disco
  ${If} ${FileExists} "$LOCALAPPDATA\Programs\Itero Local\EAsy\Uninstall EAsy.exe"
    ExecWait '"$LOCALAPPDATA\Programs\Itero Local\EAsy\Uninstall EAsy.exe" /S'
    Sleep 1000
  ${EndIf}

  ${If} ${FileExists} "$LOCALAPPDATA\Programs\EAsy\Uninstall EAsy.exe"
    ExecWait '"$LOCALAPPDATA\Programs\EAsy\Uninstall EAsy.exe" /S'
    Sleep 1000
  ${EndIf}

  ; 4. Eliminar directorios residuales de Electron para liberar espacio
  RMDir /r "$LOCALAPPDATA\Programs\Itero Local"
  RMDir /r "$LOCALAPPDATA\Programs\EAsy"

  ; 5. Eliminar binario obsoleto de la primera compilacion y limpiar accesos directos
  ${If} ${FileExists} "$LOCALAPPDATA\EAsy\easy-app.exe"
    Delete "$LOCALAPPDATA\EAsy\easy-app.exe"
  ${EndIf}
  Delete "$DESKTOP\EAsy.lnk"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Crear acceso directo obligatorio en el Escritorio
  CreateShortcut "$DESKTOP\EAsy.lnk" "$INSTDIR\EAsy.exe" "" "$INSTDIR\EAsy.exe" 0
!macroend
