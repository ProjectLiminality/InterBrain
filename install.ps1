# InterBrain Installation Script for Windows
# PowerShell 5.1+ required
#
# One-command setup (interactive):
#   irm https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.ps1 | iex
#
# With specific branch (for testing):
#   $env:INTERBRAIN_BRANCH = "feature/test"; irm https://raw.githubusercontent.com/ProjectLiminality/InterBrain/main/install.ps1 | iex
#
# CI mode (non-interactive):
#   .\install.ps1 -CI
#
# Note: Radicle requires WSL on Windows. This script will set up WSL if needed.

param(
    [switch]$CI,
    [string]$Branch = "main",
    [string]$Uri = "",
    [string]$DreamerUuid = ""
)

# Use environment variable for branch if set (allows piped execution with branch)
if ($env:INTERBRAIN_BRANCH) {
    $Branch = $env:INTERBRAIN_BRANCH
}

$ErrorActionPreference = "Stop"

# Total steps
$TOTAL_STEPS = 12

# Log file
$LOG_FILE = Join-Path $env:TEMP "interbrain-install-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

# Helper functions
function Write-Step {
    param([int]$Step, [string]$Message)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Cyan
    Write-Host "Step $Step/$TOTAL_STEPS`: $Message" -ForegroundColor Cyan
    Write-Host ("=" * 60) -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
    Add-Content -Path $LOG_FILE -Value "[OK] $Message"
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[!] $Message" -ForegroundColor Yellow
    Add-Content -Path $LOG_FILE -Value "[!] $Message"
}

function Write-Error {
    param([string]$Message)
    Write-Host "[X] $Message" -ForegroundColor Red
    Add-Content -Path $LOG_FILE -Value "[X] $Message"
}

function Write-Info {
    param([string]$Message)
    Write-Host "[i] $Message" -ForegroundColor Blue
    Add-Content -Path $LOG_FILE -Value "[i] $Message"
}

function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Install-WithWinget {
    param([string]$PackageId, [string]$Name)

    if (Test-Command "winget") {
        Write-Info "Installing $Name via winget..."
        winget install --id $PackageId --accept-source-agreements --accept-package-agreements -e
        return $true
    }
    return $false
}

function Install-WithChoco {
    param([string]$PackageName, [string]$Name)

    if (Test-Command "choco") {
        Write-Info "Installing $Name via Chocolatey..."
        choco install $PackageName -y
        return $true
    }
    return $false
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
}

# Start logging
Add-Content -Path $LOG_FILE -Value "=== InterBrain Windows Installation Log ==="
Add-Content -Path $LOG_FILE -Value "Date: $(Get-Date)"
Add-Content -Path $LOG_FILE -Value "OS: $([System.Environment]::OSVersion.VersionString)"
Add-Content -Path $LOG_FILE -Value "PowerShell: $($PSVersionTable.PSVersion)"
Add-Content -Path $LOG_FILE -Value "CI Mode: $CI"
Add-Content -Path $LOG_FILE -Value "============================================"

Write-Host ""
Write-Host "InterBrain Installation Script for Windows" -ForegroundColor Magenta
Write-Host ("=" * 45) -ForegroundColor Magenta
Write-Host ""

if ($CI) {
    Write-Info "Running in CI mode - non-interactive with defaults"
    $VaultParent = $env:TEMP
    $VaultName = "interbrain-ci-test-$PID"
} else {
    $VaultParent = $env:USERPROFILE
    $VaultName = "DreamVault"
}

# ============================================================
# Step 1: Check prerequisites
# ============================================================
Write-Step -Step 1 -Message "Checking prerequisites"

# Check for winget or chocolatey
$HasWinget = Test-Command "winget"
$HasChoco = Test-Command "choco"

if (-not $HasWinget -and -not $HasChoco) {
    Write-Warning "Neither winget nor Chocolatey found."
    Write-Info "Attempting to use winget (built into Windows 10/11)..."

    # Check Windows version
    $WinVersion = [System.Environment]::OSVersion.Version
    if ($WinVersion.Major -lt 10) {
        Write-Error "Windows 10 or later required for winget."
        Write-Info "Please install Chocolatey manually: https://chocolatey.org/install"
        exit 1
    }

    # winget should be available on Windows 10 1709+
    Write-Info "If winget is not working, install App Installer from Microsoft Store"
}

