// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{Menu, Submenu, PredefinedMenuItem, MenuItem};
use tauri::WebviewUrl;

struct PtyWriter(Arc<Mutex<Option<Box<dyn Write + Send>>>>);
struct PtyMaster(Arc<Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>>);

#[tauri::command]
fn write_to_pty(writer: tauri::State<PtyWriter>, data: String) {
    if let Ok(mut guard) = writer.0.lock() {
        if let Some(ref mut w) = *guard {
            let _ = w.write_all(data.as_bytes());
            let _ = w.flush();
        }
    }
}

#[tauri::command]
fn resize_pty(master: tauri::State<PtyMaster>, cols: u16, rows: u16) {
    if let Ok(guard) = master.0.lock() {
        if let Some(ref m) = *guard {
            let _ = m.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    }
}

#[tauri::command]
fn set_window_title(app: AppHandle, title: String) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&title);
    }
}

fn get_sidecar_path() -> Option<std::path::PathBuf> {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            #[cfg(target_os = "windows")]
            let sidecar_name = "mud-client.exe";
            #[cfg(not(target_os = "windows"))]
            let sidecar_name = "mud-client";

            let path = exe_dir.join(sidecar_name);
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

#[tauri::command]
fn spawn_pty(
    app: AppHandle,
    writer_state: tauri::State<PtyWriter>,
    master_state: tauri::State<PtyMaster>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sidecar_path = get_sidecar_path().ok_or("Failed to find sidecar binary")?;

    // Debug: print sidecar path
    eprintln!("[Tauri] Sidecar path: {:?}", sidecar_path);

    // Create PTY with the correct initial size
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Build command for the sidecar with --gui flag for JSON output mode
    let mut cmd = CommandBuilder::new(&sidecar_path);
    cmd.arg("--gui");
    cmd.env("TERM", "xterm-256color");

    eprintln!("[Tauri] Spawning with --gui flag");

    // Spawn the child process
    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    // Drop slave after spawning
    drop(pair.slave);

    // Get reader and writer from master
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get reader: {}", e))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get writer: {}", e))?;

    // Store state
    {
        let mut w = writer_state.0.lock().unwrap();
        *w = Some(writer);
    }
    {
        let mut m = master_state.0.lock().unwrap();
        *m = Some(pair.master);
    }

    // Read from PTY and emit to frontend
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit("pty-output", data);
                }
                Err(_) => break,
            }
        }
    });

    // Monitor child process
    thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

fn open_settings_window(app: &AppHandle) {
    // Check if settings window already exists
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_focus();
        return;
    }

    // Create new settings window
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("settings.html".into()),
    )
    .title("Settings")
    .inner_size(480.0, 580.0)
    .resizable(true)
    .minimizable(false)
    .center();

    if let Err(e) = builder.build() {
        eprintln!("Failed to create settings window: {}", e);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(PtyWriter(Arc::new(Mutex::new(None))))
        .manage(PtyMaster(Arc::new(Mutex::new(None))))
        .setup(|app| {
            // Create app menu with standard macOS items
            let settings_item = MenuItem::with_id(
                app,
                "settings",
                "Settings...",
                true,
                Some("CmdOrCtrl+,"),
            )?;

            let app_submenu = Submenu::with_items(
                app,
                "Twilite",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("About Twilite"), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &settings_item,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;

            let edit_submenu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;

            let window_submenu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?;

            let menu = Menu::with_items(app, &[&app_submenu, &edit_submenu, &window_submenu])?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "settings" {
                open_settings_window(app);
            }
        })
        .invoke_handler(tauri::generate_handler![write_to_pty, resize_pty, spawn_pty, set_window_title])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
