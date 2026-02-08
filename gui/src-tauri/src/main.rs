// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{Menu, Submenu, PredefinedMenuItem, MenuItem};
use tauri::WebviewUrl;
use tauri::webview::WebviewWindowBuilder;
use uuid::Uuid;

/// Holds the writer and master for a single PTY instance
struct PtyInstance {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

/// Registry of all PTY instances, keyed by window label
struct PtyRegistry(Mutex<HashMap<String, PtyInstance>>);

#[tauri::command]
fn write_to_pty(registry: tauri::State<PtyRegistry>, window_id: String, data: String) {
    if let Ok(mut guard) = registry.0.lock() {
        if let Some(pty) = guard.get_mut(&window_id) {
            let _ = pty.writer.write_all(data.as_bytes());
            let _ = pty.writer.flush();
        }
    }
}

#[tauri::command]
fn resize_pty(registry: tauri::State<PtyRegistry>, window_id: String, cols: u16, rows: u16) {
    if let Ok(guard) = registry.0.lock() {
        if let Some(pty) = guard.get(&window_id) {
            let _ = pty.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    }
}

#[tauri::command]
fn set_window_title(app: AppHandle, window_id: String, title: String) {
    if let Some(window) = app.get_webview_window(&window_id) {
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
    registry: tauri::State<PtyRegistry>,
    window_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sidecar_path = get_sidecar_path().ok_or("Failed to find sidecar binary")?;

    // Debug: print sidecar path
    eprintln!("[Tauri] Sidecar path: {:?}", sidecar_path);
    eprintln!("[Tauri] Window ID: {}", window_id);

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

    // Store PTY instance in registry
    {
        let mut reg = registry.0.lock().unwrap();
        reg.insert(window_id.clone(), PtyInstance {
            writer,
            master: pair.master,
        });
    }

    // Read from PTY and emit to frontend (window-specific event)
    let app_handle = app.clone();
    let event_name = format!("pty-output-{}", window_id);
    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_handle.emit(&event_name, data);
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

/// Remove a PTY instance from the registry (cleanup on window close)
#[tauri::command]
fn destroy_pty(registry: tauri::State<PtyRegistry>, window_id: String) {
    if let Ok(mut guard) = registry.0.lock() {
        guard.remove(&window_id);
        eprintln!("[Tauri] Destroyed PTY for window: {}", window_id);
    }
}

/// Create a new main window with its own PTY
#[tauri::command]
fn create_new_window(app: AppHandle) -> Result<String, String> {
    let label = format!("main-{}", Uuid::new_v4());

    let mut builder = WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::App("index.html".into()),
    )
    .title("Twilite")
    .inner_size(1024.0, 768.0)
    .min_inner_size(640.0, 480.0)
    .resizable(true);

    // macOS-specific: overlay titlebar style
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    builder.build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    eprintln!("[Tauri] Created new window: {}", label);
    Ok(label)
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
    .inner_size(720.0, 820.0)
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(PtyRegistry(Mutex::new(HashMap::new())))
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

            let new_window_item = MenuItem::with_id(
                app,
                "new_window",
                "New Window",
                true,
                Some("CmdOrCtrl+N"),
            )?;

            let window_submenu = Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &new_window_item,
                    &PredefinedMenuItem::separator(app)?,
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
            match event.id().as_ref() {
                "settings" => {
                    open_settings_window(app);
                }
                "new_window" => {
                    let label = format!("main-{}", Uuid::new_v4());
                    let mut builder = WebviewWindowBuilder::new(
                        app,
                        &label,
                        WebviewUrl::App("index.html".into()),
                    )
                    .title("Twilite")
                    .inner_size(1024.0, 768.0)
                    .min_inner_size(640.0, 480.0)
                    .resizable(true);

                    // macOS-specific: overlay titlebar style
                    #[cfg(target_os = "macos")]
                    {
                        builder = builder
                            .title_bar_style(tauri::TitleBarStyle::Overlay)
                            .hidden_title(true);
                    }

                    if let Err(e) = builder.build() {
                        eprintln!("Failed to create new window: {}", e);
                    } else {
                        eprintln!("[Tauri] Created new window from menu: {}", label);
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            write_to_pty,
            resize_pty,
            spawn_pty,
            set_window_title,
            destroy_pty,
            create_new_window
        ])
        .on_window_event(|window, event| {
            // Clean up PTY when window is destroyed
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                if let Some(registry) = window.try_state::<PtyRegistry>() {
                    if let Ok(mut guard) = registry.0.lock() {
                        if guard.remove(&label).is_some() {
                            eprintln!("[Tauri] Cleaned up PTY for destroyed window: {}", label);
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