# Check for Git
if (-not (Test-Command "git")) {
    Write-Warning "Git not found. Installing..."
    if (-not (Install-WithWinget "Git.Git" "Git")) {
        if (-not (Install-WithChoco "git" "Git")) {
            Write-Error "Failed to install Git. Please install manually from https://git-scm.com"
            exit 1
        }
    }
    Refresh-Path
    Write-Success "Git installed"
} else {
    Write-Success "Git found ($(git --version))"
}

# Check for Node.js
if (-not (Test-Command "node")) {
    Write-Warning "Node.js not found. Installing..."
    if (-not (Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js")) {
        if (-not (Install-WithChoco "nodejs-lts" "Node.js")) {
            Write-Error "Failed to install Node.js. Please install manually from https://nodejs.org"
            exit 1
        }
    }
    Refresh-Path

    # After fresh install, verify node is accessible
    if (-not (Test-Command "node")) {
        Write-Warning "Node.js installed but not in PATH yet."
        Write-Info "Please close this PowerShell window and open a new one, then run the installer again."
        Write-Info "This is needed for Windows to recognize the newly installed Node.js."
        exit 0
    }
    Write-Success "Node.js installed"
} else {
    Write-Success "Node.js found ($(node --version))"
}

# Check for GitHub CLI
if (-not (Test-Command "gh")) {
    Write-Warning "GitHub CLI not found. Installing..."
    if (-not (Install-WithWinget "GitHub.cli" "GitHub CLI")) {
        if (-not (Install-WithChoco "gh" "GitHub CLI")) {
            Write-Error "Failed to install GitHub CLI. Please install manually from https://cli.github.com"
            exit 1
        }
    }
    Refresh-Path
    Write-Success "GitHub CLI installed"
} else {
    Write-Success "GitHub CLI found ($(gh --version | Select-Object -First 1))"
}

# ============================================================
# Step 2: Check for Obsidian
# ============================================================
Write-Step -Step 2 -Message "Checking for Obsidian"

$ObsidianPath = Join-Path $env:LOCALAPPDATA "Obsidian\Obsidian.exe"
if (Test-Path $ObsidianPath) {
    Write-Success "Obsidian found"
    $ObsidianInstalled = $true
} else {
    Write-Warning "Obsidian not found. Installing..."
    if (-not (Install-WithWinget "Obsidian.Obsidian" "Obsidian")) {
        if (-not (Install-WithChoco "obsidian" "Obsidian")) {
            Write-Warning "Could not auto-install Obsidian. Please install from https://obsidian.md"
            $ObsidianInstalled = $false
        } else {
            $ObsidianInstalled = $true
        }
    } else {
        $ObsidianInstalled = $true
    }
    if ($ObsidianInstalled) {
        Write-Success "Obsidian installed"
    }
}

# ============================================================
# Step 3: Set up vault
# ============================================================
Write-Step -Step 3 -Message "Setting up vault"

if (-not $CI) {
    Write-Info "InterBrain works best in a dedicated vault (not mixed with regular notes)"
    $UserVaultName = Read-Host "Vault name (press Enter for default '$VaultName')"
    if ($UserVaultName) {
        $VaultName = $UserVaultName
    }
}

$VaultPath = Join-Path $VaultParent $VaultName

if (Test-Path $VaultPath) {
    $InterBrainPluginPath = Join-Path $VaultPath ".obsidian\plugins\interbrain"
    if (Test-Path $InterBrainPluginPath) {
        Write-Success "Found existing InterBrain vault: $VaultPath"
        Write-Info "Re-running setup to ensure everything is up to date..."
    } else {
        Write-Warning "Vault '$VaultName' exists but is not an InterBrain vault"
        if (-not $CI) {
            $Confirm = Read-Host "Continue anyway? [y/N]"
            if ($Confirm -ne "y" -and $Confirm -ne "Y") {
                Write-Info "Installation cancelled. Please rerun with a different vault name."
                exit 0
            }
        } else {
            Write-Error "Cannot proceed in CI mode with existing non-InterBrain vault"
            exit 1
        }
    }
} else {
    New-Item -ItemType Directory -Path $VaultPath -Force | Out-Null
    Write-Success "Created new InterBrain vault: $VaultPath"
}

# Create .obsidian directory structure
$ObsidianDir = Join-Path $VaultPath ".obsidian\plugins"
New-Item -ItemType Directory -Path $ObsidianDir -Force | Out-Null

# ============================================================
# Step 4: Clone InterBrain
# ============================================================
Write-Step -Step 4 -Message "Cloning InterBrain"

$InterBrainPath = Join-Path $VaultPath "InterBrain"

if (Test-Path $InterBrainPath) {
    if (Test-Path (Join-Path $InterBrainPath ".git")) {
        Set-Location $InterBrainPath
        $RepoUrl = git config --get remote.origin.url 2>$null
        if ($RepoUrl -match "ProjectLiminality/InterBrain") {
            Write-Warning "InterBrain already exists. Updating..."
            git fetch origin $Branch
            git checkout $Branch
            git pull origin $Branch
        } else {
            Write-Error "Directory exists but is a different repository."
            Write-Info "Please rename or move: $InterBrainPath"
            exit 1
        }
    } else {
        Write-Error "Directory exists but is not a git repository."
        Write-Info "Please rename or move: $InterBrainPath"
        exit 1
    }
} else {
    Write-Info "Cloning from GitHub (branch: $Branch)..."
    Set-Location $VaultPath
    git clone --branch $Branch https://github.com/ProjectLiminality/InterBrain.git
    Set-Location $InterBrainPath
}

Write-Success "InterBrain code ready at: $InterBrainPath"

# ============================================================
# Step 5: Build plugin
# ============================================================
Write-Step -Step 5 -Message "Building plugin"

Set-Location $InterBrainPath

# Determine how to run npm (direct command vs node path)
$NpmCommand = $null
if (Test-Command "npm") {
    $NpmCommand = "npm"
} else {
    # npm not in PATH - try to find it via node installation
    $NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
    if ($NodePath) {
        $NodeDir = Split-Path $NodePath -Parent
        $NpmCliPath = Join-Path $NodeDir "node_modules\npm\bin\npm-cli.js"
        if (Test-Path $NpmCliPath) {
            $NpmCommand = "node `"$NpmCliPath`""
            Write-Info "Using npm via node directly (npm not in PATH)"
        }
    }
}

if (-not $NpmCommand) {
    Write-Error "npm not found. Please close this PowerShell window, open a new one, and run the installer again."
    Write-Info "If the problem persists, reinstall Node.js from https://nodejs.org"
    exit 1
}

Write-Info "Installing Node.js dependencies..."
Invoke-Expression "$NpmCommand install --silent 2>`$null"
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install failed"
    exit 1
}

Write-Info "Building InterBrain plugin..."
Invoke-Expression "$NpmCommand run build 2>`$null"
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm run build failed"
    exit 1
}

Write-Success "Plugin built successfully"

# ============================================================
# Step 6: Install theme
# ============================================================
Write-Step -Step 6 -Message "Installing InterBrain theme"

$SnippetsDir = Join-Path $VaultPath ".obsidian\snippets"
New-Item -ItemType Directory -Path $SnippetsDir -Force | Out-Null

$ThemeSource = Join-Path $InterBrainPath "theme\interbrain.css"
if (Test-Path $ThemeSource) {
    Copy-Item $ThemeSource -Destination $SnippetsDir -Force
    Write-Success "InterBrain theme installed"
} else {
    Write-Warning "Theme file not found, skipping theme installation"
}

# Create appearance.json
$AppearanceJson = @{
    accentColor = "#00A2FF"
    theme = "obsidian"
    baseFontSize = 16
    enabledCssSnippets = @("interbrain")
} | ConvertTo-Json

Set-Content -Path (Join-Path $VaultPath ".obsidian\appearance.json") -Value $AppearanceJson
Write-Success "Theme configuration created"

# ============================================================
# Step 7: Install Ollama
# ============================================================
Write-Step -Step 7 -Message "Installing Ollama for semantic search"

if (-not (Test-Command "ollama")) {
    Write-Info "Installing Ollama..."
    if (-not (Install-WithWinget "Ollama.Ollama" "Ollama")) {
        Write-Warning "Could not auto-install Ollama."
        Write-Info "Please install manually from https://ollama.ai"
    } else {
        Refresh-Path
        Write-Success "Ollama installed"
    }
} else {
    Write-Success "Ollama found"
}

# Pull embedding model if Ollama is available
if (Test-Command "ollama") {
    $OllamaList = ollama list 2>$null
    if ($OllamaList -match "nomic-embed-text") {
        Write-Success "nomic-embed-text model already installed"
    } else {
        Write-Info "Downloading nomic-embed-text model (this may take 1-2 minutes)..."
        ollama pull nomic-embed-text 2>$null
        Write-Success "nomic-embed-text model installed"
    }
}

# ============================================================
# Step 8: Link plugin to vault
# ============================================================
Write-Step -Step 8 -Message "Linking plugin to vault"

$PluginsDir = Join-Path $VaultPath ".obsidian\plugins"
New-Item -ItemType Directory -Path $PluginsDir -Force | Out-Null

$SymlinkPath = Join-Path $PluginsDir "InterBrain"

# Remove existing symlink or directory
if (Test-Path $SymlinkPath) {
    Remove-Item $SymlinkPath -Force -Recurse
    Write-Warning "Removed old plugin link"
}

# Create junction (Windows equivalent of symlink, works without admin)
cmd /c mklink /J "$SymlinkPath" "$InterBrainPath" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Success "Plugin linked to vault"
} else {
    # Fallback: try with admin symlink
    Write-Warning "Junction failed, trying symlink (may require admin)..."
    New-Item -ItemType SymbolicLink -Path $SymlinkPath -Target $InterBrainPath -Force
    Write-Success "Plugin symlinked to vault"
}

# Create community-plugins.json
Set-Content -Path (Join-Path $VaultPath ".obsidian\community-plugins.json") -Value '["interbrain"]'

# ============================================================
# Step 9: GitHub authentication
# ============================================================
Write-Step -Step 9 -Message "GitHub authentication"

$GhAuthStatus = gh auth status 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "GitHub CLI already authenticated"
    $GhUser = gh api user -q .login 2>$null
    Write-Info "Logged in as: $GhUser"
} else {
    Write-Warning "GitHub CLI not authenticated"
    if (-not $CI) {
        Write-Info "InterBrain uses GitHub for collaborative DreamNode sharing."
        $AuthChoice = Read-Host "Authenticate now? [Y/n]"
        if ($AuthChoice -ne "n" -and $AuthChoice -ne "N") {
            gh auth login -h github.com -p https -w
            if ($LASTEXITCODE -eq 0) {
                Write-Success "GitHub authenticated"
            } else {
                Write-Warning "Authentication incomplete. Run 'gh auth login' later."
            }
        } else {
            Write-Info "Skipping. Run 'gh auth login' later."
        }
    } else {
        Write-Info "CI mode: Skipping GitHub authentication"
    }
}

