use std::io;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::{Manager, RunEvent};

struct SidecarState(Mutex<Option<Child>>);

fn ml_backend_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .expect("desktop package root")
        .join("ml-backend")
}

fn spawn_python_sidecar(backend_dir: &PathBuf) -> io::Result<Child> {
    let uvicorn_args = [
        "-m",
        "uvicorn",
        "main:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8731",
    ];

    match Command::new("python")
        .args(uvicorn_args)
        .current_dir(backend_dir)
        .spawn()
    {
        Ok(child) => Ok(child),
        Err(_) => Command::new("py")
            .args(["-3.11"])
            .args(uvicorn_args)
            .current_dir(backend_dir)
            .spawn(),
    }
}

fn start_sidecar() -> io::Result<Child> {
    let backend_dir = ml_backend_dir();
    if !backend_dir.exists() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            format!("ml-backend directory not found at {}", backend_dir.display()),
        ));
    }
    spawn_python_sidecar(&backend_dir)
}

fn stop_sidecar(state: &SidecarState) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                match start_sidecar() {
                    Ok(child) => {
                        app.manage(SidecarState(Mutex::new(Some(child))));
                        eprintln!("Dirt Signal: FastAPI sidecar started on port 8731");
                    }
                    Err(err) => {
                        eprintln!(
                            "Dirt Signal: failed to start FastAPI sidecar: {err}. \
                             Start manually: cd ml-backend && uvicorn main:app --port 8731"
                        );
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                #[cfg(debug_assertions)]
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    stop_sidecar(&state);
                    eprintln!("Dirt Signal: FastAPI sidecar stopped");
                }
            }
        });
}
