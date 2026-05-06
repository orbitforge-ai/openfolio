use serde::{Deserialize, Serialize};
use std::{fs, io, path::PathBuf, time::UNIX_EPOCH};

#[derive(Serialize)]
struct OpenPdfResult {
    path: String,
    name: String,
    bytes: Vec<u8>,
    size: u64,
    modified: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RecentFile {
    path: String,
    name: String,
    opened_at: u64,
}

#[tauri::command]
fn open_pdf(path: String) -> Result<OpenPdfResult, String> {
    let path_buf = PathBuf::from(&path);
    let bytes = fs::read(&path_buf).map_err(|error| format!("Could not read PDF: {error}"))?;
    let metadata = fs::metadata(&path_buf).map_err(|error| format!("Could not inspect PDF: {error}"))?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());
    let name = path_buf
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("document.pdf")
        .to_string();

    Ok(OpenPdfResult {
        path,
        name,
        bytes,
        size: metadata.len(),
        modified,
    })
}

#[tauri::command]
fn save_pdf(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(path, bytes).map_err(|error| format!("Could not save PDF: {error}"))
}

#[tauri::command]
fn get_recent_files() -> Result<Vec<RecentFile>, String> {
    read_recent_files().map_err(|error| format!("Could not load recent files: {error}"))
}

#[tauri::command]
fn set_recent_file(path: String, name: String) -> Result<(), String> {
    let mut files = read_recent_files().unwrap_or_default();
    files.retain(|file| file.path != path);
    files.insert(
        0,
        RecentFile {
            path,
            name,
            opened_at: now_seconds(),
        },
    );
    files.truncate(10);
    write_recent_files(&files).map_err(|error| format!("Could not store recent file: {error}"))
}

fn recent_path() -> io::Result<PathBuf> {
    let path = recent_path_for_app("Openfolio")?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    Ok(path)
}

fn legacy_recent_path() -> io::Result<PathBuf> {
    recent_path_for_app("PDF Forge")
}

fn recent_path_for_app(app_name: &str) -> io::Result<PathBuf> {
    let base = dirs::data_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "No data directory available"))?;
    Ok(base.join(app_name).join("recent.json"))
}

fn read_recent_files() -> io::Result<Vec<RecentFile>> {
    let path = recent_path()?;
    let path = if path.exists() {
        path
    } else {
        let legacy_path = legacy_recent_path()?;
        if !legacy_path.exists() {
            return Ok(Vec::new());
        }
        legacy_path
    };

    if !path.exists() {
        return Ok(Vec::new());
    }

    let bytes = fs::read(path)?;
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

fn write_recent_files(files: &[RecentFile]) -> io::Result<()> {
    let path = recent_path()?;
    let bytes = serde_json::to_vec_pretty(files)?;
    fs::write(path, bytes)
}

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_pdf,
            save_pdf,
            get_recent_files,
            set_recent_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
