# 卸载 Windows 版的桌面宠物：还原官方 app.asar、程序文件和 profile。
# 双击「卸载桌面宠物.bat」运行。
param([string]$DshDir)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backup = Join-Path $Root "backup\windows"

function Find-Dsh {
  param([string]$Dir)
  $dirs = @()
  if ($Dir) { $dirs += $Dir }
  foreach ($key in @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")) {
    Get-ItemProperty $key -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*DeepSeek Harness*" } | ForEach-Object {
      if ($_.InstallLocation) { $dirs += $_.InstallLocation }
      if ($_.DisplayIcon) { $dirs += (Split-Path -Parent ($_.DisplayIcon -replace '"', '' -replace ',\d+$', '')) }
    }
  }
  $dirs += @("$env:LOCALAPPDATA\Programs\DeepSeek Harness", "$env:LOCALAPPDATA\Programs\deepseek-harness", "$env:ProgramFiles\DeepSeek Harness", "${env:ProgramFiles(x86)}\DeepSeek Harness")
  foreach ($d in $dirs) {
    if (-not $d -or -not (Test-Path (Join-Path $d "resources\app.asar"))) { continue }
    $exe = Get-ChildItem $d -Filter "*.exe" | Where-Object { $_.Name -notlike "Uninstall*" -and $_.Name -notlike "elevate*" } | Sort-Object { if ($_.Name -like "DeepSeek*") { 0 } else { 1 } } | Select-Object -First 1
    if ($exe) { return $exe.FullName }
  }
  $d = Read-Host "没找到 DeepSeek Harness。请把它的安装文件夹（里面有 resources 文件夹）拖进这个窗口，然后回车"
  return Find-Dsh -Dir ($d.Trim('"', ' '))
}

function Wait-DshClosed {
  param([string]$Exe)
  while (Get-Process | Where-Object { $_.Path -eq $Exe }) {
    Read-Host "DeepSeek Harness 还开着。请在右下角托盘里完全退出它，然后回车继续"
  }
}

# 用 DSH 自己当 Node 跑 tools\patch.mjs（不需要另装 Node / Python）
function Invoke-Patch {
  param([string]$Exe, [string[]]$PatchArgs)
  $out = [IO.Path]::GetTempFileName()
  $err = "$out.err"
  $env:ELECTRON_RUN_AS_NODE = "1"
  $argLine = (@((Join-Path $Root "tools\patch.mjs")) + $PatchArgs | ForEach-Object { '"' + $_ + '"' }) -join " "
  $p = Start-Process -FilePath $Exe -ArgumentList $argLine -Wait -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  Remove-Item Env:\ELECTRON_RUN_AS_NODE
  $text = (Get-Content $out -Raw -ErrorAction SilentlyContinue)
  if ($p.ExitCode -ne 0) { throw ("patch.mjs 出错：" + (Get-Content $err -Raw -ErrorAction SilentlyContinue)) }
  Remove-Item $out, $err -ErrorAction SilentlyContinue
  if ($text) { return ($text.Trim() -split "`r?`n")[-1] } else { return "" }
}

$DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME ".dsh" }
$DshProfile = Join-Path $DshHome "profiles\desktop"

$Exe = Find-Dsh -Dir $DshDir
$Dir = Split-Path -Parent $Exe
Wait-DshClosed -Exe $Exe
$Orig = Join-Path $Backup "app.asar.orig"
if (Test-Path $Orig) { Copy-Item $Orig (Join-Path $Dir "resources\app.asar") -Force; Write-Host "已还原官方 app.asar" }
if (Test-Path "$Exe.pre-pet") { Copy-Item "$Exe.pre-pet" $Exe -Force; Remove-Item "$Exe.pre-pet"; Write-Host "已还原程序文件" }
Remove-Item (Join-Path $DshProfile "node_modules\dsh-desktop-pet") -Recurse -Force -ErrorAction SilentlyContinue
$pkg = Join-Path $DshProfile "package.json"
if (Test-Path "$pkg.before-pet") { Copy-Item "$pkg.before-pet" $pkg -Force }
Write-Host "已卸载。宠物自己的数据（状态、日记）留在 %APPDATA% 下，重装后还在。"
