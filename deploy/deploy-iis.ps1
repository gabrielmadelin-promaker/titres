#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Build l'application "Calcul des titres" et la publie sur IIS.

.DESCRIPTION
    - Lance `npm ci` + `npm run build` (sauf si -SkipBuild).
    - Crée si besoin un pool d'applications IIS en "No Managed Code"
      (l'appli est un site 100% statique, pas de code géré côté serveur).
    - Crée si besoin un site IIS pointant vers le dossier de publication.
    - Recopie le contenu de dist/ (dont web.config) vers ce dossier.

    A exécuter dans une console PowerShell "Exécuter en tant qu'administrateur",
    sur le serveur IIS (ou via une session à distance / un partage vers celui-ci).
    Nécessite le module WebAdministration, fourni par la fonctionnalité Windows
    "Outils de gestion IIS -> Scripts et outils de gestion IIS".

.PARAMETER SiteName
    Nom du site IIS (et de son pool d'applications). Par défaut "CalculDesTitres".

.PARAMETER PhysicalPath
    Dossier physique servi par IIS. Par défaut "C:\inetpub\wwwroot\CalculDesTitres".

.PARAMETER Port
    Port du binding HTTP créé si le site n'existe pas encore. Par défaut 8090.

.PARAMETER SkipBuild
    Ne relance pas `npm ci` / `npm run build` : réutilise le dossier dist/ existant.

.EXAMPLE
    .\deploy\deploy-iis.ps1

.EXAMPLE
    .\deploy\deploy-iis.ps1 -SiteName "Titres" -PhysicalPath "D:\sites\titres" -Port 8081
#>
[CmdletBinding()]
param(
    [string]$SiteName = "CalculDesTitres",
    [string]$PhysicalPath = "C:\inetpub\wwwroot\CalculDesTitres",
    [int]$Port = 8090,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$distPath = Join-Path $repoRoot "dist"

if (-not $SkipBuild) {
    Push-Location $repoRoot
    try {
        Write-Host "==> npm ci" -ForegroundColor Cyan
        npm ci
        if ($LASTEXITCODE -ne 0) { throw "npm ci a échoué (code $LASTEXITCODE)" }

        Write-Host "==> npm run build" -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build a échoué (code $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $distPath)) {
    throw "Dossier '$distPath' introuvable. Lancez 'npm run build' ou retirez -SkipBuild."
}

Import-Module WebAdministration -ErrorAction Stop

# --- Pool d'applications : site 100% statique -> "No Managed Code" ---
if (-not (Test-Path "IIS:\AppPools\$SiteName")) {
    Write-Host "==> Création du pool d'applications '$SiteName'" -ForegroundColor Cyan
    New-WebAppPool -Name $SiteName | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$SiteName" -Name managedRuntimeVersion -Value ""
Set-ItemProperty "IIS:\AppPools\$SiteName" -Name startMode -Value "AlwaysRunning"

# --- Dossier physique ---
if (-not (Test-Path $PhysicalPath)) {
    New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
}

# --- Site IIS ---
if (-not (Test-Path "IIS:\Sites\$SiteName")) {
    Write-Host "==> Création du site IIS '$SiteName' sur le port $Port" -ForegroundColor Cyan
    New-Website -Name $SiteName -PhysicalPath $PhysicalPath -ApplicationPool $SiteName -Port $Port | Out-Null
} else {
    Write-Host "==> Site IIS '$SiteName' déjà présent, mise à jour du chemin et du pool" -ForegroundColor Cyan
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $PhysicalPath
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $SiteName
}

# --- Publication : miroir de dist/ vers le dossier physique ---
Write-Host "==> Copie de dist/ vers $PhysicalPath" -ForegroundColor Cyan
robocopy $distPath $PhysicalPath /MIR /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "robocopy a échoué (code $LASTEXITCODE)"
}

# --- Droits de lecture pour le pool applicatif ---
icacls $PhysicalPath /grant "IIS_IUSRS:(OI)(CI)RX" /T | Out-Null

Start-WebAppPool -Name $SiteName -ErrorAction SilentlyContinue
Start-Website -Name $SiteName -ErrorAction SilentlyContinue

Write-Host "==> Déploiement terminé : http://localhost:$Port/" -ForegroundColor Green
