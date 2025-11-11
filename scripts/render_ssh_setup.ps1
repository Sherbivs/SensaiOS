#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Setup SSH keys for Render services
.DESCRIPTION
    Generates SSH keys, displays public key for Render Dashboard, and configures SSH
.PARAMETER KeyName
    Name for the SSH key (default: id_ed25519 - standard SSH key name)
.PARAMETER KeyType
    Type of SSH key (ed25519, ecdsa, rsa) - default: ed25519
.PARAMETER Force
    Overwrite existing key if it exists
.EXAMPLE
    .\render_ssh_setup.ps1
.EXAMPLE
    .\render_ssh_setup.ps1 -KeyName "render_production" -Force
#>

param(
    [string]$KeyName = "id_ed25519",
    [ValidateSet("ed25519", "ecdsa", "rsa")]
    [string]$KeyType = "ed25519",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "🔐 Render SSH Setup" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan
Write-Host ""

# Determine SSH directory
$sshDir = Join-Path $env:USERPROFILE ".ssh"
if (-not (Test-Path $sshDir)) {
    Write-Host "📁 Creating SSH directory: $sshDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
    
    # Set permissions (Windows ACL)
    $acl = Get-Acl $sshDir
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $env:USERNAME, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
    )
    $acl.AddAccessRule($rule)
    Set-Acl $sshDir $acl
}

# Key paths
$privateKeyPath = Join-Path $sshDir $KeyName
$publicKeyPath = "$privateKeyPath.pub"

# Check if key exists
if ((Test-Path $privateKeyPath) -and -not $Force) {
    Write-Host "⚠️  SSH key already exists: $privateKeyPath" -ForegroundColor Yellow
    Write-Host "   Use -Force to overwrite" -ForegroundColor Gray
    Write-Host ""
    
    if (Test-Path $publicKeyPath) {
        Write-Host "📋 Your existing public key:" -ForegroundColor Cyan
        Get-Content $publicKeyPath | Write-Host -ForegroundColor White
        Write-Host ""
        Write-Host "💡 Copy this key to Render Dashboard → Account Settings → SSH Public Keys" -ForegroundColor Yellow
        Write-Host "   https://dashboard.render.com/settings#ssh-public-keys" -ForegroundColor Gray
    }
    exit 0
}

Write-Host "🔑 Generating SSH key pair..." -ForegroundColor Cyan
Write-Host "   Type: $KeyType" -ForegroundColor Gray
Write-Host "   Location: $privateKeyPath" -ForegroundColor Gray
Write-Host "   Note: Using standard SSH key name for compatibility" -ForegroundColor Gray
Write-Host ""

# Generate key
try {
    $keygenArgs = @(
        "-t", $KeyType,
        "-f", $privateKeyPath,
        "-C", "render-$env:USERNAME@$env:COMPUTERNAME",
        "-N", '""'
    )
    
    if ($KeyType -eq "rsa") {
        # RSA keys should be 4096 bits minimum for security
        $keygenArgs = @(
            "-t", $KeyType,
            "-b", "4096",
            "-f", $privateKeyPath,
            "-C", "render-$env:USERNAME@$env:COMPUTERNAME",
            "-N", '""'
        )
    } elseif ($KeyType -eq "ecdsa") {
        # ECDSA keys should use 521 bits (maximum security)
        $keygenArgs = @(
            "-t", $KeyType,
            "-b", "521",
            "-f", $privateKeyPath,
            "-C", "render-$env:USERNAME@$env:COMPUTERNAME",
            "-N", '""'
        )
    }
    
    # Run ssh-keygen without passphrase for automation
    # For security, users can manually add passphrase later: ssh-keygen -p -f <keyfile>
    Write-Host "💡 Generating without passphrase for automation (add passphrase later with: ssh-keygen -p -f $privateKeyPath)" -ForegroundColor Gray
    $process = Start-Process -FilePath "ssh-keygen" -ArgumentList $keygenArgs -NoNewWindow -Wait -PassThru
    
    if ($process.ExitCode -ne 0) {
        throw "ssh-keygen failed with exit code $($process.ExitCode)"
    }
    
    Write-Host "✅ SSH key pair generated successfully!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Error generating SSH key:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Set private key permissions (Windows ACL - owner read/write only)
$acl = Get-Acl $privateKeyPath
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $env:USERNAME, "FullControl", "Allow"
)
$acl.AddAccessRule($rule)
Set-Acl $privateKeyPath $acl

