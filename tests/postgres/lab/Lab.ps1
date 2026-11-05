[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('Start','Bootstrap','Migrate','Verify','SqlTests','Concurrency','Status','Destroy')][string]$Action)
$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.json') -Raw | ConvertFrom-Json
if ($settings.container -ne 'alencar-revendamais-pg17-lab' -or $settings.database -ne 'revendamais_leads_test' -or
    $settings.host -ne '127.0.0.1' -or $settings.port -ne 55432 -or $settings.image -ne 'postgres:17-bookworm') {
  throw 'Laboratory settings must retain the fixed local identity.'
}
foreach ($key in @('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')) {
  if ([Environment]::GetEnvironmentVariable($key,'Process')) { throw 'Use a clean shell without Docker remote/context overrides.' }
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is unavailable. See README; nothing is installed automatically.' }
# Local Windows named pipe: never honor a remote Docker context or TCP daemon.
$dockerHost = 'npipe:////./pipe/docker_engine'
function Invoke-LabDocker([string[]]$Arguments) {
  $result = & docker --host $dockerHost @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Local laboratory Docker command failed.' }
  return $result
}
function Assert-LabContainer {
  $raw = Invoke-LabDocker -Arguments @('inspect',$settings.container)
  $inspect = @((($raw -join "`n") | ConvertFrom-Json))[0]
  $ports = @($inspect.HostConfig.PortBindings.'5432/tcp')
  if ($inspect.Name -ne ('/' + $settings.container) -or $inspect.Config.Image -ne $settings.image -or
      $inspect.Config.Labels.($settings.label) -ne $settings.labelValue -or
      $ports.Count -ne 1 -or $ports[0].HostIp -ne '127.0.0.1' -or $ports[0].HostPort -ne '55432' -or
      $inspect.HostConfig.Privileged -or $inspect.HostConfig.Binds -or
      @($inspect.Mounts | Where-Object { $_.Type -ne 'tmpfs' }).Count -gt 0 -or
      -not ($inspect.HostConfig.Tmpfs.PSObject.Properties.Name -contains '/var/lib/postgresql/data')) {
    throw 'Refusing operation: container identity, loopback binding or ephemeral storage mismatch.'
  }
  return $inspect
}
function Invoke-LabSql([string]$Path, [bool]$SingleTransaction=$true) {
  $state = Assert-LabContainer
  if (-not $state.State.Running) { throw 'Laboratory is not running.' }
  $sqlText = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $dockerArgs = @('exec','-i',$settings.container,'psql','-X','--no-password',
    '--host=/var/run/postgresql','--port=5432','--username=revendamais_lab',
    '--dbname=revendamais_leads_test','--set=ON_ERROR_STOP=1')
  if ($SingleTransaction) { $dockerArgs += '--single-transaction' }
  $dockerArgs += @('--file=-')
  # All SQL goes to the named container's own Unix socket. No CRM .env/PG* URL.
  $savedEncoding = $OutputEncoding
  try {
    $OutputEncoding = New-Object System.Text.UTF8Encoding
    $sqlText | & docker --host $dockerHost @dockerArgs
    if ($LASTEXITCODE -ne 0) { throw 'Laboratory SQL failed; stop and inspect the disposable environment.' }
  } finally { $OutputEncoding = $savedEncoding }
}
switch ($Action) {
  'Start' {
    $existing = Invoke-LabDocker -Arguments @('container','ls','--all','--filter',('name=^/' + $settings.container + '$'),'--format','{{.Names}}')
    if ($existing) { throw 'Container name already exists. Inspect it; never auto-reuse or auto-delete.' }
    # Image must already have been downloaded explicitly. No implicit installation/pull.
    Invoke-LabDocker -Arguments @('run','--detach','--pull=never','--name',$settings.container,
      '--label',($settings.label + '=' + $settings.labelValue),'--publish','127.0.0.1:55432:5432',
      '--tmpfs','/var/lib/postgresql/data:rw,nosuid','--security-opt','no-new-privileges',
      '--env',('POSTGRES_DB=' + $settings.database),'--env',('POSTGRES_USER=' + $settings.user),
      '--env',('POSTGRES_PASSWORD=' + $settings.password),
      '--health-cmd','pg_isready -U revendamais_lab -d revendamais_leads_test',
      '--health-interval','1s','--health-timeout','2s','--health-retries','30',$settings.image)
    for ($i=0; $i -lt 30; $i++) {
      $state = Assert-LabContainer
      if ($state.State.Health.Status -eq 'healthy') { Write-Output 'Disposable PostgreSQL container ready; bootstrap has not run.'; return }
      Start-Sleep -Seconds 1
    }
    throw 'Health check timed out. Do not bootstrap until investigated.'
  }
  'Status' { $state = Assert-LabContainer; Write-Output ('Laboratory running: ' + $state.State.Running) }
  'Bootstrap' { Invoke-LabSql -Path (Join-Path $PSScriptRoot 'bootstrap.sql') }
  'Migrate' {
    Invoke-LabSql -Path (Join-Path $PSScriptRoot 'preflight.sql')
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
    Invoke-LabSql -Path (Join-Path $repoRoot 'drizzle/migrations/0011_revendamais_lead_receipts.sql')
  }
  'Verify' {
    Invoke-LabSql -Path (Join-Path $PSScriptRoot 'preflight.sql')
    Invoke-LabSql -Path (Join-Path $PSScriptRoot 'verify.sql')
  }
  'SqlTests' {
    Invoke-LabSql -Path (Join-Path $PSScriptRoot 'preflight.sql')
    Invoke-LabSql -Path (Join-Path $PSScriptRoot '../revendamais-leads.test.sql') -SingleTransaction $false
  }
  'Concurrency' {
    $null = Assert-LabContainer
    Invoke-LabSql -Path (Join-Path $PSScriptRoot 'preflight.sql')
    $savedOpt = $env:REVENDAMAIS_TEST_DISPOSABLE
    $savedUrl = $env:REVENDAMAIS_TEST_DATABASE_URL
    try {
      $env:REVENDAMAIS_TEST_DISPOSABLE = 'YES'
      $env:REVENDAMAIS_TEST_DATABASE_URL = 'postgresql://' + $settings.user + ':' + $settings.password + '@127.0.0.1:55432/revendamais_leads_test'
      & node (Join-Path $PSScriptRoot '../revendamais-concurrency.mjs')
      if ($LASTEXITCODE -ne 0) { throw 'Concurrency fixture failed; never retry against another database.' }
    } finally { $env:REVENDAMAIS_TEST_DISPOSABLE = $savedOpt; $env:REVENDAMAIS_TEST_DATABASE_URL = $savedUrl }
  }
  'Destroy' {
    $null = Assert-LabContainer
    # Exact owned container only. No host filesystem paths, rm/prune/down or SQL DROP.
    Invoke-LabDocker -Arguments @('rm','--force','--volumes',$settings.container)
    Write-Output 'Only the verified disposable container and its ephemeral storage were discarded.'
  }
}
