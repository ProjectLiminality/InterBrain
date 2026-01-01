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
# Note: Full Radicle P2P support on Windows is in development by the Radicle team.

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
$TOTAL_STEPS = 11

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

# Windows tracking issue number
$WINDOWS_TRACKING_ISSUE = 363

# Function to sanitize log (remove sensitive data)
function Get-SanitizedLog {
    $content = Get-Content -Path $LOG_FILE -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return "" }

    # Sanitize sensitive info
    $content = $content -replace [regex]::Escape($env:USERPROFILE), "~"
    $content = $content -replace [regex]::Escape($env:USERNAME), "<USER>"
    $content = $content -replace '(api[_-]?key|token|secret|password|passphrase)[:=]\s*\S+', '$1=<REDACTED>'
    return $content
}

# Function to report error to GitHub tracking issue
function Report-ToGitHub {
    if (-not (Test-Command "gh")) {
        Write-Warning "GitHub CLI not installed - cannot report automatically"
        Write-Info "Report manually at: https://github.com/ProjectLiminality/InterBrain/issues/$WINDOWS_TRACKING_ISSUE"
        return
    }

    # Check if authenticated
    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "GitHub CLI not authenticated - cannot report automatically"
        Write-Info "Authenticate with 'gh auth login' or report manually at:"
        Write-Info "https://github.com/ProjectLiminality/InterBrain/issues/$WINDOWS_TRACKING_ISSUE"
        return
    }

    Write-Info "Adding error report to Windows tracking issue (#$WINDOWS_TRACKING_ISSUE)..."

    $sanitizedLog = Get-SanitizedLog
    $commentBody = @"
## Installation Error Report

**Generated**: $(Get-Date)
**OS**: $([System.Environment]::OSVersion.VersionString)
**PowerShell**: $($PSVersionTable.PSVersion)

---

### Installation Log

``````
$sanitizedLog
``````

---

*Automatically reported by install script*
"@

    gh issue comment $WINDOWS_TRACKING_ISSUE --repo ProjectLiminality/InterBrain --body $commentBody

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Error report added to tracking issue!"
        Write-Info "Opening the issue in your browser..."
        Start-Process "https://github.com/ProjectLiminality/InterBrain/issues/$WINDOWS_TRACKING_ISSUE"
        Write-Info "Check the 'Known Solutions' section at the top of the issue."
    } else {
        Write-Error "Failed to add comment to tracking issue"
        Write-Info "Report manually at: https://github.com/ProjectLiminality/InterBrain/issues/$WINDOWS_TRACKING_ISSUE"
    }
}

# Error handler
function Handle-InstallError {
    param([string]$Step, [string]$ErrorMessage)

    Write-Host ""
    Write-Host ("=" * 50) -ForegroundColor Red
    Write-Error "Installation failed at: $Step"
    Write-Host ("=" * 50) -ForegroundColor Red
    Write-Host ""
    Write-Info "Installation log saved to: $LOG_FILE"
    Write-Host ""
    Write-Info "You can safely rerun this script - it won't destroy existing data"
    Write-Host ""

    if (-not $CI) {
        Write-Host "Would you like to report this issue?" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  1) Report to GitHub (adds to tracking issue + opens browser)"
        Write-Host "  2) Just show me the log location"
        Write-Host ""
        $choice = Read-Host "Choose [1/2]"

        switch ($choice) {
            "1" { Report-ToGitHub }
            default { Write-Info "Log: $LOG_FILE" }
        }
    }
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
# Step 1: GitHub CLI setup (enables error reporting)
# ============================================================
Write-Step -Step 1 -Message "GitHub CLI setup (enables error reporting)"

Write-Info "Setting up GitHub CLI first so errors can be automatically reported."
Write-Host ""

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

# Authenticate GitHub CLI (enables error reporting)
if (Test-Command "gh") {
    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "GitHub CLI already authenticated"
        try {
            $ghUser = gh api user -q .login 2>$null
            Write-Info "Logged in as: $ghUser"
        } catch { }
    } else {
        Write-Host ""
        Write-Info "GitHub authentication enables:"
        Write-Info "  - Automatic error reporting if installation fails"
        Write-Info "  - Collaborative DreamNode sharing"
        Write-Info "  - Version control and backups"
        Write-Host ""

        if ($CI) {
            Write-Info "CI mode: Skipping GitHub authentication"
        } else {
            $authChoice = Read-Host "Authenticate GitHub now? [Y/n]"
            if ($authChoice -eq "" -or $authChoice -match "^[Yy]") {
                gh auth login -h github.com -p https -w
                $authStatus = gh auth status 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "GitHub authenticated"
                    try {
                        $ghUser = gh api user -q .login 2>$null
                        Write-Info "Logged in as: $ghUser"
                    } catch { }
                } else {
                    Write-Warning "Authentication incomplete - you can complete it later with: gh auth login"
                }
            } else {
                Write-Info "Skipping - you can authenticate later with: gh auth login"
            }
        }
    }
}

Write-Success "Error reporting is now available for subsequent steps"
Write-Host ""

# ============================================================
# Step 2: Installing other prerequisites
# ============================================================
Write-Step -Step 2 -Message "Installing other prerequisites"

