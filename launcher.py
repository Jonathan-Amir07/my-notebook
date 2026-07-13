import subprocess
import sys
import time
import webbrowser
import os
import http.server
import socketserver
import threading
import socket

def is_port_in_use(port):
    """Checks if a local TCP port is already in use by trying to connect to it."""
    # Try connecting via IPv4 localhost
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        try:
            s.connect(('127.0.0.1', port))
            return True
        except OSError:
            pass
            
    # Try connecting via IPv6 localhost
    try:
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as s:
            s.settimeout(0.5)
            try:
                s.connect(('::1', port))
                return True
            except OSError:
                pass
    except OSError:
        pass
        
    return False

class CleanURLRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Translate the URL path to a local file system path
        translated = super().translate_path(path)
        
        # If the file does not exist, and it does not end in .html,
        # check if appending '.html' matches an existing file.
        if not os.path.exists(translated) and not translated.endswith('.html'):
            html_version = translated + '.html'
            if os.path.exists(html_version):
                return html_version
        return translated

class FrontendServer:
    def __init__(self, directory, port):
        self.directory = directory
        self.port = port
        self.httpd = None
        self.thread = None

    def start(self):
        # We need a closure/subclass to pass the directory parameter to the handler
        dir_to_serve = self.directory
        class CustomHandler(CleanURLRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=dir_to_serve, **kwargs)
                
        socketserver.TCPServer.allow_reuse_address = True
        self.httpd = socketserver.TCPServer(("", self.port), CustomHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        print(f"[Frontend Server] serving '{self.directory}' on port {self.port}...")

    def stop(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()
            print("[Frontend Server] stopped.")

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Start the Node.js backend if not already running
    backend_proc = None
    if is_port_in_use(5000):
        print("[API Server] Backend API server is already running on port 5000. Skipping start.")
    else:
        backend_dir = os.path.join(base_dir, "back-end")
        print("[API Server] Starting Backend API server (http://localhost:5000)...")
        backend_proc = subprocess.Popen(
            ["node", "server.js"],
            cwd=backend_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            shell=True if os.name == 'nt' else False
        )
    
    # 2. Start the python HTTP server for the frontend (with clean URLs support)
    frontend_dir = os.path.join(base_dir, "front-end")
    frontend_server = FrontendServer(frontend_dir, 3000)
    frontend_server.start()
    
    # 3. Wait a moment for servers to initialize, then open browser
    time.sleep(1.5)
    print("[Browser] Opening http://localhost:3000 in your browser...")
    webbrowser.open("http://localhost:3000")
    
    print("\nAcademic Notebook is up and running!")
    print("---------------------------------------------------")
    print("Keep this terminal window open to keep the servers running.")
    print("Press Ctrl+C in this window to stop both servers.")
    print("---------------------------------------------------")
    
    try:
        while True:
            # Check if backend server died (only if we started it)
            if backend_proc and backend_proc.poll() is not None:
                print("[Warning] Backend API server stopped unexpectedly.")
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping servers...")
    finally:
        # Stop backend server if we started it
        if backend_proc:
            backend_proc.terminate()
            try:
                backend_proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                backend_proc.kill()
        frontend_server.stop()
        print("Goodbye!")

if __name__ == "__main__":
    main()