# ============================================================
# Step 10: Radicle setup (WSL + Radicle installation)
# ============================================================
Write-Step -Step 10 -Message "Radicle P2P setup (WSL + Radicle)"

# Track if we need a reboot for WSL
$NeedsReboot = $false
$RadicleReady = $false

# Check if WSL is installed and has a distribution
function Test-WslReady {
    try {
        $distros = wsl -l -q 2>$null
        if ($LASTEXITCODE -eq 0 -and $distros) {
            return $true
        }
    } catch {}
    return $false
}

# Check if Radicle is installed in WSL
function Test-RadicleInWsl {
    try {
        $result = wsl bash -c "command -v rad" 2>$null
        return ($LASTEXITCODE -eq 0 -and $result)
    } catch {}
    return $false
}

# Check if Radicle identity exists in WSL
function Test-RadicleIdentity {
    try {
        $result = wsl bash -c "rad self 2>/dev/null" 2>$null
        return ($LASTEXITCODE -eq 0)
    } catch {}
    return $false
}

if (Test-WslReady) {
    Write-Success "WSL is installed with a Linux distribution"

    # Check if Radicle is already installed
    if (Test-RadicleInWsl) {
        Write-Success "Radicle is installed in WSL"

        if (Test-RadicleIdentity) {
            Write-Success "Radicle identity exists"
            $RadicleReady = $true
        } else {
            Write-Warning "Radicle installed but no identity created"
            if (-not $CI) {
                Write-Info "Creating Radicle identity..."
                Write-Info "You'll be prompted to set a passphrase for your Radicle key."
                wsl bash -c "rad auth"
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Radicle identity created"
                    $RadicleReady = $true
                } else {
                    Write-Warning "Failed to create identity. Run 'wsl rad auth' later."
                }
            } else {
                Write-Info "CI mode: Skipping Radicle identity creation"
            }
        }
    } else {
        Write-Info "Installing Radicle in WSL..."

        # Install Radicle using the official installer
        $RadicleInstallScript = @'
#!/bin/bash
set -e

# Install Radicle via official installer
curl -sSf https://radicle.xyz/install | sh

# Add to PATH for current session
export PATH="$HOME/.radicle/bin:$PATH"

# Add to .bashrc for future sessions
if ! grep -q 'radicle/bin' ~/.bashrc 2>/dev/null; then
    echo 'export PATH="$HOME/.radicle/bin:$PATH"' >> ~/.bashrc
fi

# Verify installation
rad --version
'@

        $RadicleInstallScript | wsl bash

        if ($LASTEXITCODE -eq 0) {
            Write-Success "Radicle installed in WSL"

            # Create identity if not in CI mode
            if (-not $CI) {
                Write-Info "Creating Radicle identity..."
                wsl bash -c 'export PATH="$HOME/.radicle/bin:$PATH" && rad auth'
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Radicle identity created"
                    $RadicleReady = $true
                }
            }
        } else {
            Write-Warning "Radicle installation failed. You can install manually later:"
            Write-Info "  wsl bash -c 'curl -sSf https://radicle.xyz/install | sh'"
        }
    }
} else {
    # WSL not installed - need to install it
    Write-Warning "WSL not installed. Installing WSL with Ubuntu..."

    if ($CI) {
        Write-Info "CI mode: Skipping WSL installation (requires reboot)"
        Write-Info "In production, WSL would be installed here."
    } else {
        # Check if we're running as admin (required for WSL install)
        $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

        if (-not $isAdmin) {
            Write-Warning "WSL installation requires administrator privileges."
            Write-Info "Please run this script as Administrator, or install WSL manually:"
            Write-Info "  1. Open PowerShell as Administrator"
            Write-Info "  2. Run: wsl --install"
            Write-Info "  3. Restart your computer"
            Write-Info "  4. Run this installer again"
        } else {
            Write-Info "Installing WSL (this may take a few minutes)..."
            wsl --install --no-launch -d Ubuntu

            if ($LASTEXITCODE -eq 0) {
                Write-Success "WSL installed successfully"
                $NeedsReboot = $true
                Write-Warning "A system restart is required to complete WSL setup."
                Write-Info "After restarting, run this installer again to complete Radicle setup."
            } else {
                Write-Error "WSL installation failed"
                Write-Info "Try installing manually: wsl --install"
            }
        }
    }
}

