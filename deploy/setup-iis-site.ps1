#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Crée le site IIS qui sert le build de "Calcul des titres".

.DESCRIPTION
    A exécuter UNE SEULE FOIS, sur le serveur IIS, dans une console
    PowerShell "Exécuter en tant qu'administrateur". Ce script ne build rien
    et ne télécharge rien : il crée juste le pool d'applications IIS (en
    "No Managed Code", le site étant 100% statique) et le site, tous deux
    pointant vers -PhysicalPath.

    Clonez ensuite la branche `iis-dist` du dépôt directement dans ce
    dossier (voir le runbook de déploiement) : cette branche est publiée
    automatiquement par la GitHub Action .github/workflows/deploy-iis.yml
    à chaque push, avec le contenu buildé (dist/, web.config inclus). IIS
    sert alors directement ce clone ; une mise à jour se résume à un
    `git pull` (ou le bouton "Synchroniser les modifications" de VS Code)
    dans ce dossier, sans Node.js ni npm sur le serveur.

.PARAMETER SiteName
    Nom du site IIS (et de son pool d'applications). Par défaut "CalculDesTitres".

.PARAMETER PhysicalPath
    Dossier physique servi par IIS - ce sera aussi le dossier du clone git
    de la branche iis-dist. Par défaut "C:\inetpub\wwwroot\CalculDesTitres".

.PARAMETER Port
    Port du binding HTTP créé si le site n'existe pas encore. Par défaut 8090.

.EXAMPLE
    .\deploy\setup-iis-site.ps1

.EXAMPLE
    .\deploy\setup-iis-site.ps1 -SiteName "Titres" -PhysicalPath "D:\sites\titres" -Port 8081
#>
[CmdletBinding()]
param(
    [string]$SiteName = "CalculDesTitres",
    [string]$PhysicalPath = "C:\inetpub\wwwroot\CalculDesTitres",
    [int]$Port = 8090
)

$ErrorActionPreference = "Stop"
Import-Module WebAdministration -ErrorAction Stop

# --- Dossier physique (accueillera le clone git de la branche iis-dist) ---
if (-not (Test-Path $PhysicalPath)) {
    New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
}

# --- Pool d'applications : site 100% statique -> "No Managed Code" ---
if (-not (Test-Path "IIS:\AppPools\$SiteName")) {
    Write-Host "==> Création du pool d'applications '$SiteName'" -ForegroundColor Cyan
    New-WebAppPool -Name $SiteName | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$SiteName" -Name managedRuntimeVersion -Value ""
Set-ItemProperty "IIS:\AppPools\$SiteName" -Name startMode -Value "AlwaysRunning"

# --- Site IIS ---
if (-not (Test-Path "IIS:\Sites\$SiteName")) {
    Write-Host "==> Création du site IIS '$SiteName' sur le port $Port" -ForegroundColor Cyan
    New-Website -Name $SiteName -PhysicalPath $PhysicalPath -ApplicationPool $SiteName -Port $Port | Out-Null
} else {
    Write-Host "==> Site IIS '$SiteName' déjà présent, mise à jour du chemin et du pool" -ForegroundColor Cyan
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $PhysicalPath
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $SiteName
}

# --- Droits de lecture pour le pool applicatif ---
icacls $PhysicalPath /grant "IIS_IUSRS:(OI)(CI)RX" /T | Out-Null

Start-WebAppPool -Name $SiteName -ErrorAction SilentlyContinue
Start-Website -Name $SiteName -ErrorAction SilentlyContinue

Write-Host "==> Site prêt : http://localhost:$Port/" -ForegroundColor Green
Write-Host "==> Clonez maintenant la branche iis-dist dans '$PhysicalPath' (voir le runbook)." -ForegroundColor Green
