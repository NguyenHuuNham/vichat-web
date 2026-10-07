$ErrorActionPreference = "Stop"
$env:GRADLE_USER_HOME = "D:\vichat-build\gradle-user-home"
$env:TEMP = "D:\vichat-build\tmp"
$env:TMP = "D:\vichat-build\tmp"
$env:ANDROID_HOME = "D:\vichat-build\android-sdk"
$env:ANDROID_SDK_ROOT = "D:\vichat-build\android-sdk"
$env:JAVA_HOME = "D:\vichat-build\jdk"
$env:npm_config_cache = "D:\vichat-build\npm-cache"
$env:npm_config_prefix = "D:\vichat-build\npm-global"

$projectRoot = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $projectRoot "mobile\src"
$dstDir = "D:\vichat-build\mobile-scroll-fix-20261004\src"
$builtApk = "D:\vichat-build\mobile-scroll-fix-20261004\android\app\build\outputs\apk\debug\app-debug.apk"
$targetApk = "D:\vichat-build\ViChat-zalo-oa-debug.apk"

# [0/3] Dong bo ma nguon moi nhat tu workspace sang staging build
Write-Host "[0/3] Syncing latest mobile src from $srcDir to $dstDir..."
robocopy $srcDir $dstDir /E /NDL /NFL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) {
    Write-Error "Robocopy failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# Xoa APK cu truoc khi build de dam bao chi nhan APK moi
if (Test-Path $builtApk) { Remove-Item -Force $builtApk }
if (Test-Path $targetApk) { Remove-Item -Force $targetApk }

$env:CMAKE_BUILD_PARALLEL_LEVEL = "1"

Set-Location "D:\vichat-build\mobile-scroll-fix-20261004\android"

Write-Host "[1/3] Building APK with Gradle on D:..."
& ".\gradlew.bat" --gradle-user-home "D:\vichat-build\gradle-user-home" :app:assembleDebug -x lint -x test --no-daemon --max-workers=1 "-PreactNativeArchitectures=arm64-v8a" "-Pandroid.native.buildJobs=1"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Gradle build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

if (Test-Path $builtApk) {
    Write-Host "[2/3] Copying APK to $targetApk..."
    Copy-Item -Path $builtApk -Destination $targetApk -Force
    $apkItem = Get-Item $targetApk
    Write-Host "Build succeeded: $targetApk (Size: $([math]::Round($apkItem.Length/1MB, 2)) MB, Time: $($apkItem.LastWriteTime))"

    $devices = (adb devices) -join "`n"
    if ($devices -match "f36c9ba7\s+device") {
        Write-Host "[3/3] Installing APK onto device f36c9ba7..."
        & adb -s f36c9ba7 install -r $targetApk
        Write-Host "Install completed successfully onto Oppo Find X5 (f36c9ba7)!"
    } else {
        Write-Host "No f36c9ba7 device attached, skip install."
    }
} else {
    Write-Error "APK not found at $builtApk"
}
