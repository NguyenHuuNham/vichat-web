@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo [ViChat Build] Starting APK Build v1057 (Livechat Integration)
echo ========================================================

set "GRADLE_USER_HOME=D:\vichat-build\gradle-user-home"
set "TEMP=D:\vichat-build\tmp"
set "TMP=D:\vichat-build\tmp"
set "ANDROID_HOME=D:\vichat-build\android-sdk"
set "ANDROID_SDK_ROOT=D:\vichat-build\android-sdk"
set "JAVA_HOME=D:\vichat-build\jdk"
set "npm_config_cache=D:\vichat-build\npm-cache"
set "npm_config_prefix=D:\vichat-build\npm-global"
set "PATH=D:\vichat-build\jdk\bin;D:\vichat-build\android-sdk\platform-tools;%PATH%"

cd /d "D:\vichat-build\mobile-scroll-fix-20261004\android"

echo Running gradlew assembleDebug on D:...
call gradlew.bat :app:assembleDebug -x lint -x test --no-daemon --max-workers=2 -PreactNativeArchitectures=arm64-v8a

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Gradle build failed with exit code %ERRORLEVEL%!
    exit /b %ERRORLEVEL%
)

echo [SUCCESS] Gradle build completed!
echo Copying APK artifacts...

set "OUTPUT_DIR=D:\vichat-build\mobile-scroll-fix-20261004\android\app\build\outputs\apk\debug"

if exist "%OUTPUT_DIR%\app-arm64-v8a-debug.apk" (
    set "BUILT_APK=%OUTPUT_DIR%\app-arm64-v8a-debug.apk"
) else if exist "%OUTPUT_DIR%\app-debug.apk" (
    set "BUILT_APK=%OUTPUT_DIR%\app-debug.apk"
) else (
    echo [ERROR] Cannot find output APK in %OUTPUT_DIR%!
    dir "%OUTPUT_DIR%"
    exit /b 1
)

copy /y "!BUILT_APK!" "D:\vichat-build\ViChat-v1057-livechat-debug.apk"
copy /y "!BUILT_APK!" "D:\vichat-build\ViChat-zalo-oa-debug.apk"

echo [COMPLETED] Artifact saved to D:\vichat-build\ViChat-v1057-livechat-debug.apk
