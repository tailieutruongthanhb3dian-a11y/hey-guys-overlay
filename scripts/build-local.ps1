param([switch]$Release)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    $env:CARGO_HOME = Join-Path $projectRoot '.tools/cargo'
    $env:RUSTUP_HOME = Join-Path $projectRoot '.tools/rustup'
    $env:CARGO_TARGET_DIR = Join-Path $projectRoot 'src-tauri/target'
    $llvmBin = Join-Path $projectRoot '.tools/llvm/llvm-mingw-20260826-ucrt-x86_64/bin'
    $env:PATH = "$llvmBin;$env:PATH"
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    $cargoArgs = @('+stable-x86_64-pc-windows-gnullvm', 'build', '--manifest-path', 'src-tauri/Cargo.toml', '--features', 'tauri/custom-protocol', '-j', '4')
    if ($Release) { $cargoArgs += '--release' }
    & '.tools/cargo/bin/cargo.exe' @cargoArgs
    if ($LASTEXITCODE -ne 0) { throw 'Native build failed' }
    Write-Output 'Build completed. Embedded frontend; no Vite server required.'
} finally { Pop-Location }