# Configure WSL networking for Radicle communication
if (Test-WslReady -and -not $NeedsReboot) {
    Write-Info "Configuring WSL networking for Radicle..."

    # Check Windows version for mirrored networking support
    $WinVersion = [System.Environment]::OSVersion.Version
    $WslConfigPath = Join-Path $env:USERPROFILE ".wslconfig"

    # Windows 11 22H2+ supports mirrored networking (build 22621+)
    if ($WinVersion.Build -ge 22621) {
        Write-Info "Windows 11 22H2+ detected - enabling mirrored networking"

        # Create or update .wslconfig for mirrored networking
        $WslConfig = @"
[wsl2]
networkingMode=mirrored
"@

        if (Test-Path $WslConfigPath) {
            $existingConfig = Get-Content $WslConfigPath -Raw
            if ($existingConfig -notmatch "networkingMode=mirrored") {
                # Append mirrored networking if not present
                if ($existingConfig -match "\[wsl2\]") {
                    $existingConfig = $existingConfig -replace "(\[wsl2\])", "`$1`nnetworkingMode=mirrored"
                } else {
                    $existingConfig += "`n$WslConfig"
                }
                Set-Content -Path $WslConfigPath -Value $existingConfig
                Write-Success "Updated .wslconfig with mirrored networking"
                Write-Info "Run 'wsl --shutdown' and restart WSL for changes to take effect"
            } else {
                Write-Success "Mirrored networking already configured"
            }
        } else {
            Set-Content -Path $WslConfigPath -Value $WslConfig
            Write-Success "Created .wslconfig with mirrored networking"
        }
    } else {
        Write-Info "Windows 10 or older Windows 11 detected - using port forwarding"
        Write-Info "Radicle ports will be forwarded from WSL to Windows"

        # Create a startup script for port forwarding
        $PortForwardScript = @'
# Radicle WSL Port Forwarding Script
# This script forwards Radicle ports from WSL to Windows
# Run this after each Windows restart if using Windows 10

$wslIp = (wsl hostname -I).Trim().Split()[0]
if ($wslIp) {
    # Remove existing rules
    netsh interface portproxy reset | Out-Null

    # Forward Radicle P2P port (8776) and HTTP API port (8777)
    netsh interface portproxy add v4tov4 listenport=8776 listenaddress=0.0.0.0 connectport=8776 connectaddress=$wslIp
    netsh interface portproxy add v4tov4 listenport=8777 listenaddress=0.0.0.0 connectport=8777 connectaddress=$wslIp

    Write-Host "Radicle ports forwarded to WSL ($wslIp)"
} else {
    Write-Host "Could not get WSL IP address. Is WSL running?"
}
'@

        $ScriptsDir = Join-Path $env:USERPROFILE ".interbrain"
        New-Item -ItemType Directory -Path $ScriptsDir -Force | Out-Null
        $PortForwardScriptPath = Join-Path $ScriptsDir "forward-radicle-ports.ps1"
        Set-Content -Path $PortForwardScriptPath -Value $PortForwardScript

        Write-Success "Created port forwarding script: $PortForwardScriptPath"
        Write-Info "Run this script after each Windows restart for Radicle connectivity"
    }
}

