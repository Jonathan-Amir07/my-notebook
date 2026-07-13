import os
import sys
import struct
import subprocess
from pathlib import Path

def png_to_ico(png_path, ico_path):
    """Converts a PNG file to Windows ICO format without third-party libraries."""
    try:
        with open(png_path, 'rb') as f:
            png_data = f.read()
        
        if not png_data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError("Source file is not a valid PNG image.")
            
        # Parse PNG dimensions from IHDR chunk
        if png_data[12:16] == b'IHDR':
            w, h = struct.unpack('>II', png_data[16:24])
        else:
            w, h = 192, 192
            
        ico_w = 0 if w >= 256 else w
        ico_h = 0 if h >= 256 else h
        
        # ICO Header: Reserved (0), Type (1 = Icon), Count (1)
        ico_header = struct.pack('<HHH', 0, 1, 1)
        
        # Directory Entry:
        # Width (1), Height (1), Colors (1), Reserved (1), Planes (2), BPP (2), Size (4), Offset (4)
        entry = struct.pack('<BBBBHHII', ico_w, ico_h, 0, 0, 1, 32, len(png_data), 22)
        
        with open(ico_path, 'wb') as f:
            f.write(ico_header)
            f.write(entry)
            f.write(png_data)
            
        print(f"Created ICO icon at: {ico_path}")
        return True
    except Exception as e:
        print(f"Failed to convert PNG to ICO: {e}", file=sys.stderr)
        return False

def setup_shortcut():
    BASE_DIR = Path(__file__).parent.resolve()
    assets_dir = BASE_DIR / "front-end" / "assets"
    
    # Source PNG file
    png_path = assets_dir / "icon-192.png"
    if not png_path.exists():
        png_path = assets_dir / "icon-512.png"
        
    ico_path = assets_dir / "logo.ico"
    
    # Generate ICO file if PNG exists
    if png_path.exists():
        png_to_ico(png_path, ico_path)
    else:
        print(f"Warning: Logo PNG not found at {png_path}. Cannot create custom logo icon.", file=sys.stderr)
        ico_path = None
        
    # We use PowerShell to create the shortcut file on the user's Desktop
    try:
        launcher_script = BASE_DIR / "launcher.py"
        
        # Build powershell command to create a shortcut (.lnk) pointing to python running launcher.py
        ps_cmd = f"""
        $desktop = [Environment]::GetFolderPath("Desktop")
        $WshShell = New-Object -ComObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("$desktop\\Academic Notebook.lnk")
        $Shortcut.TargetPath = "python.exe"
        $Shortcut.Arguments = "`"{launcher_script}`""
        $Shortcut.WorkingDirectory = "`"{BASE_DIR}`""
        $Shortcut.Description = "Launch Academic Notebook"
        """
        
        if ico_path and ico_path.exists():
            ps_cmd += f'\n$Shortcut.IconLocation = "{ico_path}"'
            
        ps_cmd += "\n$Shortcut.Save()"
        
        # Execute the PowerShell command
        subprocess.run(
            ["powershell", "-Command", ps_cmd],
            capture_output=True,
            text=True,
            check=True
        )
        print("Successfully created 'Academic Notebook' shortcut on your Desktop with the custom logo!")
        return True
    except Exception as e:
        print(f"Error creating desktop shortcut: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    setup_shortcut()