Write-Host "🔒 Private key permissions set (owner only)" -ForegroundColor Green
Write-Host ""

# Display public key
if (Test-Path $publicKeyPath) {
    $publicKey = Get-Content $publicKeyPath -Raw
    
    Write-Host "📋 Your PUBLIC key (copy this to Render):" -ForegroundColor Cyan
    Write-Host "=" * 80 -ForegroundColor Gray
    Write-Host $publicKey -ForegroundColor White
    Write-Host "=" * 80 -ForegroundColor Gray
    Write-Host ""
    
    # Copy to clipboard if available
    try {
        Set-Clipboard -Value $publicKey
        Write-Host "✅ Public key copied to clipboard!" -ForegroundColor Green
        Write-Host ""
    } catch {
        Write-Host "⚠️  Could not copy to clipboard (clipboard not available)" -ForegroundColor Yellow
        Write-Host ""
    }
}

# Configure SSH config file
$sshConfigPath = Join-Path $sshDir "config"
$renderConfigExists = $false

if (Test-Path $sshConfigPath) {
    $content = Get-Content $sshConfigPath -Raw
    $renderConfigExists = $content -match "Host render-\*"
}

if (-not $renderConfigExists) {
    Write-Host "⚙️  Adding Render SSH configuration..." -ForegroundColor Cyan
    
    $configEntry = @"

# Render SSH Configuration (auto-generated by render_ssh_setup.ps1)
# Based on official Render documentation: https://render.com/docs/ssh
Host *.render.com
    IdentityFile $privateKeyPath
    StrictHostKeyChecking accept-new
    ServerAliveInterval 60
    ServerAliveCountMax 3

# Render region shortcuts
Host render-oregon
    HostName ssh.oregon.render.com

Host render-ohio
    HostName ssh.ohio.render.com

Host render-virginia
    HostName ssh.virginia.render.com

Host render-frankfurt
    HostName ssh.frankfurt.render.com

Host render-singapore
    HostName ssh.singapore.render.com

"@
    
    Add-Content -Path $sshConfigPath -Value $configEntry
    Write-Host "✅ SSH config updated: $sshConfigPath" -ForegroundColor Green
    Write-Host ""
}

# Add Render's public keys to known_hosts
$knownHostsPath = Join-Path $sshDir "known_hosts"
$renderKnownHosts = @"
# Render SSH public keys (auto-added by render_ssh_setup.ps1)
ssh.oregon.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFON8eay2FgHDBIVOLxWn/AWnsDJhCVvlY1igWEFoLD2
ssh.ohio.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINMjC1BfZQ3CYotN1/EqI48hvBpZ80zfgRdK8NpP58v1
ssh.virginia.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJ6uO0jKQX9IjefnLz+pxTgfPhsPBhNuvxmvCFrxqxAM
ssh.frankfurt.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILg6kMvQOQjMREehk1wvBKsfe1I3+acRuS8cVSdLjinK
ssh.singapore.render.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGVcVcsy7RXA60ZyHs/OMS5aQj4YQy7Qn2nJCXHz4zLA
"@

$needsKnownHosts = $true
if (Test-Path $knownHostsPath) {
    $content = Get-Content $knownHostsPath -Raw
    if ($content -match "ssh\.oregon\.render\.com") {
        $needsKnownHosts = $false
    }
}

if ($needsKnownHosts) {
    Write-Host "🔐 Adding Render's public keys to known_hosts..." -ForegroundColor Cyan
    Add-Content -Path $knownHostsPath -Value $renderKnownHosts
    Write-Host "✅ Known hosts updated" -ForegroundColor Green
    Write-Host ""
}

# Summary
Write-Host "🎉 Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Go to: https://dashboard.render.com/settings#ssh-public-keys" -ForegroundColor White
Write-Host "  2. Click '+ Add SSH Public Key'" -ForegroundColor White
Write-Host "  3. Paste the public key shown above" -ForegroundColor White
Write-Host "  4. Give it a name (e.g., 'Windows Workstation')" -ForegroundColor White
Write-Host "  5. Test connection: npm run render:ssh-connect" -ForegroundColor White
Write-Host ""
Write-Host "📚 Documentation:" -ForegroundColor Cyan
Write-Host "   docs/deployment/render-ssh-automation.md" -ForegroundColor Gray
Write-Host ""
