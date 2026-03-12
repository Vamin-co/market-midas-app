use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Wry};

pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    // ---------------------------------------------------------------------
    // 1. App Menu (Market Midas)
    // ---------------------------------------------------------------------
    let about = PredefinedMenuItem::about(app, None, None)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    
    // Custom Preferences item with Cmd+, shortcut
    let prefs = MenuItem::with_id(
        app,
        "preferences",
        "Preferences...",
        true,
        Some("CmdOrCtrl+,"),
    )?;

    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, None)?;

    let app_submenu = Submenu::with_items(
        app,
        "Market Midas",
        true,
        &[&about, &sep1, &prefs, &sep2, &quit],
    )?;

    // ---------------------------------------------------------------------
    // 2. Edit Menu (Standard needed for auth inputs and text fields)
    // ---------------------------------------------------------------------
    let cut = PredefinedMenuItem::cut(app, None)?;
    let copy = PredefinedMenuItem::copy(app, None)?;
    let paste = PredefinedMenuItem::paste(app, None)?;
    let select_all = PredefinedMenuItem::select_all(app, None)?;

    let edit_submenu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&cut, &copy, &paste, &select_all],
    )?;

    // Assemble final menu
    Menu::with_items(app, &[&app_submenu, &edit_submenu])
}