# Check for Git
if (-not (Test-Command "git")) {
    Write-Warning "Git not found. Installing..."
    if (-not (Install-WithWinget "Git.Git" "Git")) {
        if (-not (Install-WithChoco "git" "Git")) {
            Handle-InstallError -Step "Git installation" -ErrorMessage "Failed to install Git"
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
            Handle-InstallError -Step "Node.js installation" -ErrorMessage "Failed to install Node.js"
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

# ============================================================
# Step 2: Check for Obsidian
# ============================================================
Write-Step -Step 3 -Message "Checking for Obsidian"

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
Write-Step -Step 4 -Message "Setting up vault"

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
Write-Step -Step 5 -Message "Cloning InterBrain"

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
Write-Step -Step 6 -Message "Building plugin"

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
Write-Step -Step 7 -Message "Installing InterBrain theme"

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
Write-Step -Step 8 -Message "Installing Ollama for semantic search"

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

# Pull embedding model if Ollama is available (with timeout/skip option)
if (Test-Command "ollama") {
    $OllamaList = ollama list 2>$null
    if ($OllamaList -match "nomic-embed-text") {
        Write-Success "nomic-embed-text model already installed"
    } else {
        Write-Info "Downloading nomic-embed-text model..."
        Write-Info "This may take 1-2 minutes depending on your connection."
        Write-Host ""

        # Start download in background job
        $Job = Start-Job -ScriptBlock { ollama pull nomic-embed-text 2>$null }

        # Timeout after 2 minutes
        $Timeout = 120
        $Elapsed = 0

        while ($Job.State -eq "Running") {
            if ($Elapsed -ge $Timeout) {
                Write-Host ""
                Write-Warning "Download is taking longer than expected."
                Write-Host ""

                if (-not $CI) {
                    Write-Host "What would you like to do?"
                    Write-Host "  1) Keep waiting"
                    Write-Host "  2) Skip for now (you can download later in InterBrain settings)"
                    $OllamaChoice = Read-Host "Choose [1/2]"

                    if ($OllamaChoice -eq "2") {
                        Stop-Job -Job $Job
                        Remove-Job -Job $Job -Force
                        Write-Warning "Skipped Ollama model download"
                        Write-Info "You can download it later via InterBrain settings or run:"
                        Write-Info "  ollama pull nomic-embed-text"
                        break
                    } else {
                        # Reset timeout and continue waiting
                        $Elapsed = 0
                        Write-Info "Continuing to wait..."
                    }
                } else {
                    # CI mode, just keep waiting
                    $Elapsed = 0
                }
            }
            Start-Sleep -Seconds 1
            $Elapsed++
            # Show progress dots every 10 seconds
            if ($Elapsed % 10 -eq 0) {
                Write-Host "." -NoNewline
            }
        }

        # Clean up job
        if ($Job.State -eq "Completed") {
            Remove-Job -Job $Job
            Write-Host ""
            Write-Success "nomic-embed-text model installed"
        }
    }
}

# ============================================================
# Step 8: Link plugin to vault
# ============================================================
Write-Step -Step 9 -Message "Linking plugin to vault"

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
# Step 10: Python setup for transcription
# ============================================================
Write-Step -Step 10 -Message "Python setup for transcription"

Write-Info "Note: Full Radicle P2P support on Windows is in development by the Radicle team."
Write-Info "GitHub-based sharing is available now. P2P sharing will be enabled once Radicle has full Windows support."
Write-Host ""

# Check for compatible Python version (3.9-3.12 required by whisper dependencies)
# Python 3.13+ doesn't have pre-built wheels for scipy/numpy yet
$PythonCmd = $null
if (Get-Command "py" -ErrorAction SilentlyContinue) {
    # Use py launcher to find compatible version
    $pyVersions = @("3.12", "3.11", "3.10", "3.9")
    foreach ($ver in $pyVersions) {
        $testResult = py -$ver --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            $PythonCmd = "py -$ver"
            break
        }
    }
}

if (-not $PythonCmd) {
    # Fall back to checking specific python commands
    if (Get-Command "python3.12" -ErrorAction SilentlyContinue) { $PythonCmd = "python3.12" }
    elseif (Get-Command "python3.11" -ErrorAction SilentlyContinue) { $PythonCmd = "python3.11" }
    elseif (Get-Command "python3.10" -ErrorAction SilentlyContinue) { $PythonCmd = "python3.10" }
    elseif (Get-Command "python3.9" -ErrorAction SilentlyContinue) { $PythonCmd = "python3.9" }
}

if (-not $PythonCmd) {
    Write-Warning "Python 3.9-3.12 not found. Installing Python 3.11..."
    if (-not (Install-WithWinget "Python.Python.3.11" "Python 3.11")) {
        if (-not (Install-WithChoco "python311" "Python 3.11")) {
            Write-Warning "Could not auto-install Python 3.11."
            Write-Info "Please install Python 3.11 from https://python.org"
        } else {
            Refresh-Path
            Write-Success "Python 3.11 installed"
        }
    } else {
        Refresh-Path
        Write-Success "Python 3.11 installed"
    }
    $PythonCmd = "py -3.11"
} else {
    Write-Success "Python found (compatible version)"
}

# Set up transcription environment
$TranscriptionDir = Join-Path $InterBrainPath "src\features\realtime-transcription\scripts"
if (Test-Path $TranscriptionDir) {
    $VenvPath = Join-Path $TranscriptionDir "venv"
    if (-not (Test-Path $VenvPath)) {
        Write-Info "Setting up Python transcription environment..."
        Set-Location $TranscriptionDir
        Invoke-Expression "$PythonCmd -m venv venv"
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
Write-Step -Step 11 -Message "Final verification"

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
