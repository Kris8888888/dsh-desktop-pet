# 把桌面宠物装进 Windows 版 DeepSeek Harness。DSH 升级后重跑一次即可。
# 双击 desktop-pet 文件夹里的「安装桌面宠物.bat」就会运行这个脚本。
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
$Asar = Join-Path $Dir "resources\app.asar"
Write-Host "找到 DeepSeek Harness：$Dir"
if (-not (Test-Path $DshProfile)) { throw "找不到 $DshProfile。请先正常打开一次 DeepSeek Harness 再装。" }
Wait-DshClosed -Exe $Exe

New-Item -ItemType Directory -Force $Backup | Out-Null
if ((Invoke-Patch -Exe $Exe -PatchArgs @("has-pet", $Asar)) -eq "no") {
  Copy-Item $Asar (Join-Path $Backup "app.asar.orig") -Force
  Write-Host "已备份官方 app.asar"
}
$Orig = Join-Path $Backup "app.asar.orig"
if (-not (Test-Path $Orig)) { throw "没有官方 app.asar 备份（$Orig）。请重装一次 DeepSeek Harness 再运行。" }

Write-Host "打补丁 …"
$New = [IO.Path]::GetTempFileName()
Invoke-Patch -Exe $Exe -PatchArgs @("patch", $Orig, $New, (Join-Path $Root "pet")) | Out-Null
try {
  Copy-Item $New $Asar -Force
} catch {
  throw "写不进 $Asar（可能装在 Program Files 里）。请右键「安装桌面宠物.bat」→ 以管理员身份运行。"
}
Remove-Item $New -ErrorAction SilentlyContinue

# DSH 改了 asar 后，如果 exe 里开着「内嵌 asar 完整性校验」就会打不开；开着就关掉（原 exe 备份成 .pre-pet）
$fuse = Invoke-Patch -Exe $Exe -PatchArgs @("fuse", $Exe)
if ($fuse -eq "turned-off") { Write-Host "已关闭 asar 完整性校验（原程序备份为 $Exe.pre-pet）" }

Write-Host "安装客户端插件 …"
Invoke-Patch -Exe $Exe -PatchArgs @("profile", $DshProfile, $Root) | Out-Null

Write-Host ""
Write-Host "完成。打开 DeepSeek Harness 就能看到宠物；设置 → 桌面宠物 可以换角色、大小、配色。"
