!macro NSIS_HOOK_POSTINSTALL
  ; Forga / BrowserHub: program and data are separated by design.
  ;   Program  -> $INSTDIR          (default: %LOCALAPPDATA%\Programs\BrowserHub, user selectable)
  ;   Data     -> %LOCALAPPDATA%\BrowserHub  (manager.db / config.json / logs, created by the app)
  ; Nothing to do at install time; this hook documents the layout and is the anchor
  ; for future migration logic if the default ever changes again.
  DetailPrint "BrowserHub installed to $INSTDIR (user data stays in %LOCALAPPDATA%\BrowserHub)"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; BrowserHub owns exactly one product root: %LOCALAPPDATA%\forga.space.
  ; It contains the app data (manager.db / config.json / logs) AND the WebView2
  ; user-data folder (webview\EBWebView). The stock uninstaller only removes
  ; $INSTDIR. Make the "delete app data" checkbox cover everything, and remove
  ; the legacy pre-forga.space leftovers if present.
  ${If} $DeleteAppDataCheckboxState = 1
    RmDir /r "$LOCALAPPDATA\forga.space\BrowserHub"
    RmDir "$LOCALAPPDATA\forga.space"
    RmDir /r "$LOCALAPPDATA\com.browserhub.desktop"
    RmDir /r "$LOCALAPPDATA\BrowserHub"
  ${EndIf}
!macroend
