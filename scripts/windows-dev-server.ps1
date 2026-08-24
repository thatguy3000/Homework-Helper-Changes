param(
  [Parameter(Position = 0)]
  [ValidateSet("install", "uninstall", "start", "stop", "restart", "update", "status", "run")]
  [string]$Command = "status"
)

$ErrorActionPreference = "Stop"

$TaskName = "Homework Helper Local Dev Server"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDirectory = Join-Path $ProjectRoot "logs"
$LogPath = Join-Path $LogDirectory "dev-server.log"
$TaskSchedulerPath = Join-Path $env:SystemRoot "System32\schtasks.exe"

function Test-ServerTask {
  & $TaskSchedulerPath /Query /TN $TaskName *> $null
  return $LASTEXITCODE -eq 0
}

function Test-ServerHealth {
  $response = $null
  try {
    $request = [System.Net.HttpWebRequest]::Create("http://localhost:3000/")
    $request.Method = "HEAD"
    $request.Timeout = 3000
    $request.ReadWriteTimeout = 3000
    $response = $request.GetResponse()
    return $true
  } catch {
    return $false
  } finally {
    if ($null -ne $response) {
      $response.Dispose()
    }
  }
}

function Start-ServerTask {
  & $TaskSchedulerPath /Run /TN $TaskName | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Windows could not start '$TaskName'."
  }
}

function Stop-ServerTask {
  if (-not (Test-ServerTask)) {
    return
  }

  & $TaskSchedulerPath /End /TN $TaskName *> $null
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Test-ServerHealth)) {
      break
    }
    Start-Sleep -Milliseconds 500
  }

  # Allow Windows to finish delivering the stop signal before a replacement
  # task is started; otherwise the new process can inherit the old Ctrl+C.
  Start-Sleep -Seconds 2
}

switch ($Command) {
  "run" {
    New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
    Set-Location -LiteralPath $ProjectRoot

    $npmCommand = Get-Command npm.cmd -ErrorAction Stop
    "`n[$(Get-Date -Format o)] Starting Homework Helper" |
      Out-File -FilePath $LogPath -Append -Encoding utf8

    & $npmCommand.Source run dev 2>&1 |
      Out-File -FilePath $LogPath -Append -Encoding utf8
    exit $LASTEXITCODE
  }

  "install" {
    New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null

    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $powerShellPath = (Get-Process -Id $PID).Path
    $taskArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" run"
    $action = New-ScheduledTaskAction `
      -Execute $powerShellPath `
      -Argument $taskArguments `
      -WorkingDirectory $ProjectRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity
    $principal = New-ScheduledTaskPrincipal `
      -UserId $identity `
      -LogonType Interactive `
      -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -ExecutionTimeLimit ([TimeSpan]::Zero) `
      -MultipleInstances IgnoreNew `
      -RestartCount 3 `
      -RestartInterval (New-TimeSpan -Minutes 1)

    Stop-ServerTask
    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Principal $principal `
      -Settings $settings `
      -Description "Runs the Homework Helper development server after sign-in." `
      -Force | Out-Null
    Start-ServerTask
    Write-Output "Installed and started '$TaskName'."
  }

  "uninstall" {
    Stop-ServerTask
    if (Test-ServerTask) {
      & $TaskSchedulerPath /Delete /TN $TaskName /F | Out-Null
      if ($LASTEXITCODE -ne 0) {
        throw "Windows could not remove '$TaskName'."
      }
    }
    Write-Output "Removed '$TaskName'."
  }

  "start" {
    if (-not (Test-ServerTask)) {
      throw "The background server is not installed. Run 'npm run server:install' first."
    }
    if (-not (Test-ServerHealth)) {
      Start-ServerTask
    }
    Write-Output "Started '$TaskName'."
  }

  "stop" {
    Stop-ServerTask
    Write-Output "Stopped '$TaskName'."
  }

  "restart" {
    if (-not (Test-ServerTask)) {
      throw "The background server is not installed. Run 'npm run server:install' first."
    }
    Stop-ServerTask
    Start-ServerTask
    Write-Output "Restarted '$TaskName'."
  }

  "update" {
    if (-not (Test-ServerTask)) {
      throw "The background server is not installed. Run 'npm run server:install' first."
    }

    Stop-ServerTask
    Set-Location -LiteralPath $ProjectRoot
    $npmCommand = Get-Command npm.cmd -ErrorAction Stop
    & $npmCommand.Source ci
    if ($LASTEXITCODE -ne 0) {
      throw "Dependency installation failed. The background server remains stopped."
    }

    Start-ServerTask
    Write-Output "Updated dependencies and restarted '$TaskName'."
  }

  "status" {
    if (-not (Test-ServerTask)) {
      Write-Output "Not installed"
      exit 1
    }

    Write-Output "Task: Installed"
    if (Test-ServerHealth) {
      Write-Output "Server: Running on http://localhost:3000"
    } else {
      Write-Output "Server: Not listening"
    }
    Write-Output "Log: $LogPath"
  }
}