# Create Windows wrapper for rad command
if (Test-WslReady -and (Test-RadicleInWsl)) {
    Write-Info "Creating Windows 'rad' command wrapper..."

    $RadWrapper = @'
@echo off
REM Wrapper to run Radicle commands in WSL from Windows
wsl bash -c "export PATH=\"\$HOME/.radicle/bin:\$PATH\" && rad %*"
'@

    # Create wrapper in a directory that's in PATH
    $WrapperDir = Join-Path $env:USERPROFILE ".interbrain\bin"
    New-Item -ItemType Directory -Path $WrapperDir -Force | Out-Null
    $WrapperPath = Join-Path $WrapperDir "rad.cmd"
    Set-Content -Path $WrapperPath -Value $RadWrapper

    # Add to user PATH if not already there
    $UserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    if ($UserPath -notlike "*$WrapperDir*") {
        [System.Environment]::SetEnvironmentVariable("Path", "$UserPath;$WrapperDir", "User")
        $env:Path = "$env:Path;$WrapperDir"
        Write-Success "Added rad wrapper to PATH"
    }

    Write-Success "Created Windows 'rad' command wrapper"
    Write-Info "You can now run 'rad' commands directly from PowerShell/CMD"
}

# Summary
if ($RadicleReady) {
    Write-Success "Radicle P2P is fully configured!"
    $radSelf = wsl bash -c 'export PATH="$HOME/.radicle/bin:$PATH" && rad self 2>/dev/null | head -3'
    Write-Info "Your Radicle identity:"
    Write-Host $radSelf
} elseif ($NeedsReboot) {
    Write-Warning "Restart required to complete Radicle setup"
    Write-Info "After restart, run this installer again"
} else {
    Write-Warning "Radicle setup incomplete"
    Write-Info "Run 'wsl rad auth' to create your Radicle identity"
}

