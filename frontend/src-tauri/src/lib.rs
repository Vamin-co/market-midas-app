mod menu;

use tauri::{Manager, Emitter};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus window if user attempts to open a second instance
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // Setup the menu
            let menu = menu::build_menu(app.handle())?;
            app.set_menu(menu)?;

            let window = app.get_webview_window("main").unwrap();

            // On macOS, enable the native traffic-light buttons but keep
            // the title bar hidden (titleBarStyle: "hiddenInset" equivalent).
            // The custom drag region in our React layout handles dragging.
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                window.set_title_bar_style(TitleBarStyle::Overlay).ok();
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "preferences" {
                // Emit an event to the frontend to handle navigation
                app.emit("navigate-settings", ()).unwrap_or_default();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Market Midas");
}
