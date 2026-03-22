// CF Studio — In-App Setup Wizard (dependency checker + installer)

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;

// ── Types ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct DependencyStatus {
    pub npm_installed: bool,
    pub wrangler_installed: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SetupProgress {
    pub message: String,
    pub progress_percentage: u8,
}

#[derive(Debug, thiserror::Error)]
pub enum SetupError {
    #[error("Command failed: {0}")]
    Command(String),

    #[error("Missing prerequisite: {0}")]
    MissingPrerequisite(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Unsupported operating system")]
    UnsupportedOs,
}

impl Serialize for SetupError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Resolve the correct login shell for the current platform.
/// macOS defaults to zsh; Linux falls back to $SHELL or /bin/bash.
fn login_shell() -> (&'static str, &'static str) {
    if cfg!(target_os = "macos") {
        // macOS: use zsh with login flag to load ~/.zshrc / ~/.zprofile
        ("zsh", "-l")
    } else {
        // Linux: honour $SHELL, fall back to bash
        ("bash", "-l")
    }
}

/// Returns `true` when the given binary is reachable on PATH.
async fn is_available(bin: &str) -> bool {
    let cmd = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &format!("{bin} --version")])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
    } else {
        let (shell, login_flag) = login_shell();
        // Prepend the user-local npm-global bin dir so we can discover
        // binaries installed via our custom npm prefix without a shell restart.
        let probe = format!(
            "export PATH=\"$HOME/.npm-global/bin:$PATH\" && {bin} --version"
        );
        Command::new(shell)
            .args([login_flag, "-c", &probe])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .await
    };
    cmd.map(|s| s.success()).unwrap_or(false)
}

/// Emit a progress event to the frontend.
fn emit_progress(app: &AppHandle, message: &str, pct: u8) {
    let _ = app.emit(
        "setup-progress",
        SetupProgress {
            message: message.to_string(),
            progress_percentage: pct,
        },
    );
}

/// Run a shell command string through the platform login shell and return its
/// combined output, failing with a descriptive `SetupError::Command` on
/// non-zero exit.
async fn run_shell(command: &str) -> Result<String, SetupError> {
    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", command])
            .output()
            .await?
    } else {
        let (shell, login_flag) = login_shell();
        Command::new(shell)
            .args([login_flag, "-c", command])
            .output()
            .await?
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(SetupError::Command(format!(
            "`{command}` exited with {}: {}",
            output.status,
            if stderr.is_empty() { &stdout } else { &stderr }
        )))
    }
}

// ── Tauri Commands ─────────────────────────────────────────────────────────────

/// Check if `npm` and `wrangler` are available on the system PATH.
#[tauri::command]
pub async fn check_dependencies() -> Result<DependencyStatus, SetupError> {
    let (npm, wrangler) = tokio::join!(is_available("npm"), is_available("wrangler"));
    Ok(DependencyStatus {
        npm_installed: npm,
        wrangler_installed: wrangler,
    })
}

/// Install missing dependencies with real-time progress events.
///
/// Flow:
///   1. Check current state.
///   2. Install Node.js / npm if missing (platform-specific).
///   3. Install wrangler globally via npm.
///   4. Final verification.
#[tauri::command]
pub async fn install_dependencies(app: AppHandle) -> Result<(), SetupError> {
    // ── 1. Initial check ───────────────────────────────────────────────
    emit_progress(&app, "Checking current environment…", 5);

    let npm_ok = is_available("npm").await;
    let wrangler_ok = is_available("wrangler").await;

    if npm_ok && wrangler_ok {
        emit_progress(&app, "All dependencies already installed!", 100);
        return Ok(());
    }

    // ── 2. Install Node.js / npm ───────────────────────────────────────
    if !npm_ok {
        emit_progress(&app, "Installing Node.js…", 10);

        #[cfg(target_os = "macos")]
        {
            // Ensure Homebrew is available
            if !is_available("brew").await {
                emit_progress(
                    &app,
                    "Error: Homebrew is required to install Node.js on macOS. Install it from https://brew.sh",
                    0,
                );
                return Err(SetupError::MissingPrerequisite(
                    "Homebrew is not installed. Visit https://brew.sh to install it, then retry."
                        .into(),
                ));
            }

            emit_progress(&app, "Running brew install node…", 20);
            run_shell("brew install node").await?;
        }

        #[cfg(target_os = "windows")]
        {
            emit_progress(&app, "Running winget install Node.js…", 20);
            run_shell("winget install OpenJS.NodeJS --silent --accept-package-agreements --accept-source-agreements").await?;
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            emit_progress(&app, "Automatic Node.js installation is not supported on this OS.", 0);
            return Err(SetupError::UnsupportedOs);
        }

        // Verify npm is now available
        emit_progress(&app, "Verifying npm installation…", 50);
        if !is_available("npm").await {
            emit_progress(&app, "Error: npm is still not found after installing Node.js.", 0);
            return Err(SetupError::Command(
                "npm was not found after Node.js installation. You may need to restart the app."
                    .into(),
            ));
        }

        emit_progress(&app, "Node.js installed successfully!", 55);
    } else {
        emit_progress(&app, "Node.js is already installed.", 55);
    }

    // ── 3. Install wrangler (user-local prefix, no sudo required) ──────
    if !wrangler_ok {
        emit_progress(&app, "Configuring npm for user-local installs…", 60);

        // Combined command: create a user-local global directory, point npm
        // at it, extend PATH for this session, then install wrangler.
        // This completely bypasses any need for root/sudo permissions.
        #[cfg(not(target_os = "windows"))]
        let install_cmd = concat!(
            "mkdir -p ~/.npm-global",
            " && npm config set prefix '~/.npm-global'",
            " && export PATH=~/.npm-global/bin:$PATH",
            " && npm install -g wrangler --silent",
        );

        #[cfg(target_os = "windows")]
        let install_cmd = "npm install -g wrangler --silent";

        emit_progress(&app, "Installing wrangler globally via npm…", 65);
        run_shell(install_cmd).await?;

        // Verify — also check the user-local bin path
        emit_progress(&app, "Verifying wrangler installation…", 85);
        if !is_available("wrangler").await {
            // wrangler might only be in ~/.npm-global/bin; check explicitly
            #[cfg(not(target_os = "windows"))]
            {
                let explicit_check = run_shell("~/.npm-global/bin/wrangler --version").await;
                if explicit_check.is_err() {
                    emit_progress(&app, "Error: wrangler is still not found after install.", 0);
                    return Err(SetupError::Command(
                        "wrangler was not found after npm install. \
                         Add ~/.npm-global/bin to your PATH and restart the app."
                            .into(),
                    ));
                }
            }
            #[cfg(target_os = "windows")]
            {
                emit_progress(&app, "Error: wrangler is still not found after install.", 0);
                return Err(SetupError::Command(
                    "wrangler was not found after npm install. You may need to restart the app."
                        .into(),
                ));
            }
        }

        emit_progress(&app, "Wrangler installed successfully!", 90);
    } else {
        emit_progress(&app, "Wrangler is already installed.", 90);
    }

    // ── 4. Done ────────────────────────────────────────────────────────
    emit_progress(&app, "All dependencies installed — you're all set!", 100);
    Ok(())
}
