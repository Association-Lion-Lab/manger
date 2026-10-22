# Local test binaries only: no installer, service, PATH or production data changes.
$ErrorActionPreference = 'Stop'
$runtimeVersion = '18.6-5'
$archiveName = "postgresql-$runtimeVersion-windows-x64-binaries.zip"
$archiveUrl = "https://get.enterprisedb.com/postgresql/$archiveName"
# Published by EDB at the archive URL + .sha256, checked on 2026-10-22.
$expectedHash = 'e2246ba91d22345bc3d017586c09ede52d9df180b1eeb480f050445f1cad84e2'
$toolsRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.test-tools'))
$archivePath = Join-Path $toolsRoot $archiveName
$runtimeRoot = Join-Path $toolsRoot "postgresql-$runtimeVersion"
$binaryDirectory = Join-Path $runtimeRoot 'pgsql/bin'

New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
if ((Get-Item -LiteralPath $toolsRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'Le dossier des outils ne doit pas être un lien.'
}
if (-not (Test-Path -LiteralPath $archivePath)) {
    Write-Output "Téléchargement EDB PostgreSQL $runtimeVersion (environ 367 Mio)..."
    Invoke-WebRequest -Uri $archiveUrl -OutFile $archivePath -TimeoutSec 300 -UseBasicParsing
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'Empreinte PostgreSQL incorrecte : archive conservée, aucun binaire exécuté.'
}

if (-not (Test-Path -LiteralPath $runtimeRoot)) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        $entries = @($archive.Entries | Where-Object { $_.FullName -match '^pgsql/(bin|lib|share)/' })
        if ($entries.Count -eq 0) { throw 'Archive PostgreSQL sans fichiers exécutables attendus.' }
        New-Item -ItemType Directory -Path $runtimeRoot | Out-Null
        foreach ($entry in $entries) {
            $target = [IO.Path]::GetFullPath((Join-Path $runtimeRoot $entry.FullName))
            $prefix = $runtimeRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
            if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -or
                $entry.FullName.Contains(':') -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) {
                throw "Chemin inattendu dans l'archive : extraction interrompue."
            }
            if ($entry.FullName.EndsWith('/')) {
                New-Item -ItemType Directory -Path $target -Force | Out-Null
            } else {
                New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
            }
        }
    } finally { $archive.Dispose() }
}
if ((Get-Item -LiteralPath $runtimeRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'Le dossier PostgreSQL ne doit pas être un lien.'
}
foreach ($name in @('postgres', 'initdb', 'pg_ctl', 'psql', 'pg_dump')) {
    $binary = Join-Path $binaryDirectory "$name.exe"
    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) { throw "Binaire absent : $name" }
    $version = & $binary --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '\b18\.6\b') { throw "Version PostgreSQL inattendue : $name" }
    Write-Output $version
}
Write-Output "Archive SHA-256 vérifiée ; binaires de test disponibles : $binaryDirectory"