# ============================================================
# Step 11: Python setup for transcription
# ============================================================
Write-Step -Step 11 -Message "Python setup for transcription"

if (-not (Test-Command "python")) {
    Write-Warning "Python not found. Installing..."
    if (-not (Install-WithWinget "Python.Python.3.11" "Python")) {
        if (-not (Install-WithChoco "python" "Python")) {
            Write-Warning "Could not auto-install Python."
            Write-Info "Please install from https://python.org"
        } else {
            Refresh-Path
            Write-Success "Python installed"
        }
    } else {
        Refresh-Path
        Write-Success "Python installed"
    }
} else {
    Write-Success "Python found ($(python --version))"
}

# Set up transcription environment
$TranscriptionDir = Join-Path $InterBrainPath "src\features\realtime-transcription\scripts"
if (Test-Path $TranscriptionDir) {
    $VenvPath = Join-Path $TranscriptionDir "venv"
    if (-not (Test-Path $VenvPath)) {
        Write-Info "Setting up Python transcription environment..."
        Set-Location $TranscriptionDir
        python -m venv venv
        & "$VenvPath\Scripts\Activate.ps1"
        pip install --upgrade pip --quiet 2>$null
        pip install -r requirements.txt --quiet 2>$null
        deactivate
        Write-Success "Transcription environment ready"
    } else {
        Write-Success "Transcription environment already exists"
    }
} else {
    Write-Warning "Transcription directory not found"
}

