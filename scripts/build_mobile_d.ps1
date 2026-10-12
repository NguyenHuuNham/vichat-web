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
$outputDir = "D:\vichat-build\mobile-scroll-fix-20261004\android\app\build\outputs\apk\debug"
$targetApk = "D:\vichat-build\ViChat-v1058-workspace-debug.apk"
$targetApkAlias = "D:\vichat-build\ViChat-zalo-oa-debug.apk"

# [0/3] Dong bo ma nguon moi nhat tu workspace sang staging build
Write-Host "[0/3] Syncing latest mobile src from $srcDir to $dstDir..."
robocopy $srcDir $dstDir /E /NDL /NFL /NJH /NJS /nc /ns /np
if ($LASTEXITCODE -ge 8) {
    Write-Error "Robocopy failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# Xoa APK cu va incremental packaging cache de dam bao clean package
$stagingDir = "D:\vichat-build\mobile-scroll-fix-20261004"
Get-ChildItem -Path $outputDir -Filter "*.apk" -ErrorAction SilentlyContinue | Remove-Item -Force
if (Test-Path $targetApk) { Remove-Item -Force $targetApk }
if (Test-Path $targetApkAlias) { Remove-Item -Force $targetApkAlias }
$incPkg = "$stagingDir\android\app\build\intermediates\incremental\packageDebug"
if (Test-Path $incPkg) { Remove-Item -Recurse -Force $incPkg -ErrorAction SilentlyContinue }

$env:CMAKE_BUILD_PARALLEL_LEVEL = "1"
$env:NODE_OPTIONS = "--max-old-space-size=4096"

Write-Host "[0.5/3] Pre-bundling JavaScript assets with single worker..."
$stagingDir = "D:\vichat-build\mobile-scroll-fix-20261004"
New-Item -ItemType Directory -Path "$stagingDir\android\app\build\generated\assets\react\debug" -Force | Out-Null
New-Item -ItemType Directory -Path "$stagingDir\android\app\build\generated\res\react\debug" -Force | Out-Null
New-Item -ItemType Directory -Path "$stagingDir\android\app\build\intermediates\sourcemaps\react\debug" -Force | Out-Null

Push-Location $stagingDir
try {
    & node "$stagingDir\node_modules\expo\node_modules\@expo\cli\build\bin\cli" export:embed `
        --platform android --dev false --reset-cache --entry-file index.ts `
        --bundle-output "$stagingDir\android\app\build\generated\assets\react\debug\index.android.bundle" `
        --assets-dest "$stagingDir\android\app\build\generated\res\react\debug" `
        --sourcemap-output "$stagingDir\android\app\build\intermediates\sourcemaps\react\debug\index.android.bundle.packager.map" `
        --minify false --max-workers 1

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Prebundling failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

Set-Location "$stagingDir\android"

Write-Host "[1/3] Building APK with Gradle on D:..."
& ".\gradlew.bat" --gradle-user-home "D:\vichat-build\gradle-user-home" :app:assembleDebug -x lint -x test --no-daemon --max-workers=2 "-PreactNativeArchitectures=arm64-v8a" "-Pandroid.native.buildJobs=2"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Gradle build failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

$foundApk = $null
if (Test-Path "$outputDir\app-arm64-v8a-debug.apk") {
    $foundApk = "$outputDir\app-arm64-v8a-debug.apk"
} elseif (Test-Path "$outputDir\app-debug.apk") {
    $foundApk = "$outputDir\app-debug.apk"
} else {
    $anyApk = Get-ChildItem -Path $outputDir -Filter "*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($anyApk) { $foundApk = $anyApk.FullName }
}

if ($foundApk) {
    Write-Host "[2/3] Copying APK to $targetApk..."
    Copy-Item -Path $foundApk -Destination $targetApk -Force
    Copy-Item -Path $foundApk -Destination $targetApkAlias -Force
    $apkItem = Get-Item $targetApk
    Write-Host "Build succeeded: $targetApk (Size: $([math]::Round($apkItem.Length/1MB, 2)) MB, Time: $($apkItem.LastWriteTime))"

    $env:PATH = "D:\vichat-build\android-sdk\platform-tools;$env:PATH"
    $deviceOutput = try { & adb devices 2>$null } catch { "" }
    $deviceLines = ($deviceOutput -split "`r?`n") | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of devices" }
    if ($deviceLines) {
        foreach ($line in $deviceLines) {
            $devId = ($line -split "\s+")[0]
            Write-Host "[3/3] Installing APK onto device $devId..."
            & adb -s $devId install -r $targetApk
            Write-Host "Install completed successfully onto device $devId!"
        }
    } else {
        Write-Host "No device currently attached via ADB. Ready for manual install or USB attachment."
    }
} else {
    Write-Error "APK not found in $outputDir"
}
