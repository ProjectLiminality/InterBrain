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

Write-Info "Installing Node.js dependencies..."
npm install --silent 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm install failed"
    exit 1
}

Write-Info "Building InterBrain plugin..."
npm run build 2>$null
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
# Step 10: Radicle setup (WSL required on Windows)
# ============================================================
Write-Step -Step 10 -Message "Radicle setup (requires WSL)"

Write-Warning "Radicle requires Linux/WSL on Windows."
Write-Info ""
Write-Info "For full P2P collaboration, you have two options:"
Write-Info ""
Write-Info "Option 1: Use WSL (recommended)"
Write-Info "  1. Install WSL: wsl --install"
Write-Info "  2. Open WSL terminal and run the Linux install script:"
Write-Info "     curl -sSf https://radicle.xyz/install | sh"
Write-Info ""
Write-Info "Option 2: Use GitHub-only mode"
Write-Info "  InterBrain will fall back to GitHub for collaboration."
Write-Info "  P2P features will be limited until Radicle is set up."
Write-Info ""

# Check if WSL is available
$WslStatus = wsl --status 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Success "WSL is available"
    Write-Info "To complete Radicle setup, open WSL and run:"
    Write-Info "  curl -sSf https://radicle.xyz/install | sh"
} else {
    Write-Warning "WSL not installed"
    Write-Info "Install WSL with: wsl --install"
    Write-Info "Then restart and run the Radicle installer in WSL."
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
Write-Host "4. Configure settings (Anthropic API key, etc.)"
Write-Host ""

if (-not (Test-Command "wsl")) {
    Write-Host "For full P2P features:" -ForegroundColor Yellow
    Write-Host "  1. Install WSL: wsl --install"
    Write-Host "  2. Restart computer"
    Write-Host "  3. Open WSL and install Radicle"
    Write-Host ""
}

Write-Host "Happy dreaming!" -ForegroundColor Magenta
Write-Host ""

# Open Obsidian with vault if not in CI mode
if (-not $CI -and $ObsidianInstalled) {
    Write-Info "Opening Obsidian with your vault..."
    Start-Process "obsidian://open?vault=$VaultName"
}