# ============================================================
# Step 12: Final verification and summary
# ============================================================
Write-Step -Step 12 -Message "Final verification"

$AllGood = $true

# Check plugin build
if (Test-Path (Join-Path $InterBrainPath "main.js")) {
    Write-Success "Plugin built (main.js exists)"
} else {
    Write-Error "Plugin not built (main.js missing)"
    $AllGood = $false
}

# Check plugin link
if (Test-Path $SymlinkPath) {
    Write-Success "Plugin linked to vault"
} else {
    Write-Error "Plugin link missing"
    $AllGood = $false
}

# Check Obsidian
if ($ObsidianInstalled) {
    Write-Success "Obsidian installed"
} else {
    Write-Warning "Obsidian not installed"
}

# Check Ollama
if (Test-Command "ollama") {
    Write-Success "Ollama available"
} else {
    Write-Warning "Ollama not available"
}

# Check WSL
if (Test-WslReady) {
    Write-Success "WSL installed"
} else {
    Write-Warning "WSL not installed (required for P2P)"
}

# Check Radicle in WSL
if (Test-WslReady) {
    if (Test-RadicleInWsl) {
        Write-Success "Radicle installed in WSL"
        if (Test-RadicleIdentity) {
            Write-Success "Radicle identity configured"
        } else {
            Write-Warning "Radicle identity not configured (run: wsl rad auth)"
        }
    } else {
        Write-Warning "Radicle not installed in WSL"
    }
}

Write-Host ""
Write-Host ("=" * 60) -ForegroundColor Green
if ($AllGood) {
    Write-Host "Installation complete!" -ForegroundColor Green
} else {
    Write-Host "Installation complete with some optional steps remaining" -ForegroundColor Yellow
}
Write-Host ("=" * 60) -ForegroundColor Green
Write-Host ""

Write-Host "Installation log saved to: $LOG_FILE"
Write-Host ""

Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open Obsidian and select vault: $VaultPath"
Write-Host "2. Click 'Trust author and enable plugins' when prompted"
Write-Host "3. Look for the InterBrain icon in the left ribbon"
Write-Host "4. Configure settings (Anthropic API key, Radicle passphrase)"
Write-Host ""

if ($NeedsReboot) {
    Write-Host "IMPORTANT: Restart required!" -ForegroundColor Yellow
    Write-Host "  1. Restart your computer to complete WSL setup"
    Write-Host "  2. Run this installer again to install Radicle"
    Write-Host ""
} elseif (-not (Test-WslReady)) {
    Write-Host "For full P2P features:" -ForegroundColor Yellow
    Write-Host "  1. Run this script as Administrator to install WSL"
    Write-Host "  2. Or manually: wsl --install"
    Write-Host "  3. Restart and run this installer again"
    Write-Host ""
} elseif (-not $RadicleReady) {
    Write-Host "To complete P2P setup:" -ForegroundColor Yellow
    Write-Host "  Run: wsl rad auth"
    Write-Host ""
}

Write-Host "Happy dreaming!" -ForegroundColor Magenta
Write-Host ""

# Open Obsidian with vault if not in CI mode
if (-not $CI -and $ObsidianInstalled) {
    Write-Info "Opening Obsidian with your vault..."
    Start-Process "obsidian://open?vault=$VaultName"
}
