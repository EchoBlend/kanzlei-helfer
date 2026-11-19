; Ergänzungen zum electron-builder-Installer (nsis.include in electron-builder.yml).
; Liegt bewusst nicht in public/: das kopiert Vite in dist und damit in die App.

; electron-builder legt bei jeder Installation eine Kopie des Installers für Auto-Updates ab
; (%LOCALAPPDATA%\kanzlei-helfer-updater\installer.exe, ~110 MB). Die App hat keine Auto-Updates → sofort weg.
!macro customInstall
  RMDir /r "$LOCALAPPDATA\kanzlei-helfer-updater"
!macroend

; Echte Deinstallation (kein Update): auch diese Kopie entfernen, falls eine ältere Fassung sie angelegt hat.
; Den Datenordner %APPDATA%\Kanzlei-Helfer löscht electron-builder selbst (deleteAppDataOnUninstall).
!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\kanzlei-helfer-updater"
  ${endIf}
!macroend
